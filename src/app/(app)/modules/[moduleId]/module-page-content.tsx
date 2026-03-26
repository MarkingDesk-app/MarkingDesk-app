import { ModulePageClient } from "./module-page-client";
import { formatModerationStatus } from "@/lib/assessment-utils";
import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@/lib/user-display";

type ModuleLeaderMembership = {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    passwordHash: string | null;
    emailVerified: Date | null;
  };
};

type ModulePageContentProps = {
  moduleId: string;
  moduleCode: string;
  moduleTitle: string;
  currentUserId: string;
  canManageModule: boolean;
  currentUserIsLeader: boolean;
  moduleLeaders: ModuleLeaderMembership[];
};

const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  emailVerified: true,
} as const;

function buildMarkedCountMap(rows: { assessmentInstanceId: string; _count: { _all: number } }[]) {
  return new Map(rows.map((row) => [row.assessmentInstanceId, row._count._all]));
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

export async function ModulePageContent({
  moduleId,
  moduleCode,
  moduleTitle,
  currentUserId,
  canManageModule,
  currentUserIsLeader,
  moduleLeaders,
}: ModulePageContentProps) {
  const assessmentTemplates = await prisma.assessmentTemplate.findMany({
    where: canManageModule
      ? {
          moduleId,
          isArchived: false,
        }
      : {
          moduleId,
          isArchived: false,
          assessmentInstances: {
            some: {
              OR: [
                {
                  moderatorUserId: currentUserId,
                },
                {
                  markerAssignments: {
                    some: {
                      userId: currentUserId,
                      active: true,
                    },
                  },
                },
              ],
            },
          },
        },
    orderBy: { name: "asc" },
    include: {
      assessmentInstances: {
        ...(canManageModule
          ? {}
          : {
              where: {
                OR: [
                  {
                    moderatorUserId: currentUserId,
                  },
                  {
                    markerAssignments: {
                      some: {
                        userId: currentUserId,
                        active: true,
                      },
                    },
                  },
                ],
              },
            }),
        orderBy: { academicYear: "desc" },
        include: {
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
          moderatorUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              scripts: true,
            },
          },
        },
      },
    },
  });

  const archivedAssessmentTemplates = canManageModule
    ? await prisma.assessmentTemplate.findMany({
        where: {
          moduleId,
          isArchived: true,
        },
        orderBy: { name: "asc" },
        include: {
          archivedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          assessmentInstances: {
            orderBy: { academicYear: "desc" },
            include: {
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
              moderatorUser: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              _count: {
                select: {
                  scripts: true,
                },
              },
            },
          },
        },
      })
    : [];

  const allInstanceIds = [...assessmentTemplates, ...archivedAssessmentTemplates].flatMap((template) =>
    template.assessmentInstances.map((instance) => instance.id)
  );
  const markedScriptCounts = allInstanceIds.length
    ? await prisma.script.groupBy({
        by: ["assessmentInstanceId"],
        where: {
          assessmentInstanceId: { in: allInstanceIds },
          grade: { not: null },
        },
        _count: {
          _all: true,
        },
      })
    : [];
  const markedScriptCountByInstanceId = buildMarkedCountMap(markedScriptCounts);

  return (
    <ModulePageClient
      moduleId={moduleId}
      moduleCode={moduleCode}
      moduleTitle={moduleTitle}
      canManageModule={canManageModule}
      currentUserIsLeader={currentUserIsLeader}
      moduleLeaders={moduleLeaders.map((membership) => ({
        id: membership.id,
        userId: membership.user.id,
        displayName: getDisplayName(membership.user),
        email: membership.user.email ?? "",
        meta: membership.user.passwordHash && membership.user.emailVerified ? undefined : "Invitation pending",
      }))}
      assessments={assessmentTemplates.map((template) => ({
        id: template.id,
        name: template.name,
        instances: template.assessmentInstances.map((instance) => ({
          id: instance.id,
          label: `${template.name} / ${instance.academicYear}`,
          academicYear: instance.academicYear,
          dueAt: formatDateTime(instance.dueAt),
          markingDeadlineAt: formatDateTime(instance.markingDeadlineAt),
          moderatorName: instance.moderatorUser ? getDisplayName(instance.moderatorUser) : null,
          moderationStatus: formatModerationStatus(instance.moderationStatus),
          totalScripts: instance._count.scripts,
          markedScripts: markedScriptCountByInstanceId.get(instance.id) ?? 0,
          teamMembers: instance.markerAssignments.map((assignment) => ({
            userId: assignment.user.id,
            displayName: getDisplayName(assignment.user),
            email: assignment.user.email ?? "",
            meta: assignment.user.passwordHash && assignment.user.emailVerified ? undefined : "Invitation pending",
          })),
        })),
      }))}
      archivedAssessments={archivedAssessmentTemplates.map((template) => ({
        id: template.id,
        name: template.name,
        archivedAt: template.archivedAt ? formatDateTime(template.archivedAt) : "Not set",
        archivedBy: template.archivedBy ? getDisplayName(template.archivedBy) : "Unknown",
        totalScripts: template.assessmentInstances.reduce((sum, instance) => sum + instance._count.scripts, 0),
        totalMarkedScripts: template.assessmentInstances.reduce(
          (sum, instance) => sum + (markedScriptCountByInstanceId.get(instance.id) ?? 0),
          0
        ),
        instances: template.assessmentInstances.map((instance) => ({
          id: instance.id,
          label: `${template.name} / ${instance.academicYear}`,
          academicYear: instance.academicYear,
          dueAt: formatDateTime(instance.dueAt),
          markingDeadlineAt: formatDateTime(instance.markingDeadlineAt),
          moderatorName: instance.moderatorUser ? getDisplayName(instance.moderatorUser) : null,
          moderationStatus: formatModerationStatus(instance.moderationStatus),
          totalScripts: instance._count.scripts,
          markedScripts: markedScriptCountByInstanceId.get(instance.id) ?? 0,
          teamMembers: instance.markerAssignments.map((assignment) => ({
            userId: assignment.user.id,
            displayName: getDisplayName(assignment.user),
            email: assignment.user.email ?? "",
            meta: assignment.user.passwordHash && assignment.user.emailVerified ? undefined : "Invitation pending",
          })),
        })),
      }))}
    />
  );
}
