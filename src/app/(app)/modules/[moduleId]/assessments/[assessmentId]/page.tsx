import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import {
  AssessmentSubmissionsSection,
  AssessmentSubmissionsSkeleton,
} from "./assessment-workspace-client";
import { AssessmentWorkspaceShell } from "./assessment-workspace-shell";
import type {
  MarkerProgressSummary,
  ModerationSummary,
  ScriptRow,
} from "./assessment-workspace-types";
import { PageBreadcrumbs } from "@/components/breadcrumb-context";
import { formatModerationStatus } from "@/lib/assessment-utils";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@/lib/user-display";
import type { UserPickerOption } from "@/components/ui/user-picker";

type AssessmentPageProps = {
  params: Promise<{ moduleId: string; assessmentId: string }>;
};

const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  emailVerified: true,
} as const;

type AssessmentShellData = {
  moduleId: string;
  assessmentId: string;
  moduleCode: string;
  assessmentName: string;
  academicYear: string;
  isArchived: boolean;
  archivedAt: string | null;
  dueAt: string;
  markingDeadlineAt: string;
  dueAtInput: string;
  markingDeadlineAtInput: string;
  canManageAssessment: boolean;
  canSubmitModeration: boolean;
  canViewMarkerProgress: boolean;
  currentModeratorOption: UserPickerOption | null;
  currentModeratorUserId: string;
  currentMarkerUserIds: string[];
  markerOptions: UserPickerOption[];
  markerProgress: MarkerProgressSummary[];
  moduleLeaderOptions: UserPickerOption[];
  moderation: ModerationSummary;
  totalScriptCount: number;
  markedScriptCount: number;
  myAllocatedScriptCount: number;
  myMarkedScriptCount: number;
  existingTurnitinIds: string[];
  currentUserCanMarkAll: boolean;
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

async function getAssessmentShellData({
  moduleId,
  assessmentId,
  currentUserId,
  role,
}: {
  moduleId: string;
  assessmentId: string;
  currentUserId: string;
  role: Role;
}): Promise<AssessmentShellData> {
  const [assessment, moduleMemberships] = await Promise.all([
    prisma.assessmentInstance.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        academicYear: true,
        dueAt: true,
        markingDeadlineAt: true,
        moderatorUserId: true,
        moderationStatus: true,
        moderationReport: true,
        moderationCompletedAt: true,
        moderatorUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        assessmentTemplate: {
          select: {
            name: true,
            isArchived: true,
            archivedAt: true,
            module: {
              select: {
                id: true,
                code: true,
              },
            },
          },
        },
        markerAssignments: {
          where: {
            active: true,
          },
          include: {
            user: {
              select: userSummarySelect,
            },
          },
        },
        scripts: {
          select: {
            turnitinId: true,
            grade: true,
            allocation: {
              select: {
                markerUserId: true,
              },
            },
          },
        },
      },
    }),
    prisma.moduleMembership.findMany({
      where: {
        moduleId,
        active: true,
        isLeader: true,
      },
      include: {
        user: {
          select: userSummarySelect,
        },
      },
      orderBy: [{ isLeader: "desc" }, { user: { name: "asc" } }, { user: { email: "asc" } }],
    }),
  ]);

  if (!assessment || assessment.assessmentTemplate.module.id !== moduleId) {
    notFound();
  }

  const isAdmin = role === Role.ADMIN;
  const currentMemberships = moduleMemberships.filter((membership) => membership.userId === currentUserId);
  const currentUserIsLeader = currentMemberships.some((membership) => membership.isLeader);
  const currentUserIsAssessmentMarker = assessment.markerAssignments.some(
    (assignment) => assignment.userId === currentUserId
  );
  const currentUserIsModerator = assessment.moderatorUserId === currentUserId;
  const isArchived = assessment.assessmentTemplate.isArchived;

  if (!isAdmin && currentMemberships.length === 0 && !currentUserIsAssessmentMarker && !currentUserIsModerator) {
    notFound();
  }

  if (isArchived && !isAdmin && !currentUserIsLeader) {
    notFound();
  }

  const isModuleLeader = isAdmin || currentUserIsLeader;
  const currentUserCanMarkAll = isAdmin || isModuleLeader;
  const canManageAssessment = !isArchived && currentUserCanMarkAll;
  const canSubmitModeration = !isArchived && assessment.moderatorUserId === currentUserId;
  const markerOptions = assessment.markerAssignments.map((membership) => ({
    id: membership.user.id,
    name: getDisplayName(membership.user),
    email: membership.user.email,
    meta: [
      membership.user.passwordHash && membership.user.emailVerified ? null : "Invitation pending",
    ]
      .filter(Boolean)
      .join(" · ") || undefined,
  }));
  const markerNameById = new Map(markerOptions.map((marker) => [marker.id, marker.name]));
  const markerProgressById = assessment.scripts.reduce<Map<string, Omit<MarkerProgressSummary, "remainingScripts" | "progressPercentage">>>(
    (progressByMarkerId, script) => {
      const markerUserId = script.allocation?.markerUserId;

      if (!markerUserId) {
        return progressByMarkerId;
      }

      const currentMarkerProgress = progressByMarkerId.get(markerUserId) ?? {
        markerId: markerUserId,
        markerName: markerNameById.get(markerUserId) ?? "Unknown marker",
        allocatedScripts: 0,
        markedScripts: 0,
      };

      currentMarkerProgress.allocatedScripts += 1;

      if (script.grade !== null) {
        currentMarkerProgress.markedScripts += 1;
      }

      progressByMarkerId.set(markerUserId, currentMarkerProgress);
      return progressByMarkerId;
    },
    new Map()
  );
  const markerProgress = Array.from(markerProgressById.values())
    .map((marker) => ({
      ...marker,
      remainingScripts: marker.allocatedScripts - marker.markedScripts,
      progressPercentage:
        marker.allocatedScripts === 0 ? 0 : Math.round((marker.markedScripts / marker.allocatedScripts) * 100),
    }))
    .sort((left, right) => left.markerName.localeCompare(right.markerName));
  const totalScriptCount = assessment.scripts.length;
  const markedScriptCount = assessment.scripts.filter((script) => script.grade !== null).length;
  const myAllocatedScriptCount = assessment.scripts.filter(
    (script) => script.allocation?.markerUserId === currentUserId
  ).length;
  const myMarkedScriptCount = assessment.scripts.filter(
    (script) => script.allocation?.markerUserId === currentUserId && script.grade !== null
  ).length;

  return {
    moduleId,
    assessmentId,
    moduleCode: assessment.assessmentTemplate.module.code,
    assessmentName: assessment.assessmentTemplate.name,
    academicYear: assessment.academicYear,
    isArchived,
    archivedAt: assessment.assessmentTemplate.archivedAt ? formatDateTime(assessment.assessmentTemplate.archivedAt) : null,
    dueAt: formatDateTime(assessment.dueAt),
    markingDeadlineAt: formatDateTime(assessment.markingDeadlineAt),
    dueAtInput: formatDateTimeLocalInput(assessment.dueAt),
    markingDeadlineAtInput: formatDateTimeLocalInput(assessment.markingDeadlineAt),
    canManageAssessment,
    canSubmitModeration,
    canViewMarkerProgress: isAdmin || currentUserIsLeader,
    currentModeratorOption: assessment.moderatorUser
      ? {
          id: assessment.moderatorUser.id,
          name: getDisplayName(assessment.moderatorUser),
          email: assessment.moderatorUser.email,
        }
      : null,
    currentModeratorUserId: assessment.moderatorUserId ?? "",
    currentMarkerUserIds: assessment.markerAssignments.map((assignment) => assignment.userId),
    markerOptions,
    markerProgress,
    moduleLeaderOptions: moduleMemberships.map((membership) => ({
      id: membership.user.id,
      name: getDisplayName(membership.user),
      email: membership.user.email,
      meta: membership.user.passwordHash && membership.user.emailVerified ? undefined : "Invitation pending",
    })),
    moderation: {
      moderatorName: assessment.moderatorUser ? getDisplayName(assessment.moderatorUser) : null,
      moderatorEmail: assessment.moderatorUser?.email ?? null,
      statusLabel: formatModerationStatus(assessment.moderationStatus),
      completedAt: assessment.moderationCompletedAt ? formatDateTime(assessment.moderationCompletedAt) : null,
      report: assessment.moderationReport,
      hasCompletedModeration: Boolean(assessment.moderationCompletedAt),
    },
    totalScriptCount,
    markedScriptCount,
    myAllocatedScriptCount,
    myMarkedScriptCount,
    existingTurnitinIds: assessment.scripts.map((script) => script.turnitinId),
    currentUserCanMarkAll,
  };
}

