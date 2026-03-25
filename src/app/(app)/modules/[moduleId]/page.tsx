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
    include: {
      assessmentTemplates: {
        orderBy: { name: "asc" },
        include: {
          assessmentInstances: {
            orderBy: { academicYear: "desc" },
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
              scripts: {
                select: {
                  id: true,
                  grade: true,
                  allocation: {
                    select: {
                      markerUserId: true,
                    },
                  },
                },
              },
            },
          },
          archivedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      memberships: {
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
        orderBy: [{ isLeader: "desc" }, { user: { name: "asc" } }],
      },
    },
  });

  if (!moduleRecord) {
    notFound();
  }

  const currentUserMemberships = moduleRecord.memberships.filter((membership) => membership.userId === session.user.id);
  const currentUserIsLeader = currentUserMemberships.some((membership) => membership.isLeader);
  const hasAssessmentAccess = moduleRecord.assessmentTemplates.some(
    (template) =>
      !template.isArchived &&
      template.assessmentInstances.some(
        (instance) =>
          instance.moderatorUser?.id === session.user.id ||
          instance.markerAssignments.some((assignment) => assignment.userId === session.user.id)
      )
  );
  const isAllowed = session.user.role === Role.ADMIN || currentUserIsLeader || hasAssessmentAccess;
  const canManageModule = session.user.role === Role.ADMIN || currentUserIsLeader;

  if (!isAllowed) {
    notFound();
  }

  const users = canManageModule
    ? await prisma.user.findMany({
        orderBy: [{ name: "asc" }, { email: "asc" }],
        select: {
          id: true,
          name: true,
          email: true,
          passwordHash: true,
          emailVerified: true,
        },
      })
    : [];

  const activeAssessmentTemplates = moduleRecord.assessmentTemplates
    .filter((template) => !template.isArchived)
    .map((template) => ({
      ...template,
      assessmentInstances: canManageModule
        ? template.assessmentInstances
        : template.assessmentInstances.filter(
            (instance) =>
              instance.moderatorUser?.id === session.user.id ||
              instance.markerAssignments.some((assignment) => assignment.userId === session.user.id)
          ),
    }))
    .filter((template) => template.assessmentInstances.length > 0);

  const archivedAssessmentTemplates = canManageModule
    ? moduleRecord.assessmentTemplates.filter((template) => template.isArchived)
    : [];

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
        moduleLeaders={moduleRecord.memberships
          .filter((membership) => membership.isLeader)
          .map((membership) => ({
            id: membership.id,
            userId: membership.user.id,
            displayName: getDisplayName(membership.user),
            email: membership.user.email,
            meta:
              membership.user.passwordHash && membership.user.emailVerified
                ? undefined
                : "Invitation pending",
          }))}
        allUsers={users.map((user) => ({
          id: user.id,
          name: getDisplayName(user),
          email: user.email,
          meta:
            user.passwordHash && user.emailVerified
              ? undefined
              : "Invitation pending",
        }))}
        assessments={activeAssessmentTemplates.map((template) => ({
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
            totalScripts: instance.scripts.length,
            markedScripts: instance.scripts.filter((script) => script.grade !== null).length,
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
          totalScripts: template.assessmentInstances.reduce((sum, instance) => sum + instance.scripts.length, 0),
          totalMarkedScripts: template.assessmentInstances.reduce(
            (sum, instance) => sum + instance.scripts.filter((script) => script.grade !== null).length,
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
            totalScripts: instance.scripts.length,
            markedScripts: instance.scripts.filter((script) => script.grade !== null).length,
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
