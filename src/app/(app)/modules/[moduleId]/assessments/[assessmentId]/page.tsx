import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { AssessmentWorkspaceClient } from "./assessment-workspace-client";
import { formatModerationStatus } from "@/lib/assessment-utils";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@/lib/user-display";

type AssessmentPageProps = {
  params: Promise<{ moduleId: string; assessmentId: string }>;
};

function formatDateTime(date: Date | null): string {
  if (!date) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(date);
}

function formatDateTimeLocalInput(date: Date | null): string {
  if (!date) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}`;
}

export default async function AssessmentPage({ params }: AssessmentPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  const { moduleId, assessmentId } = await params;

  const assessment = await prisma.assessmentInstance.findUnique({
    where: { id: assessmentId },
    include: {
      moderatorUser: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      assessmentTemplate: {
        include: {
          module: true,
        },
      },
      scripts: {
        orderBy: { turnitinId: "asc" },
        include: {
          allocation: {
            include: {
              marker: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          integrityFlag: {
            select: {
              id: true,
            },
          },
        },
      },
    },
  });

  if (!assessment || assessment.assessmentTemplate.module.id !== moduleId) {
    notFound();
  }

  const moduleMemberships = await prisma.moduleMembership.findMany({
    where: {
      moduleId,
      active: true,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          passwordHash: true,
          emailVerified: true,
        },
      },
    },
    orderBy: [{ isLeader: "desc" }, { user: { name: "asc" } }, { user: { email: "asc" } }],
  });

  const isAdmin = session.user.role === Role.ADMIN;
  const currentMemberships = moduleMemberships.filter((membership) => membership.userId === session.user.id);

  if (!isAdmin && currentMemberships.length === 0) {
    notFound();
  }

  const isModuleLeader = isAdmin || currentMemberships.some((membership) => membership.isLeader);
  const canManageAssessment = isAdmin || isModuleLeader;
  const canSubmitModeration = assessment.moderatorUserId === session.user.id;
  const workspaceVersion = assessment.scripts
    .map((script) => `${script.id}:${script.version}:${script.allocation?.markerUserId ?? ""}`)
    .join("|");
  const markerOptions = moduleMemberships
    .map((membership) => ({
      id: membership.user.id,
      name: getDisplayName(membership.user),
      email: membership.user.email,
      meta: [
        membership.isLeader ? "Module leader" : null,
        membership.user.passwordHash && membership.user.emailVerified ? null : "Invitation pending",
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    }));
  const moderatorOptions = moduleMemberships
    .map((membership) => ({
      id: membership.user.id,
      name: getDisplayName(membership.user),
      email: membership.user.email,
      meta: [
        membership.isLeader ? "Module leader" : null,
        membership.user.passwordHash && membership.user.emailVerified ? null : "Invitation pending",
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    }));

  return (
    <AssessmentWorkspaceClient
      key={`${assessment.id}:${workspaceVersion}:${assessment.moderationStatus ?? "pending"}:${assessment.moderationCompletedAt?.getTime() ?? 0}:${assessment.dueAt.getTime()}:${assessment.markingDeadlineAt.getTime()}:${assessment.opensAt?.getTime() ?? 0}:${assessment.moderatorUserId ?? ""}`}
      moduleId={moduleId}
      assessmentId={assessmentId}
      moduleCode={assessment.assessmentTemplate.module.code}
      assessmentName={assessment.assessmentTemplate.name}
      academicYear={assessment.academicYear}
      dueAt={formatDateTime(assessment.dueAt)}
      markingDeadlineAt={formatDateTime(assessment.markingDeadlineAt)}
      canManageAssessment={canManageAssessment}
      canSubmitModeration={canSubmitModeration}
      markerOptions={markerOptions}
      moderatorOptions={moderatorOptions}
      opensAtInput={formatDateTimeLocalInput(assessment.opensAt)}
      dueAtInput={formatDateTimeLocalInput(assessment.dueAt)}
      markingDeadlineAtInput={formatDateTimeLocalInput(assessment.markingDeadlineAt)}
      currentModeratorUserId={assessment.moderatorUserId ?? ""}
      scripts={assessment.scripts.map((script) => ({
        id: script.id,
        turnitinId: script.turnitinId,
        submissionType: script.submissionType,
        grade: script.grade,
        status: script.status,
        markerUserId: script.allocation?.markerUserId ?? null,
        markerName: script.allocation?.marker ? getDisplayName(script.allocation.marker) : null,
        canMark:
          isAdmin || isModuleLeader || (script.allocation?.markerUserId ?? null) === session.user.id,
        assignedToCurrentUser: (script.allocation?.markerUserId ?? null) === session.user.id,
        hasIntegrityFlag: Boolean(script.integrityFlag),
        hasReviewFlag: script.status === "UNDER_REVIEW",
      }))}
      moderation={{
        moderatorName: assessment.moderatorUser ? getDisplayName(assessment.moderatorUser) : null,
        moderatorEmail: assessment.moderatorUser?.email ?? null,
        statusLabel: formatModerationStatus(assessment.moderationStatus),
        completedAt: assessment.moderationCompletedAt ? formatDateTime(assessment.moderationCompletedAt) : null,
        report: assessment.moderationReport,
        hasCompletedModeration: Boolean(assessment.moderationCompletedAt),
      }}
    />
  );
}
