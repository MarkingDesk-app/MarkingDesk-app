import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { ModulePageClient } from "./module-page-client";
import { PageBreadcrumbs } from "@/components/breadcrumb-context";
import { formatModerationStatus } from "@/lib/assessment-utils";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@/lib/user-display";

type ModulePageProps = {
  params: Promise<{ moduleId: string }>;
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

export default async function ModulePage({ params }: ModulePageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  const { moduleId } = await params;

  const moduleRecord = await prisma.module.findUnique({
    where: { id: moduleId },
    select: {
      id: true,
      code: true,
      title: true,
    },
  });

  if (!moduleRecord) {
    notFound();
  }

  const moduleLeaders = await prisma.moduleMembership.findMany({
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
    orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
  });

  const currentUserIsLeader = moduleLeaders.some((membership) => membership.userId === session.user.id);
  const canManageModule = session.user.role === Role.ADMIN || currentUserIsLeader;
  const accessibleInstanceWhere = {
    OR: [
      {
        moderatorUserId: session.user.id,
      },
      {
        markerAssignments: {
          some: {
            userId: session.user.id,
            active: true,
          },
        },
      },
    ],
  };

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
            some: accessibleInstanceWhere,
          },
        },
    orderBy: { name: "asc" },
    include: {
      assessmentInstances: {
        ...(canManageModule ? {} : { where: accessibleInstanceWhere }),
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

  if (!canManageModule && assessmentTemplates.length === 0) {
    notFound();
  }

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
    <>
      <PageBreadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: moduleRecord.code, href: `/modules/${moduleRecord.id}`, current: true },
        ]}
      />
      <ModulePageClient
        moduleId={moduleRecord.id}
        moduleCode={moduleRecord.code}
        moduleTitle={moduleRecord.title}
        canManageModule={canManageModule}
        currentUserIsLeader={currentUserIsLeader}
        moduleLeaders={moduleLeaders.map((membership) => ({
            id: membership.id,
            userId: membership.user.id,
            displayName: getDisplayName(membership.user),
            email: membership.user.email,
            meta:
              membership.user.passwordHash && membership.user.emailVerified
                ? undefined
                : "Invitation pending",
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
              email: assignment.user.email,
              meta:
                assignment.user.passwordHash && assignment.user.emailVerified
                  ? undefined
                  : "Invitation pending",
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
              email: assignment.user.email,
              meta:
                assignment.user.passwordHash && assignment.user.emailVerified
                  ? undefined
                  : "Invitation pending",
            })),
          })),
        }))}
      />
    </>
  );
}
