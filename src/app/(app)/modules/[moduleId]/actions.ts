"use server";

import { ModuleRole, Role } from "@prisma/client";
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

function parseDateTimeInput(value: string): Date | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function assertModuleManager(moduleId: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("You must be signed in.");
  }

  if (session.user.role === Role.ADMIN) {
    return session;
  }

  const membership = await prisma.moduleMembership.findFirst({
    where: {
      moduleId,
      userId: session.user.id,
      role: ModuleRole.MODULE_LEADER,
      active: true,
    },
    select: { id: true },
  });

  if (!membership) {
    throw new Error("Only module leaders can update this module.");
  }

  return session;
}

export async function createAssessmentAction(input: {
  moduleId: string;
  name: string;
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const name = input.name.trim();

    if (!moduleId || !name) {
      return { ok: false, error: "Assessment name is required." };
    }

    await assertModuleManager(moduleId);

    await prisma.assessmentTemplate.upsert({
      where: {
        moduleId_name: {
          moduleId,
          name,
        },
      },
      update: {},
      create: {
        moduleId,
        name,
      },
    });

    revalidatePath(`/modules/${moduleId}`);
    revalidatePath("/dashboard");

    return { ok: true, message: "Assessment saved." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save assessment.",
    };
  }
}

export async function createAcademicYearAction(input: {
  moduleId: string;
  assessmentTemplateId: string;
  academicYear: string;
  opensAt?: string;
  dueAt: string;
  markingDeadlineAt: string;
  moderatorUserId?: string;
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const assessmentTemplateId = input.assessmentTemplateId.trim();
    const academicYear = input.academicYear.trim();
    const opensAt = parseDateTimeInput(input.opensAt ?? "");
    const dueAt = parseDateTimeInput(input.dueAt);
    const markingDeadlineAt = parseDateTimeInput(input.markingDeadlineAt);
    const moderatorUserId = input.moderatorUserId?.trim() || null;

    if (!moduleId || !assessmentTemplateId || !academicYear) {
      return { ok: false, error: "Assessment and academic year are required." };
    }

    if (!dueAt || !markingDeadlineAt) {
      return { ok: false, error: "Due date and marking deadline are required." };
    }

    if (markingDeadlineAt < dueAt) {
      return { ok: false, error: "Marking deadline cannot be earlier than the due date." };
    }

    await assertModuleManager(moduleId);

    const template = await prisma.assessmentTemplate.findUnique({
      where: { id: assessmentTemplateId },
      select: { id: true, moduleId: true },
    });

    if (!template || template.moduleId !== moduleId) {
      return { ok: false, error: "Assessment does not belong to this module." };
    }

    if (moderatorUserId) {
      const moderatorMembership = await prisma.moduleMembership.findFirst({
        where: {
          moduleId,
          userId: moderatorUserId,
          role: ModuleRole.MODERATOR,
          active: true,
        },
        select: { id: true },
      });

      if (!moderatorMembership) {
        return { ok: false, error: "Select an active moderator from the module team." };
      }
    }

    await prisma.assessmentInstance.upsert({
      where: {
        assessmentTemplateId_academicYear: {
          assessmentTemplateId,
          academicYear,
        },
      },
      update: {
        opensAt,
        dueAt,
        markingDeadlineAt,
        moderatorUserId,
      },
      create: {
        assessmentTemplateId,
        academicYear,
        opensAt,
        dueAt,
        markingDeadlineAt,
        moderatorUserId,
      },
    });

    revalidatePath(`/modules/${moduleId}`);
    revalidatePath("/dashboard");

    return { ok: true, message: "Academic year saved." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save the academic year.",
    };
  }
}

export async function saveModuleMembershipAction(input: {
  moduleId: string;
  userId: string;
  role: ModuleRole;
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const userId = input.userId.trim();
    const role = input.role;

    if (!moduleId || !userId || !role) {
      return { ok: false, error: "User and role are required." };
    }

    await assertModuleManager(moduleId);

    await prisma.moduleMembership.upsert({
      where: {
        userId_moduleId_role: {
          userId,
          moduleId,
          role,
        },
      },
      update: { active: true },
      create: {
        userId,
        moduleId,
        role,
        active: true,
      },
    });

    revalidatePath(`/modules/${moduleId}`);
    revalidatePath("/dashboard");
    revalidatePath("/admin");

    return { ok: true, message: "Team member saved." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to update the module team.",
    };
  }
}

export async function deactivateModuleMembershipAction(input: {
  moduleId: string;
  membershipId: string;
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const membershipId = input.membershipId.trim();

    if (!moduleId || !membershipId) {
      return { ok: false, error: "Team member details are missing." };
    }

    await assertModuleManager(moduleId);

    await prisma.moduleMembership.update({
      where: { id: membershipId },
      data: { active: false },
    });

    revalidatePath(`/modules/${moduleId}`);
    revalidatePath("/dashboard");
    revalidatePath("/admin");

    return { ok: true, message: "Team member removed." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to remove the team member.",
    };
  }
}
