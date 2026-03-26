import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { AssessmentWorkspaceClient } from "./assessment-workspace-client";
import { PageBreadcrumbs } from "@/components/breadcrumb-context";
import { formatModerationStatus } from "@/lib/assessment-utils";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@/lib/user-display";
import type { UserPickerOption } from "@/components/ui/user-picker";

type AssessmentPageProps = {
  params: Promise<{ moduleId: string; assessmentId: string }>;
};

type MarkerProgressSummary = {
  markerId: string;
  markerName: string;
  allocatedScripts: number;
  markedScripts: number;
  remainingScripts: number;
  progressPercentage: number;
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
      markerAssignments: {
        where: {
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
      },
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
          reviewFlag: {
            select: {
              id: true,
              status: true,
              reason: true,
              outcomeNotes: true,
              notifiedLeaderUserIds: true,
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
      isLeader: true,
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
  const currentUserIsLeader = currentMemberships.some((membership) => membership.isLeader);
  const currentUserIsAssessmentMarker = assessment.markerAssignments.some(
    (assignment) => assignment.userId === session.user.id
  );
  const currentUserIsModerator = assessment.moderatorUserId === session.user.id;
  const isArchived = assessment.assessmentTemplate.isArchived;

  if (!isAdmin && currentMemberships.length === 0 && !currentUserIsAssessmentMarker && !currentUserIsModerator) {
    notFound();
  }

  if (isArchived && !isAdmin && !currentUserIsLeader) {
    notFound();
  }

  const isModuleLeader = isAdmin || currentUserIsLeader;
  const canManageAssessment = !isArchived && (isAdmin || isModuleLeader);
  const canSubmitModeration = !isArchived && assessment.moderatorUserId === session.user.id;
  const workspaceVersion = assessment.scripts
    .map((script) => `${script.id}:${script.version}:${script.allocation?.markerUserId ?? ""}`)
    .join("|");
  const markerOptions = assessment.markerAssignments
    .map((membership) => ({
      id: membership.user.id,
      name: getDisplayName(membership.user),
      email: membership.user.email,
      meta: [
        membership.user.passwordHash && membership.user.emailVerified ? null : "Invitation pending",
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
    }));
  const currentModeratorOption: UserPickerOption | null = assessment.moderatorUser
    ? {
        id: assessment.moderatorUser.id,
        name: getDisplayName(assessment.moderatorUser),
        email: assessment.moderatorUser.email,
      }
    : null;
  const markerProgress = Array.from(
    assessment.scripts.reduce<Map<string, Omit<MarkerProgressSummary, "remainingScripts" | "progressPercentage">>>(
      (progressByMarkerId, script) => {
        const marker = script.allocation?.marker;

        if (!marker) {
          return progressByMarkerId;
        }

        const currentMarkerProgress = progressByMarkerId.get(marker.id) ?? {
          markerId: marker.id,
          markerName: getDisplayName(marker),
          allocatedScripts: 0,
          markedScripts: 0,
        };

        currentMarkerProgress.allocatedScripts += 1;

        if (script.grade !== null) {
          currentMarkerProgress.markedScripts += 1;
        }

        progressByMarkerId.set(marker.id, currentMarkerProgress);
        return progressByMarkerId;
      },
      new Map()
    ).values()
  )
    .map((marker) => ({
      ...marker,
      remainingScripts: marker.allocatedScripts - marker.markedScripts,
      progressPercentage:
        marker.allocatedScripts === 0 ? 0 : Math.round((marker.markedScripts / marker.allocatedScripts) * 100),
    }))
    .sort((left, right) => left.markerName.localeCompare(right.markerName));

  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: assessment.assessmentTemplate.module.code, href: `/modules/${moduleId}` },
          {
            label: assessment.assessmentTemplate.name,
            href: `/modules/${moduleId}/assessments/${assessmentId}`,
            current: true,
          },
        ]}
      />
      <AssessmentWorkspaceClient
        key={`${assessment.id}:${workspaceVersion}:${assessment.moderationStatus ?? "pending"}:${assessment.moderationCompletedAt?.getTime() ?? 0}:${assessment.dueAt.getTime()}:${assessment.markingDeadlineAt.getTime()}:${assessment.moderatorUserId ?? ""}:${assessment.assessmentTemplate.isArchived ? "archived" : "active"}:${assessment.assessmentTemplate.archivedAt?.getTime() ?? 0}`}
        moduleId={moduleId}
        assessmentId={assessmentId}
        moduleCode={assessment.assessmentTemplate.module.code}
        assessmentName={assessment.assessmentTemplate.name}
        academicYear={assessment.academicYear}
        isArchived={isArchived}
        archivedAt={assessment.assessmentTemplate.archivedAt ? formatDateTime(assessment.assessmentTemplate.archivedAt) : null}
        dueAt={formatDateTime(assessment.dueAt)}
        markingDeadlineAt={formatDateTime(assessment.markingDeadlineAt)}
        canManageAssessment={canManageAssessment}
        canSubmitModeration={canSubmitModeration}
        canViewMarkerProgress={isAdmin || currentUserIsLeader}
        markerOptions={markerOptions}
        markerProgress={markerProgress}
        currentModeratorOption={currentModeratorOption}
        moduleLeaderOptions={moduleMemberships.map((membership) => ({
          id: membership.user.id,
          name: getDisplayName(membership.user),
          email: membership.user.email,
          meta: membership.user.passwordHash && membership.user.emailVerified ? undefined : "Invitation pending",
        }))}
        dueAtInput={formatDateTimeLocalInput(assessment.dueAt)}
        markingDeadlineAtInput={formatDateTimeLocalInput(assessment.markingDeadlineAt)}
        currentModeratorUserId={assessment.moderatorUserId ?? ""}
        currentMarkerUserIds={assessment.markerAssignments.map((assignment) => assignment.userId)}
        scripts={assessment.scripts.map((script) => ({
          id: script.id,
          turnitinId: script.turnitinId,
          submissionType: script.submissionType,
          grade: script.grade,
          status: script.status,
          markerUserId: script.allocation?.markerUserId ?? null,
          markerName: script.allocation?.marker ? getDisplayName(script.allocation.marker) : null,
          canMark:
            !isArchived &&
            (isAdmin || isModuleLeader || (script.allocation?.markerUserId ?? null) === session.user.id),
          assignedToCurrentUser: (script.allocation?.markerUserId ?? null) === session.user.id,
          reviewFlag: script.reviewFlag
            ? {
                id: script.reviewFlag.id,
                status: script.reviewFlag.status,
                reason: script.reviewFlag.reason,
                outcomeNotes: script.reviewFlag.outcomeNotes,
                notifiedLeaderUserIds: script.reviewFlag.notifiedLeaderUserIds,
              }
            : null,
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
    </>
  );
}
