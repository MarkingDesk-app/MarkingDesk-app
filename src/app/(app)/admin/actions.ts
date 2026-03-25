"use server";

import { Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { inviteUser } from "@/lib/user-invitations";
import { prisma } from "@/lib/prisma";

type ActionResult =
  | {
      ok: true;
      message?: string;
    }
  | {
      ok: false;
      error: string;
    };

async function assertAdminAccess() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || session.user.role !== Role.ADMIN) {
    throw new Error("Unauthorized");
  }

  return session;
}

async function ensureModuleHasAnotherLeader(moduleId: string, excludedUserId: string) {
  const otherLeader = await prisma.moduleMembership.findFirst({
    where: {
      moduleId,
      active: true,
      isLeader: true,
      NOT: {
        userId: excludedUserId,
      },
    },
    select: { id: true },
  });

  if (!otherLeader) {
    throw new Error("Each module must keep at least one active module leader.");
  }
}

export async function inviteUserAction(input: {
  name: string;
  email: string;
}): Promise<ActionResult> {
  try {
    const session = await assertAdminAccess();

    await inviteUser({
      name: input.name,
      email: input.email,
      invitedByName: session.user.name ?? session.user.email ?? "An administrator",
    });

    revalidatePath("/admin");

    return { ok: true, message: "Invitation sent." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to send invitation.",
    };
  }
}

export async function saveMembershipAction(input: {
  userId: string;
  moduleId: string;
  isLeader: boolean;
}): Promise<ActionResult> {
  try {
    await assertAdminAccess();

    const userId = input.userId.trim();
    const moduleId = input.moduleId.trim();

    if (!userId || !moduleId) {
      return { ok: false, error: "User and module are required." };
    }

    const existingMembership = await prisma.moduleMembership.findUnique({
      where: {
        userId_moduleId: {
          userId,
          moduleId,
        },
      },
      select: {
        active: true,
        isLeader: true,
      },
    });

    if (existingMembership?.active && existingMembership.isLeader && !input.isLeader) {
      await ensureModuleHasAnotherLeader(moduleId, userId);
    }

    await prisma.moduleMembership.upsert({
      where: {
        userId_moduleId: {
          userId,
          moduleId,
        },
      },
      update: {
        active: true,
        isLeader: input.isLeader,
      },
      create: {
        userId,
        moduleId,
        active: true,
        isLeader: input.isLeader,
      },
    });

    revalidatePath("/admin");
    revalidatePath("/dashboard");
    revalidatePath(`/modules/${moduleId}`);

    return { ok: true, message: "Membership saved." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save membership.",
    };
  }
}

export async function toggleMembershipAction(input: {
  membershipId: string;
  nextActive: boolean;
}): Promise<ActionResult> {
  try {
    await assertAdminAccess();

    const membershipId = input.membershipId.trim();

    if (!membershipId) {
      return { ok: false, error: "Membership id is required." };
    }

    const currentMembership = await prisma.moduleMembership.findUnique({
      where: { id: membershipId },
      select: {
        userId: true,
        moduleId: true,
        active: true,
        isLeader: true,
      },
    });

    if (!currentMembership) {
      return { ok: false, error: "Membership not found." };
    }

    if (!input.nextActive && currentMembership.active && currentMembership.isLeader) {
      await ensureModuleHasAnotherLeader(currentMembership.moduleId, currentMembership.userId);
    }

    const membership = await prisma.moduleMembership.update({
      where: { id: membershipId },
      data: { active: input.nextActive },
      select: { moduleId: true },
    });

    revalidatePath("/admin");
    revalidatePath("/dashboard");
    revalidatePath(`/modules/${membership.moduleId}`);

    return { ok: true, message: input.nextActive ? "Membership reactivated." : "Membership deactivated." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to update membership.",
    };
  }
}
