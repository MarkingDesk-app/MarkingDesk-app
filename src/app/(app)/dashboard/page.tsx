import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DashboardClient } from "./dashboard-client";
import { PageBreadcrumbs } from "@/components/breadcrumb-context";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@/lib/user-display";

function formatDeadline(date: Date | null): string {
  if (!date) {
    return "No deadline set";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(date);
}

function summarizeModule(module: {
  id: string;
  code: string;
  title: string;
  memberships: { userId: string; isLeader: boolean; user: { id: string; name: string; email: string | null } }[];
  assessmentTemplates: {
    id: string;
    assessmentInstances: {
      id: string;
      dueAt: Date;
      moderatorUserId: string | null;
      scripts: { id: string; grade: number | null; allocation: { markerUserId: string } | null }[];
    }[];
  }[];
}, currentUserId: string) {
  const allInstances = module.assessmentTemplates.flatMap((template) => template.assessmentInstances);
  const totalScripts = allInstances.reduce((sum, instance) => sum + instance.scripts.length, 0);
  const markedScripts = allInstances.reduce(
    (sum, instance) => sum + instance.scripts.filter((script) => script.grade !== null).length,
    0
  );
  const remainingScripts = totalScripts - markedScripts;
  const myAllocatedScripts = allInstances.reduce(
    (sum, instance) =>
      sum + instance.scripts.filter((script) => script.allocation?.markerUserId === currentUserId).length,
    0
  );
  const myMarkedScripts = allInstances.reduce(
    (sum, instance) =>
      sum +
      instance.scripts.filter(
        (script) => script.allocation?.markerUserId === currentUserId && script.grade !== null
      ).length,
    0
  );
  const nextDeadline = allInstances
    .map((instance) => instance.dueAt)
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
  const progressPercentage = totalScripts === 0 ? 0 : Math.round((markedScripts / totalScripts) * 100);
  const leaders = module.memberships
    .filter((membership) => membership.isLeader)
    .map((membership) => getDisplayName(membership.user));
  const moderatedAssessments = allInstances.filter((instance) => instance.moderatorUserId === currentUserId).length;

  return {
    id: module.id,
    code: module.code,
    title: module.title,
    assessments: module.assessmentTemplates.length,
    totalScripts,
    markedScripts,
    remainingScripts,
    myAllocatedScripts,
    myMarkedScripts,
    nextDeadline: formatDeadline(nextDeadline),
    progressPercentage,
    currentUserIsLeader: module.memberships.some(
      (membership) => membership.userId === currentUserId && membership.isLeader
    ),
    currentUserIsModerator: moderatedAssessments > 0,
    moderatedAssessments,
    leaderSummary:
      leaders.length === 0
        ? "Module leader not assigned"
        : leaders.length === 1
          ? `Module leader: ${leaders[0]}`
          : `Module leaders: ${leaders.join(", ")}`,
  };
}

async function getDashboardModules(userId: string, role: Role) {
  const includeConfig = {
    memberships: {
      where: { active: true, isLeader: true },
      select: {
        userId: true,
        isLeader: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    },
    assessmentTemplates: {
      where: {
        isArchived: false,
      },
      include: {
        assessmentInstances: {
          select: {
            id: true,
            dueAt: true,
            moderatorUserId: true,
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
      },
    },
  } as const;

  if (role === Role.ADMIN) {
    const modules = await prisma.module.findMany({
      orderBy: { code: "asc" },
      include: includeConfig,
    });

    return modules.map((module) => summarizeModule(module, userId));
  }

  const modules = await prisma.module.findMany({
    where: {
      OR: [
        {
          memberships: {
            some: {
              userId,
              active: true,
              isLeader: true,
            },
          },
        },
        {
          assessmentTemplates: {
            some: {
              isArchived: false,
              assessmentInstances: {
                some: {
                  moderatorUserId: userId,
                },
              },
            },
          },
        },
        {
          assessmentTemplates: {
            some: {
              isArchived: false,
              assessmentInstances: {
                some: {
                  markerAssignments: {
                    some: {
                      userId,
                      active: true,
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
    include: includeConfig,
    orderBy: { code: "asc" },
  });

  return modules.map((module) => summarizeModule(module, userId));
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  const [modules, users] = await Promise.all([
    getDashboardModules(session.user.id, session.user.role),
    prisma.user.findMany({
      orderBy: [{ name: "asc" }, { email: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        emailVerified: true,
      },
    }),
  ]);

  return (
    <>
      <PageBreadcrumbs items={[{ label: "Dashboard", href: "/dashboard", current: true }]} />
      <DashboardClient
        currentUserId={session.user.id}
        modules={modules}
        allUsers={users.map((user) => ({
          id: user.id,
          name: getDisplayName(user),
          email: user.email,
          meta:
            user.passwordHash && user.emailVerified
              ? undefined
              : "Invitation pending",
        }))}
      />
    </>
  );
}
