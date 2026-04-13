"use server";

import { Role } from "@prisma/client";
import { revalidatePath, revalidateTag } from "next/cache";
import { getServerSession } from "next-auth";

import {
  assertUsersExist,
  deactivateAssessmentMarkerAssignment,
  normalizeUserIds,
  replaceAssessmentMarkerAssignments,
  saveAssessmentMarkerAssignment,
} from "@/lib/assessment-team";
import { authOptions } from "@/lib/auth";
import { getModuleArchivedAssessmentsTag } from "@/lib/cache-tags";
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

function parseDateTimeInput(value: string): Date | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function getModuleManagementSession(moduleId: string) {
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
      active: true,
      isLeader: true,
    },
    select: { id: true },
  });

  if (!membership) {
    throw new Error("Only module leaders can update this module.");
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

async function getAssessmentTemplateForModule(moduleId: string, assessmentTemplateId: string) {
  const template = await prisma.assessmentTemplate.findUnique({
    where: { id: assessmentTemplateId },
    select: {
      id: true,
      moduleId: true,
      name: true,
      isArchived: true,
      archivedAt: true,
      assessmentInstances: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!template || template.moduleId !== moduleId) {
    throw new Error("Assessment does not belong to this module.");
  }

  return template;
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

    await getModuleManagementSession(moduleId);

    const existingAssessment = await prisma.assessmentTemplate.findUnique({
      where: {
        moduleId_name: {
          moduleId,
          name,
        },
      },
      select: {
        id: true,
        isArchived: true,
      },
    });

    if (existingAssessment?.isArchived) {
      return { ok: false, error: "An archived assessment with this name already exists." };
    }

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

    return { ok: true, message: "Assessment created. Add an academic year to finish setup." };
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
  dueAt: string;
  markingDeadlineAt: string;
  moderatorUserId?: string;
  markerUserIds: string[];
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const assessmentTemplateId = input.assessmentTemplateId.trim();
    const academicYear = input.academicYear.trim();
    const dueAt = parseDateTimeInput(input.dueAt);
    const markingDeadlineAt = parseDateTimeInput(input.markingDeadlineAt);
    const moderatorUserId = input.moderatorUserId?.trim() || null;
    const markerUserIds = normalizeUserIds(input.markerUserIds);

    if (!moduleId || !assessmentTemplateId || !academicYear) {
      return { ok: false, error: "Assessment and academic year are required." };
    }

    if (!dueAt || !markingDeadlineAt) {
      return { ok: false, error: "Due date and marking deadline are required." };
    }

    if (markingDeadlineAt < dueAt) {
      return { ok: false, error: "Marking deadline cannot be earlier than the due date." };
    }

    await getModuleManagementSession(moduleId);

    const template = await getAssessmentTemplateForModule(moduleId, assessmentTemplateId);

    if (template.isArchived) {
      return { ok: false, error: "Archived assessments cannot be edited." };
    }

    if (moderatorUserId) {
      await assertUsersExist([moderatorUserId]);
    }

    const assessmentInstance = await prisma.assessmentInstance.upsert({
      where: {
        assessmentTemplateId_academicYear: {
          assessmentTemplateId,
          academicYear,
        },
      },
      update: {
        dueAt,
        markingDeadlineAt,
        moderatorUserId,
      },
      create: {
        assessmentTemplateId,
        academicYear,
        dueAt,
        markingDeadlineAt,
        moderatorUserId,
      },
      select: { id: true },
    });

    await replaceAssessmentMarkerAssignments({
      assessmentId: assessmentInstance.id,
      markerUserIds,
    });

    revalidatePath(`/modules/${moduleId}`);
    revalidatePath(`/modules/${moduleId}/assessments/${assessmentInstance.id}`);
    revalidatePath("/dashboard");

    return { ok: true, message: "Academic year saved." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save the academic year.",
    };
  }
}

export async function archiveAssessmentAction(input: {
  moduleId: string;
  assessmentTemplateId: string;
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const assessmentTemplateId = input.assessmentTemplateId.trim();

    if (!moduleId || !assessmentTemplateId) {
      return { ok: false, error: "Assessment details are required." };
    }

    const session = await getModuleManagementSession(moduleId);
    const template = await getAssessmentTemplateForModule(moduleId, assessmentTemplateId);

    if (template.isArchived) {
      return { ok: true, message: "Assessment already archived." };
    }

    const archivedAt = new Date();

    await prisma.assessmentTemplate.update({
      where: { id: assessmentTemplateId },
      data: {
        isArchived: true,
        archivedAt,
        archivedByUserId: session.user.id,
      },
    });

    revalidatePath(`/modules/${moduleId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/timeline");
    revalidateTag(getModuleArchivedAssessmentsTag(moduleId), "max");
    for (const assessmentInstance of template.assessmentInstances) {
      revalidatePath(`/modules/${moduleId}/assessments/${assessmentInstance.id}`);
    }

    return { ok: true, message: "Assessment archived." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to archive the assessment.",
    };
  }
}

export async function saveModuleMembershipAction(input: {
  moduleId: string;
  userId: string;
  isLeader: boolean;
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const userId = input.userId.trim();

    if (!moduleId || !userId) {
      return { ok: false, error: "A user is required." };
    }

    await getModuleManagementSession(moduleId);

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

    await getModuleManagementSession(moduleId);

    const membership = await prisma.moduleMembership.findUnique({
      where: { id: membershipId },
      select: {
        id: true,
        moduleId: true,
        userId: true,
        active: true,
        isLeader: true,
      },
    });

    if (!membership || membership.moduleId !== moduleId) {
      return { ok: false, error: "Team member details are missing." };
    }

    if (membership.active && membership.isLeader) {
      await ensureModuleHasAnotherLeader(moduleId, membership.userId);
    }

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

export async function inviteModuleUserAction(input: {
  moduleId: string;
  name: string;
  email: string;
  isLeader: boolean;
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const name = input.name.trim();
    const email = input.email.trim();
    const session = await getModuleManagementSession(moduleId);

    const invited = await inviteUser({
      name,
      email,
      invitedByName: session.user.name ?? session.user.email ?? "A MarkingDesk user",
    });

    await prisma.moduleMembership.upsert({
      where: {
        userId_moduleId: {
          userId: invited.userId,
          moduleId,
        },
      },
      update: {
        active: true,
        isLeader: input.isLeader,
      },
      create: {
        userId: invited.userId,
        moduleId,
        active: true,
        isLeader: input.isLeader,
      },
    });

    revalidatePath(`/modules/${moduleId}`);
    revalidatePath("/admin");

    return { ok: true, message: "Invitation sent and team membership added." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to send invitation.",
    };
  }
}

export async function saveAssessmentMarkerAction(input: {
  moduleId: string;
  assessmentId: string;
  userId: string;
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const assessmentId = input.assessmentId.trim();
    const userId = input.userId.trim();

    if (!moduleId || !assessmentId || !userId) {
      return { ok: false, error: "Assessment and user are required." };
    }

    await getModuleManagementSession(moduleId);

    const assessment = await prisma.assessmentInstance.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        assessmentTemplate: {
          select: {
            moduleId: true,
            isArchived: true,
          },
        },
      },
    });

    if (!assessment || assessment.assessmentTemplate.moduleId !== moduleId) {
      return { ok: false, error: "Assessment not found." };
    }

    if (assessment.assessmentTemplate.isArchived) {
      return { ok: false, error: "Archived assessments cannot be edited." };
    }

    await saveAssessmentMarkerAssignment({
      assessmentId,
      userId,
    });

    revalidatePath(`/modules/${moduleId}`);
    revalidatePath(`/modules/${moduleId}/assessments/${assessmentId}`);
    revalidatePath("/dashboard");

    return { ok: true, message: "Marker added to the assessment team." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save the assessment team.",
    };
  }
}

export async function deactivateAssessmentMarkerAction(input: {
  moduleId: string;
  assessmentId: string;
  userId: string;
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const assessmentId = input.assessmentId.trim();
    const userId = input.userId.trim();

    if (!moduleId || !assessmentId || !userId) {
      return { ok: false, error: "Assessment and user are required." };
    }

    await getModuleManagementSession(moduleId);

    const assessment = await prisma.assessmentInstance.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        assessmentTemplate: {
          select: {
            moduleId: true,
            isArchived: true,
          },
        },
      },
    });

    if (!assessment || assessment.assessmentTemplate.moduleId !== moduleId) {
      return { ok: false, error: "Assessment not found." };
    }

    if (assessment.assessmentTemplate.isArchived) {
      return { ok: false, error: "Archived assessments cannot be edited." };
    }

    await deactivateAssessmentMarkerAssignment({
      assessmentId,
      userId,
    });

    revalidatePath(`/modules/${moduleId}`);
    revalidatePath(`/modules/${moduleId}/assessments/${assessmentId}`);
    revalidatePath("/dashboard");

    return { ok: true, message: "Marker removed from the assessment team." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to update the assessment team.",
    };
  }
}

export async function inviteAssessmentMarkerAction(input: {
  moduleId: string;
  assessmentId: string;
  name: string;
  email: string;
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const assessmentId = input.assessmentId.trim();
    const name = input.name.trim();
    const email = input.email.trim();
    const session = await getModuleManagementSession(moduleId);

    const assessment = await prisma.assessmentInstance.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        assessmentTemplate: {
          select: {
            moduleId: true,
            isArchived: true,
          },
        },
      },
    });

    if (!assessment || assessment.assessmentTemplate.moduleId !== moduleId) {
      return { ok: false, error: "Assessment not found." };
    }

    if (assessment.assessmentTemplate.isArchived) {
      return { ok: false, error: "Archived assessments cannot be edited." };
    }

    const invited = await inviteUser({
      name,
      email,
      invitedByName: session.user.name ?? session.user.email ?? "A MarkingDesk user",
    });

    await saveAssessmentMarkerAssignment({
      assessmentId,
      userId: invited.userId,
    });

    revalidatePath(`/modules/${moduleId}`);
    revalidatePath(`/modules/${moduleId}/assessments/${assessmentId}`);
    revalidatePath("/dashboard");

    return { ok: true, message: "Invitation sent and marker added to the assessment team." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to invite the marker.",
    };
  }
}
