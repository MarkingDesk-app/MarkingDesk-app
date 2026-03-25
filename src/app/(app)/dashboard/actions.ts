"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
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

async function requireAuthenticatedUser() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("You must be signed in.");
  }

  return session;
}

export async function createModuleAction(input: {
  code: string;
  title: string;
  leaderUserIds: string[];
}): Promise<ActionResult> {
  try {
    const session = await requireAuthenticatedUser();
    const code = input.code.trim().toUpperCase();
    const title = input.title.trim();
    const leaderUserIds = Array.from(new Set(input.leaderUserIds.map((id) => id.trim()).filter(Boolean)));

    if (!code || !title) {
      return { ok: false, error: "Module code and title are required." };
    }

    if (leaderUserIds.length === 0) {
      return { ok: false, error: "Select at least one module leader." };
    }

    const existingModule = await prisma.module.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existingModule) {
      return { ok: false, error: "A module with this code already exists." };
    }

    const users = await prisma.user.findMany({
      where: {
        id: { in: leaderUserIds },
      },
      select: { id: true },
    });

    if (users.length !== leaderUserIds.length) {
      return { ok: false, error: "One or more selected leaders could not be found." };
    }

    const creatorShouldBeLeader = leaderUserIds.includes(session.user.id);
    const membershipIds = Array.from(new Set([session.user.id, ...leaderUserIds]));

    const moduleRecord = await prisma.module.create({
      data: {
        code,
        title,
      },
      select: { id: true },
    });

    await prisma.moduleMembership.createMany({
      data: membershipIds.map((userId) => ({
        userId,
        moduleId: moduleRecord.id,
        active: true,
        isLeader: leaderUserIds.includes(userId) || (userId === session.user.id && creatorShouldBeLeader),
      })),
      skipDuplicates: true,
    });

    revalidatePath("/dashboard");
    revalidatePath(`/modules/${moduleRecord.id}`);
    revalidatePath("/admin");

    return { ok: true, message: "Module created." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to create module.",
    };
  }
}
