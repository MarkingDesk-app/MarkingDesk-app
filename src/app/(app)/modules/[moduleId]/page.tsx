import { ModuleRole, Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { ModulePageClient } from "./module-page-client";
import { formatModerationStatus } from "@/lib/assessment-utils";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ModulePageProps = {
  params: Promise<{ moduleId: string }>;
};

function getTopMembershipRole(memberships: { role: ModuleRole }[]): ModuleRole | null {
  if (memberships.some((membership) => membership.role === ModuleRole.MODULE_LEADER)) {
    return ModuleRole.MODULE_LEADER;
  }

  if (memberships.some((membership) => membership.role === ModuleRole.MODERATOR)) {
    return ModuleRole.MODERATOR;
  }

  if (memberships.some((membership) => membership.role === ModuleRole.MARKER)) {
    return ModuleRole.MARKER;
  }

  return null;
}

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
              role: true,
            },
          },
        },
        orderBy: [{ active: "desc" }, { role: "asc" }, { user: { name: "asc" } }],
      },
    },
  });

  if (!moduleRecord) {
    notFound();
  }

  const currentUserMemberships = moduleRecord.memberships.filter(
    (membership) => membership.userId === session.user.id && membership.active
  );
  const membershipRole = getTopMembershipRole(currentUserMemberships);
  const isAllowed = session.user.role === Role.ADMIN || currentUserMemberships.length > 0;
  const canManageModule =
    session.user.role === Role.ADMIN ||
    currentUserMemberships.some((membership) => membership.role === ModuleRole.MODULE_LEADER);

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
      currentRole={membershipRole ?? Role.ADMIN}
      activeMembers={activeMembers.map((membership) => ({
        id: membership.id,
        role: membership.role,
        displayName: getDisplayName(membership.user),
        email: membership.user.email,
      }))}
      allUsers={users.map((user) => ({
        id: user.id,
        displayName: getDisplayName(user),
        email: user.email,
      }))}
      moderatorOptions={activeMembers
        .filter((membership) => membership.role === ModuleRole.MODERATOR)
        .map((membership) => ({
          id: membership.user.id,
          displayName: getDisplayName(membership.user),
          email: membership.user.email,
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