async function AssessmentSubmissionsContent({
  assessmentId,
  moduleId,
  currentUserId,
  isArchived,
  canManageAssessment,
  currentUserCanMarkAll,
  markerOptions,
  moduleLeaderOptions,
}: {
  assessmentId: string;
  moduleId: string;
  currentUserId: string;
  isArchived: boolean;
  canManageAssessment: boolean;
  currentUserCanMarkAll: boolean;
  markerOptions: UserPickerOption[];
  moduleLeaderOptions: UserPickerOption[];
}) {
  const scripts = await prisma.script.findMany({
    where: {
      assessmentInstanceId: assessmentId,
    },
    orderBy: { turnitinId: "asc" },
    select: {
      id: true,
      version: true,
      turnitinId: true,
      submissionType: true,
      grade: true,
      status: true,
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
  });

  const rows: ScriptRow[] = scripts.map((script) => ({
    id: script.id,
    turnitinId: script.turnitinId,
    submissionType: script.submissionType,
    grade: script.grade,
    status: script.status,
    markerUserId: script.allocation?.markerUserId ?? null,
    markerName: script.allocation?.marker ? getDisplayName(script.allocation.marker) : null,
    canMark: !isArchived && (currentUserCanMarkAll || (script.allocation?.markerUserId ?? null) === currentUserId),
    assignedToCurrentUser: (script.allocation?.markerUserId ?? null) === currentUserId,
    reviewFlag: script.reviewFlag
      ? {
          id: script.reviewFlag.id,
          status: script.reviewFlag.status,
          reason: script.reviewFlag.reason,
          outcomeNotes: script.reviewFlag.outcomeNotes,
          notifiedLeaderUserIds: script.reviewFlag.notifiedLeaderUserIds,
        }
      : null,
  }));

  return (
    <AssessmentSubmissionsSection
      key={scripts.map((script) => `${script.id}:${script.version}:${script.allocation?.markerUserId ?? ""}`).join("|")}
      moduleId={moduleId}
      assessmentId={assessmentId}
      isArchived={isArchived}
      canManageAssessment={canManageAssessment}
      markerOptions={markerOptions}
      moduleLeaderOptions={moduleLeaderOptions}
      scripts={rows}
    />
  );
}

export default async function AssessmentPage({ params }: AssessmentPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  const { moduleId, assessmentId } = await params;
  const shellData = await getAssessmentShellData({
    moduleId,
    assessmentId,
    currentUserId: session.user.id,
    role: session.user.role,
  });

  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: shellData.moduleCode, href: `/modules/${moduleId}` },
          {
            label: shellData.assessmentName,
            href: `/modules/${moduleId}/assessments/${assessmentId}`,
            current: true,
          },
        ]}
      />
      <AssessmentWorkspaceShell
        moduleId={shellData.moduleId}
        assessmentId={shellData.assessmentId}
        moduleCode={shellData.moduleCode}
        assessmentName={shellData.assessmentName}
        academicYear={shellData.academicYear}
        isArchived={shellData.isArchived}
        archivedAt={shellData.archivedAt}
        dueAt={shellData.dueAt}
        markingDeadlineAt={shellData.markingDeadlineAt}
        canManageAssessment={shellData.canManageAssessment}
        canSubmitModeration={shellData.canSubmitModeration}
        canViewMarkerProgress={shellData.canViewMarkerProgress}
        markerOptions={shellData.markerOptions}
        markerProgress={shellData.markerProgress}
        currentModeratorOption={shellData.currentModeratorOption}
        dueAtInput={shellData.dueAtInput}
        markingDeadlineAtInput={shellData.markingDeadlineAtInput}
        currentModeratorUserId={shellData.currentModeratorUserId}
        currentMarkerUserIds={shellData.currentMarkerUserIds}
        existingTurnitinIds={shellData.existingTurnitinIds}
        totalScriptCount={shellData.totalScriptCount}
        markedScriptCount={shellData.markedScriptCount}
        myAllocatedScriptCount={shellData.myAllocatedScriptCount}
        myMarkedScriptCount={shellData.myMarkedScriptCount}
        moderation={shellData.moderation}
      >
        <Suspense fallback={<AssessmentSubmissionsSkeleton />}>
          <AssessmentSubmissionsContent
            assessmentId={assessmentId}
            moduleId={moduleId}
            currentUserId={session.user.id}
            isArchived={shellData.isArchived}
            canManageAssessment={shellData.canManageAssessment}
            currentUserCanMarkAll={shellData.currentUserCanMarkAll}
            markerOptions={shellData.markerOptions}
            moduleLeaderOptions={shellData.moduleLeaderOptions}
          />
        </Suspense>
      </AssessmentWorkspaceShell>
    </>
  );
}
