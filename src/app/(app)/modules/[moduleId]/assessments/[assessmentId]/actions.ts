"use server";

import {
  AuditAction,
  ModerationStatus,
  ReviewFlagStatus,
  Role,
  ScriptStatus,
  SubmissionType,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";

import {
  buildBalancedAssignments,
  buildTurnitinSubmissionUrl,
  extractTurnitinIds,
  findDuplicateIds,
  formatModerationStatus,
  formatReviewFlagStatus,
  isReviewFlagResolved,
} from "@/lib/assessment-utils";
import {
  assertUsersExist,
  normalizeUserIds,
  replaceAssessmentMarkerAssignments,
} from "@/lib/assessment-team";
import { authOptions } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { sendEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

type ActionResult<T = undefined> =
  | {
      ok: true;
      message?: string;
      data?: T;
    }
  | {
      ok: false;
      error: string;
      data?: T;
    };

type AssessmentContext = {
  sessionUserId: string;
  sessionUserName: string | null;
  sessionUserEmail: string | null;
  moduleId: string;
  assessmentId: string;
  isAdmin: boolean;
  isModuleLeader: boolean;
  isAssessmentMarker: boolean;
  isAssignedModerator: boolean;
};

function parseDateTimeInput(value: string): Date | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function getAssessmentContext(moduleId: string, assessmentId: string): Promise<AssessmentContext> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("You must be signed in.");
  }

  const assessment = await prisma.assessmentInstance.findUnique({
    where: { id: assessmentId },
    select: {
      id: true,
      moderatorUserId: true,
      assessmentTemplate: {
        select: {
          moduleId: true,
        },
      },
    },
  });

  if (!assessment || assessment.assessmentTemplate.moduleId !== moduleId) {
    throw new Error("Assessment not found.");
  }

  const isAdmin = session.user.role === Role.ADMIN;

  if (isAdmin) {
    return {
      sessionUserId: session.user.id,
      sessionUserName: session.user.name ?? null,
      sessionUserEmail: session.user.email ?? null,
      moduleId,
      assessmentId,
      isAdmin: true,
      isModuleLeader: true,
      isAssessmentMarker: true,
      isAssignedModerator: true,
    };
  }

  const memberships = await prisma.moduleMembership.findMany({
    where: {
      moduleId,
      userId: session.user.id,
      active: true,
    },
    select: { isLeader: true },
  });

  const isModuleLeader = memberships.some((membership) => membership.isLeader);
  const isAssessmentMarker = Boolean(
    await prisma.assessmentMarker.findFirst({
      where: {
        assessmentInstanceId: assessmentId,
        userId: session.user.id,
        active: true,
      },
      select: { id: true },
    })
  );
  const isAssignedModerator = assessment.moderatorUserId === session.user.id;

  if (!isModuleLeader && !isAssessmentMarker && !isAssignedModerator) {
    throw new Error("You do not have access to this assessment.");
  }

  return {
    sessionUserId: session.user.id,
    sessionUserName: session.user.name ?? null,
    sessionUserEmail: session.user.email ?? null,
    moduleId,
    assessmentId,
    isAdmin: false,
    isModuleLeader,
    isAssessmentMarker,
    isAssignedModerator,
  };
}

function revalidateAssessmentPaths(moduleId: string, assessmentId: string) {
  revalidatePath(`/modules/${moduleId}`);
  revalidatePath(`/modules/${moduleId}/assessments/${assessmentId}`);
  revalidatePath("/dashboard");
}

