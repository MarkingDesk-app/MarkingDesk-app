import { ModuleRole, Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { AssessmentWorkspaceClient } from "./assessment-workspace-client";
import { formatModerationStatus } from "@/lib/assessment-utils";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type AssessmentPageProps = {
  params: Promise<{ moduleId: string; assessmentId: string }>;
};

function getDisplayName(user: { name: string; email?: string | null }): string {
  const trimmedName = user.name.trim();

  if (trimmedName) {
    return trimmedName;
  }

  if (user.email) {
    return user.email.split("@")[0] || "Unnamed user";
  }

  return "Unnamed user";
}

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
          role: true,
        },
      },
    },
    orderBy: [{ role: "asc" }, { user: { name: "asc" } }, { user: { email: "asc" } }],
  });

  const isAdmin = session.user.role === Role.ADMIN;
  const currentMemberships = moduleMemberships.filter((membership) => membership.userId === session.user.id);

  if (!isAdmin && currentMemberships.length === 0) {
    notFound();
  }

  const isModuleLeader = isAdmin || currentMemberships.some((membership) => membership.role === ModuleRole.MODULE_LEADER);
  const canManageAssessment = isAdmin || isModuleLeader;
  const canSubmitModeration = assessment.moderatorUserId === session.user.id;
  const workspaceVersion = assessment.scripts
    .map((script) => `${script.id}:${script.version}:${script.allocation?.markerUserId ?? ""}`)
    .join("|");
  const markerOptions = moduleMemberships
    .filter((membership) => membership.role === ModuleRole.MARKER || membership.role === ModuleRole.MODULE_LEADER)
    .map((membership) => ({
      id: membership.user.id,
      displayName: getDisplayName(membership.user),
    }));

  return (
    <AssessmentWorkspaceClient
      key={`${assessment.id}:${workspaceVersion}:${assessment.moderationStatus ?? "pending"}:${assessment.moderationCompletedAt?.getTime() ?? 0}`}
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
