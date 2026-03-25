import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { ModulePageClient } from "./module-page-client";
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
                },
              },
            },
          },
        },
      },
      memberships: {
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
        orderBy: [{ active: "desc" }, { isLeader: "desc" }, { user: { name: "asc" } }],
      },
    },
  });

  if (!moduleRecord) {
    notFound();
  }

  const currentUserMemberships = moduleRecord.memberships.filter(
    (membership) => membership.userId === session.user.id && membership.active
  );
  const isAllowed = session.user.role === Role.ADMIN || currentUserMemberships.length > 0;
  const canManageModule =
    session.user.role === Role.ADMIN || currentUserMemberships.some((membership) => membership.isLeader);

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

  const activeMembers = moduleRecord.memberships.filter((membership) => membership.active);

  return (
    <ModulePageClient
      moduleId={moduleRecord.id}
      moduleCode={moduleRecord.code}
      moduleTitle={moduleRecord.title}
      canManageModule={canManageModule}
      currentUserIsLeader={currentUserMemberships.some((membership) => membership.isLeader)}
      activeMembers={activeMembers.map((membership) => ({
        id: membership.id,
        userId: membership.user.id,
        isLeader: membership.isLeader,
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
      moderatorOptions={activeMembers.map((membership) => ({
        id: membership.user.id,
        name: getDisplayName(membership.user),
        email: membership.user.email,
        meta:
          membership.user.passwordHash && membership.user.emailVerified
            ? undefined
            : "Invitation pending",
      }))}
      assessments={moduleRecord.assessmentTemplates.map((template) => ({
        id: template.id,
        name: template.name,
        instances: template.assessmentInstances.map((instance) => ({
          id: instance.id,
          academicYear: instance.academicYear,
          dueAt: formatDateTime(instance.dueAt),
          markingDeadlineAt: formatDateTime(instance.markingDeadlineAt),
          moderatorName: instance.moderatorUser ? getDisplayName(instance.moderatorUser) : null,
          moderationStatus: formatModerationStatus(instance.moderationStatus),
          totalScripts: instance.scripts.length,
          markedScripts: instance.scripts.filter((script) => script.grade !== null).length,
        })),
      }))}
    />
  );
}