export async function updateAssessmentSettingsAction(input: {
  moduleId: string;
  assessmentId: string;
  dueAt: string;
  markingDeadlineAt: string;
  moderatorUserId?: string;
  markerUserIds: string[];
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const assessmentId = input.assessmentId.trim();
    const dueAt = parseDateTimeInput(input.dueAt);
    const markingDeadlineAt = parseDateTimeInput(input.markingDeadlineAt);
    const moderatorUserId = input.moderatorUserId?.trim() || null;
    const markerUserIds = normalizeUserIds(input.markerUserIds);

    if (!dueAt || !markingDeadlineAt) {
      return { ok: false, error: "Due date and marking deadline are required." };
    }

    if (markingDeadlineAt < dueAt) {
      return { ok: false, error: "Marking deadline cannot be earlier than the due date." };
    }

    const context = await getAssessmentContext(moduleId, assessmentId);

    if (!context.isAdmin && !context.isModuleLeader) {
      return { ok: false, error: "Only module leaders can edit assessment settings." };
    }

    const assessment = await prisma.assessmentInstance.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        assessmentTemplate: {
          select: {
            moduleId: true,
          },
        },
        dueAt: true,
        markingDeadlineAt: true,
        moderatorUserId: true,
        markerAssignments: {
          where: {
            active: true,
          },
          select: {
            userId: true,
          },
        },
      },
    });

    if (!assessment || assessment.assessmentTemplate.moduleId !== moduleId) {
      return { ok: false, error: "Assessment not found." };
    }

    if (moderatorUserId) {
      await assertUsersExist([moderatorUserId]);
    }

    await prisma.assessmentInstance.update({
      where: { id: assessmentId },
      data: {
        dueAt,
        markingDeadlineAt,
        moderatorUserId,
      },
    });

    await replaceAssessmentMarkerAssignments({
      assessmentId,
      markerUserIds,
    });

    await recordAuditLog({
      actorUserId: context.sessionUserId,
      entityType: "AssessmentInstance",
      entityId: assessmentId,
      action: AuditAction.UPDATE,
      diff: {
        operation: "update_assessment_settings",
        dueAtBefore: assessment.dueAt,
        dueAtAfter: dueAt,
        markingDeadlineAtBefore: assessment.markingDeadlineAt,
        markingDeadlineAtAfter: markingDeadlineAt,
        moderatorUserIdBefore: assessment.moderatorUserId,
        moderatorUserIdAfter: moderatorUserId,
        markerUserIdsBefore: assessment.markerAssignments.map((assignment) => assignment.userId),
        markerUserIdsAfter: markerUserIds,
      },
    });

    revalidateAssessmentPaths(moduleId, assessmentId);

    return { ok: true, message: "Assessment settings updated." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to update assessment settings.",
    };
  }
}

export async function importAssessmentSubmissionsAction(input: {
  moduleId: string;
  assessmentId: string;
  submissionType: SubmissionType;
  rawText: string;
}): Promise<
  ActionResult<{
    extractedIds?: string[];
    duplicateIds?: string[];
    existingIds?: string[];
    createdCount?: number;
  }>
> {
  try {
    const moduleId = input.moduleId.trim();
    const assessmentId = input.assessmentId.trim();
    const rawText = input.rawText;

    const context = await getAssessmentContext(moduleId, assessmentId);

    if (!context.isAdmin && !context.isModuleLeader) {
      return { ok: false, error: "Only module leaders can import submissions." };
    }

    const extractedIds = extractTurnitinIds(rawText);

    if (extractedIds.length === 0) {
      return {
        ok: false,
        error: "No Turnitin IDs were found in the pasted text.",
        data: { extractedIds: [] },
      };
    }

    const duplicateIds = findDuplicateIds(extractedIds);
    const existingScripts = await prisma.script.findMany({
      where: {
        assessmentInstanceId: assessmentId,
        turnitinId: { in: extractedIds },
      },
      select: { turnitinId: true },
    });
    const existingIds = existingScripts
      .map((script) => script.turnitinId)
      .sort((left, right) => left.localeCompare(right));

    if (duplicateIds.length > 0 || existingIds.length > 0) {
      return {
        ok: false,
        error: "Remove duplicate IDs before importing submissions.",
        data: {
          extractedIds,
          duplicateIds,
          existingIds,
        },
      };
    }

    const created = await prisma.script.createMany({
      data: extractedIds.map((turnitinId) => ({
        assessmentInstanceId: assessmentId,
        turnitinId,
        submissionType: input.submissionType,
        externalUrl: buildTurnitinSubmissionUrl(turnitinId),
      })),
    });

    await recordAuditLog({
      actorUserId: context.sessionUserId,
      entityType: "AssessmentInstance",
      entityId: assessmentId,
      action: AuditAction.UPDATE,
      diff: {
        operation: "turnitin_import",
        submissionType: input.submissionType,
        createdCount: created.count,
        turnitinIds: extractedIds,
      },
    });

    revalidateAssessmentPaths(moduleId, assessmentId);

    return {
      ok: true,
      message: `${created.count} submissions imported.`,
      data: {
        extractedIds,
        createdCount: created.count,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to import submissions.",
    };
  }
}

export async function saveScriptAllocationAction(input: {
  moduleId: string;
  assessmentId: string;
  scriptId: string;
  markerUserId: string | null;
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const assessmentId = input.assessmentId.trim();
    const scriptId = input.scriptId.trim();
    const markerUserId = input.markerUserId?.trim() || null;

    const context = await getAssessmentContext(moduleId, assessmentId);

    if (!context.isAdmin && !context.isModuleLeader) {
      return { ok: false, error: "Only module leaders can update allocations." };
    }

    const script = await prisma.script.findUnique({
      where: { id: scriptId },
      select: {
        id: true,
        assessmentInstanceId: true,
        allocation: {
          select: {
            id: true,
            markerUserId: true,
          },
        },
      },
    });

    if (!script || script.assessmentInstanceId !== assessmentId) {
      return { ok: false, error: "Script not found." };
    }

    if (!markerUserId) {
      if (script.allocation) {
        await prisma.allocation.delete({ where: { scriptId } });
        await recordAuditLog({
          actorUserId: context.sessionUserId,
          entityType: "Allocation",
          entityId: script.allocation.id,
          action: AuditAction.DELETE,
          diff: {
            scriptId,
            markerUserIdBefore: script.allocation.markerUserId,
          },
        });
      }

      revalidateAssessmentPaths(moduleId, assessmentId);
      return { ok: true, message: "Allocation cleared." };
    }

    const markerMembership = await prisma.assessmentMarker.findFirst({
      where: {
        assessmentInstanceId: assessmentId,
        userId: markerUserId,
        active: true,
      },
      select: { id: true },
    });

    if (!markerMembership) {
      return { ok: false, error: "Select a marker from this assessment team." };
    }

    const allocation = await prisma.allocation.upsert({
      where: { scriptId },
      update: { markerUserId },
      create: {
        scriptId,
        markerUserId,
      },
      select: { id: true },
    });

    await recordAuditLog({
      actorUserId: context.sessionUserId,
      entityType: "Allocation",
      entityId: allocation.id,
      action: script.allocation ? AuditAction.UPDATE : AuditAction.CREATE,
      diff: {
        scriptId,
        markerUserIdBefore: script.allocation?.markerUserId ?? null,
        markerUserIdAfter: markerUserId,
      },
    });

    revalidateAssessmentPaths(moduleId, assessmentId);

    return { ok: true, message: "Allocation saved." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save allocation.",
    };
  }
}

export async function autoAssignUnallocatedScriptsAction(input: {
  moduleId: string;
  assessmentId: string;
}): Promise<ActionResult<{ assignedCount?: number }>> {
  try {
    const moduleId = input.moduleId.trim();
    const assessmentId = input.assessmentId.trim();

    const context = await getAssessmentContext(moduleId, assessmentId);

    if (!context.isAdmin && !context.isModuleLeader) {
      return { ok: false, error: "Only module leaders can auto-assign scripts." };
    }

    const markerMemberships = await prisma.assessmentMarker.findMany({
      where: {
        assessmentInstanceId: assessmentId,
        active: true,
      },
      select: { userId: true },
    });

    const markerIds = Array.from(new Set(markerMemberships.map((membership) => membership.userId)));

    if (markerIds.length === 0) {
      return { ok: false, error: "No active markers are available for this module." };
    }

    const scripts = await prisma.script.findMany({
      where: { assessmentInstanceId: assessmentId },
      select: {
        id: true,
        allocation: {
          select: {
            markerUserId: true,
          },
        },
      },
    });

    const unallocatedScriptIds = scripts.filter((script) => !script.allocation).map((script) => script.id);

    if (unallocatedScriptIds.length === 0) {
      return { ok: true, message: "All submissions are already allocated.", data: { assignedCount: 0 } };
    }

    const existingCounts = scripts.reduce<Record<string, number>>((acc, script) => {
      const currentMarkerUserId = script.allocation?.markerUserId;

      if (currentMarkerUserId) {
        acc[currentMarkerUserId] = (acc[currentMarkerUserId] ?? 0) + 1;
      }

      return acc;
    }, {});

    const assignmentMap = buildBalancedAssignments(unallocatedScriptIds, markerIds, existingCounts);

    for (const scriptId of unallocatedScriptIds) {
      const markerUserId = assignmentMap[scriptId];

      if (!markerUserId) {
        continue;
      }

      const allocation = await prisma.allocation.create({
        data: {
          scriptId,
          markerUserId,
        },
        select: { id: true },
      });

      await recordAuditLog({
        actorUserId: context.sessionUserId,
        entityType: "Allocation",
        entityId: allocation.id,
        action: AuditAction.CREATE,
        diff: {
          scriptId,
          markerUserIdAfter: markerUserId,
          autoBalanced: true,
        },
      });
    }

    await recordAuditLog({
      actorUserId: context.sessionUserId,
      entityType: "AssessmentInstance",
      entityId: assessmentId,
      action: AuditAction.UPDATE,
      diff: {
        operation: "auto_balance_allocation",
        scriptsAllocated: unallocatedScriptIds.length,
        markersUsed: markerIds.length,
      },
    });

    revalidateAssessmentPaths(moduleId, assessmentId);

    return {
      ok: true,
      message: `${unallocatedScriptIds.length} submissions assigned.`,
      data: { assignedCount: unallocatedScriptIds.length },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to auto-assign submissions.",
    };
  }
}

export async function saveScriptGradeAction(input: {
  moduleId: string;
  assessmentId: string;
  scriptId: string;
  grade: string;
}): Promise<ActionResult<{ savedGrade?: number | null }>> {
  try {
    const moduleId = input.moduleId.trim();
    const assessmentId = input.assessmentId.trim();
    const scriptId = input.scriptId.trim();
    const gradeRaw = input.grade.trim();

    const context = await getAssessmentContext(moduleId, assessmentId);

    const script = await prisma.script.findUnique({
      where: { id: scriptId },
      select: {
        id: true,
        assessmentInstanceId: true,
        status: true,
        grade: true,
        version: true,
        allocation: {
          select: {
            markerUserId: true,
          },
        },
      },
    });

    if (!script || script.assessmentInstanceId !== assessmentId) {
      return { ok: false, error: "Script not found." };
    }

    const canMark =
      context.isAdmin ||
      context.isModuleLeader ||
      script.allocation?.markerUserId === context.sessionUserId;

    if (!canMark) {
      return { ok: false, error: "You can only grade scripts allocated to you." };
    }

    const parsedGrade = gradeRaw ? Number(gradeRaw) : null;

    if (gradeRaw && Number.isNaN(parsedGrade)) {
      return { ok: false, error: "Enter a valid numeric grade." };
    }

    const nextStatus = parsedGrade === null ? ScriptStatus.NOT_STARTED : ScriptStatus.COMPLETED;

    const updated = await prisma.script.update({
      where: { id: scriptId },
      data: {
        grade: parsedGrade,
        status: nextStatus,
        version: { increment: 1 },
      },
      select: { id: true },
    });

    await recordAuditLog({
      actorUserId: context.sessionUserId,
      entityType: "Script",
      entityId: updated.id,
      action: AuditAction.UPDATE,
      diff: {
        gradeBefore: script.grade,
        gradeAfter: parsedGrade,
        statusBefore: script.status,
        statusAfter: nextStatus,
        versionBefore: script.version,
        versionAfter: script.version + 1,
      },
    });

    revalidateAssessmentPaths(moduleId, assessmentId);

    return {
      ok: true,
      message: "Grade saved.",
      data: { savedGrade: parsedGrade },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save grade.",
    };
  }
}

export async function saveAssessmentModerationAction(input: {
  moduleId: string;
  assessmentId: string;
  status: ModerationStatus;
  report: string;
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const assessmentId = input.assessmentId.trim();
    const report = input.report.trim();

    if (!report) {
      return { ok: false, error: "Add a moderation comment before saving." };
    }

    const context = await getAssessmentContext(moduleId, assessmentId);

    const assessment = await prisma.assessmentInstance.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        moderatorUserId: true,
        moderationStatus: true,
        moderationReport: true,
        moderationCompletedAt: true,
        academicYear: true,
        assessmentTemplate: {
          select: {
            name: true,
            module: {
              select: {
                code: true,
                title: true,
                memberships: {
                  where: {
                    isLeader: true,
                    active: true,
                  },
                  select: {
                    user: {
                      select: {
                        email: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!assessment) {
      return { ok: false, error: "Assessment not found." };
    }

    if (!assessment.moderatorUserId || assessment.moderatorUserId !== context.sessionUserId) {
      return { ok: false, error: "Only the assigned moderator can submit the moderation report." };
    }

    const completedAt = new Date();

    await prisma.assessmentInstance.update({
      where: { id: assessmentId },
      data: {
        moderationStatus: input.status,
        moderationReport: report,
        moderationCompletedAt: completedAt,
      },
    });

    await recordAuditLog({
      actorUserId: context.sessionUserId,
      entityType: "AssessmentInstance",
      entityId: assessmentId,
      action: AuditAction.UPDATE,
      diff: {
        operation: "moderation_report",
        moderationStatusBefore: assessment.moderationStatus,
        moderationStatusAfter: input.status,
        moderationReportBefore: assessment.moderationReport,
        moderationReportAfter: report,
        moderationCompletedAtBefore: assessment.moderationCompletedAt,
        moderationCompletedAtAfter: completedAt,
      },
    });

    const completedAtText = completedAt.toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/London",
    });

    const subject = `Moderation completed: ${assessment.assessmentTemplate.module.code} ${assessment.assessmentTemplate.name} (${assessment.academicYear})`;
    const message = [
      `Module: ${assessment.assessmentTemplate.module.code} - ${assessment.assessmentTemplate.module.title}`,
      `Assessment: ${assessment.assessmentTemplate.name}`,
      `Academic year: ${assessment.academicYear}`,
      `Moderator: ${context.sessionUserName ?? context.sessionUserEmail ?? "Assigned moderator"}`,
      `Status: ${formatModerationStatus(input.status)}`,
      `Completed: ${completedAtText}`,
      "",
      "Moderation report:",
      report,
    ].join("\n");

    let emailWarning: string | null = null;

    try {
      await Promise.all(
        assessment.assessmentTemplate.module.memberships
          .map((membership) => membership.user.email)
          .filter(Boolean)
          .map((email) => sendEmail(email, subject, message))
      );
    } catch (error) {
      emailWarning = error instanceof Error ? error.message : "Email notification failed.";
    }

    revalidateAssessmentPaths(moduleId, assessmentId);

    return {
      ok: true,
      message: emailWarning ? `Moderation saved. ${emailWarning}` : "Moderation report saved.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save the moderation report.",
    };
  }
}

export async function saveReviewFlagAction(input: {
  moduleId: string;
  assessmentId: string;
  scriptId: string;
  status: ReviewFlagStatus;
  reason: string;
  outcomeNotes?: string;
  notifyLeaderUserIds: string[];
}): Promise<ActionResult> {
  try {
    const moduleId = input.moduleId.trim();
    const assessmentId = input.assessmentId.trim();
    const scriptId = input.scriptId.trim();
    const reason = input.reason.trim();
    const outcomeNotes = input.outcomeNotes?.trim() || null;
    const notifyLeaderUserIds = normalizeUserIds(input.notifyLeaderUserIds);

    const context = await getAssessmentContext(moduleId, assessmentId);

    const script = await prisma.script.findUnique({
      where: { id: scriptId },
      select: {
        id: true,
        turnitinId: true,
        assessmentInstanceId: true,
        reviewFlag: {
          select: {
            id: true,
            status: true,
            reason: true,
            outcomeNotes: true,
            notifiedLeaderUserIds: true,
            resolvedAt: true,
          },
        },
        assessmentInstance: {
          select: {
            academicYear: true,
            dueAt: true,
            markingDeadlineAt: true,
            assessmentTemplate: {
              select: {
                name: true,
                module: {
                  select: {
                    code: true,
                    title: true,
                    memberships: {
                      where: {
                        active: true,
                        isLeader: true,
                      },
                      select: {
                        userId: true,
                        user: {
                          select: {
                            name: true,
                            email: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!script || script.assessmentInstanceId !== assessmentId) {
      return { ok: false, error: "Script not found." };
    }

    if (!script.reviewFlag && !reason) {
      return { ok: false, error: "Add a reason before flagging this script." };
    }

    if (input.status === ReviewFlagStatus.REVIEW_COMPLETED && !outcomeNotes) {
      return { ok: false, error: "Add the review outcome before completing the review." };
    }

    const leaderIds = script.assessmentInstance.assessmentTemplate.module.memberships.map(
      (membership) => membership.userId
    );

    if (notifyLeaderUserIds.some((userId) => !leaderIds.includes(userId))) {
      return { ok: false, error: "Only module leaders can be selected for notification." };
    }

    const resolvedAt = isReviewFlagResolved(input.status) ? new Date() : null;

    const reviewFlag = script.reviewFlag
      ? await prisma.reviewFlag.update({
          where: { scriptId },
          data: {
            status: input.status,
            reason: reason || script.reviewFlag.reason,
            outcomeNotes,
            notifiedLeaderUserIds: notifyLeaderUserIds,
            resolvedAt,
          },
          select: { id: true },
        })
      : await prisma.reviewFlag.create({
          data: {
            scriptId,
            createdByUserId: context.sessionUserId,
            status: input.status,
            reason,
            outcomeNotes,
            notifiedLeaderUserIds: notifyLeaderUserIds,
            resolvedAt,
          },
          select: { id: true },
        });

    await recordAuditLog({
      actorUserId: context.sessionUserId,
      entityType: "ReviewFlag",
      entityId: reviewFlag.id,
      action: script.reviewFlag ? AuditAction.UPDATE : AuditAction.CREATE,
      diff: {
        scriptId,
        statusBefore: script.reviewFlag?.status ?? null,
        statusAfter: input.status,
        reasonBefore: script.reviewFlag?.reason ?? null,
        reasonAfter: reason || (script.reviewFlag?.reason ?? null),
        outcomeNotesBefore: script.reviewFlag?.outcomeNotes ?? null,
        outcomeNotesAfter: outcomeNotes,
        notifyLeaderUserIdsBefore: script.reviewFlag?.notifiedLeaderUserIds ?? [],
        notifyLeaderUserIdsAfter: notifyLeaderUserIds,
        resolvedAtBefore: script.reviewFlag?.resolvedAt ?? null,
        resolvedAtAfter: resolvedAt,
      },
    });

    let emailWarning: string | null = null;
    const shouldSendInitialNotification =
      notifyLeaderUserIds.length > 0 &&
      (script.reviewFlag === null || isReviewFlagResolved(script.reviewFlag.status));

    if (shouldSendInitialNotification) {
      const recipients = script.assessmentInstance.assessmentTemplate.module.memberships.filter((membership) =>
        notifyLeaderUserIds.includes(membership.userId)
      );

      const subject = `Review flag raised: ${script.assessmentInstance.assessmentTemplate.module.code} ${script.assessmentInstance.assessmentTemplate.name} (${script.assessmentInstance.academicYear})`;
      const message = [
        `Module: ${script.assessmentInstance.assessmentTemplate.module.code} - ${script.assessmentInstance.assessmentTemplate.module.title}`,
        `Assessment: ${script.assessmentInstance.assessmentTemplate.name}`,
        `Academic year: ${script.assessmentInstance.academicYear}`,
        `Script ID: ${script.turnitinId}`,
        `Raised by: ${context.sessionUserName ?? context.sessionUserEmail ?? "MarkingDesk user"}`,
        `Status: ${formatReviewFlagStatus(input.status)}`,
        "",
        "Reason:",
        reason || script.reviewFlag?.reason || "",
      ].join("\n");

      try {
        await Promise.all(
          recipients
            .map((recipient) => recipient.user.email)
            .filter(Boolean)
            .map((email) => sendEmail(email, subject, message))
        );
      } catch (error) {
        emailWarning = error instanceof Error ? error.message : "Email notification failed.";
      }
    }

    revalidateAssessmentPaths(moduleId, assessmentId);

    return {
      ok: true,
      message: emailWarning ? `Review flag saved. ${emailWarning}` : "Review flag saved.",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to save the review flag.",
    };
  }
}
