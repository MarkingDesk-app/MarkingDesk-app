import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DashboardClient } from "./dashboard-client";
import { PageBreadcrumbs } from "@/components/breadcrumb-context";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@/lib/user-display";
import type { UserPickerOption } from "@/components/ui/user-picker";

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

type MarkerProgressSummary = {
  markerId: string;
  markerName: string;
  allocatedScripts: number;
  markedScripts: number;
  remainingScripts: number;
  progressPercentage: number;
};

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
      totalScripts: number;
      markedScripts: number;
      myAllocatedScripts: number;
      myMarkedScripts: number;
    }[];
  }[];
  markerProgress: MarkerProgressSummary[];
}, currentUserId: string, role: Role) {
  const allInstances = module.assessmentTemplates.flatMap((template) => template.assessmentInstances);
  const totalScripts = allInstances.reduce((sum, instance) => sum + instance.totalScripts, 0);
  const markedScripts = allInstances.reduce((sum, instance) => sum + instance.markedScripts, 0);
  const remainingScripts = totalScripts - markedScripts;
  const myAllocatedScripts = allInstances.reduce((sum, instance) => sum + instance.myAllocatedScripts, 0);
  const myMarkedScripts = allInstances.reduce((sum, instance) => sum + instance.myMarkedScripts, 0);
  const nextDeadline = allInstances
    .map((instance) => instance.dueAt)
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
  const progressPercentage = totalScripts === 0 ? 0 : Math.round((markedScripts / totalScripts) * 100);
  const leaders = module.memberships
    .filter((membership) => membership.isLeader)
    .map((membership) => getDisplayName(membership.user));
  const moderatedAssessments = allInstances.filter((instance) => instance.moderatorUserId === currentUserId).length;
  const currentUserIsLeader = module.memberships.some(
    (membership) => membership.userId === currentUserId && membership.isLeader
  );
  const canViewMarkerProgress = role === Role.ADMIN || currentUserIsLeader;

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
    currentUserIsLeader,
    currentUserIsModerator: moderatedAssessments > 0,
    moderatedAssessments,
    markerProgress: canViewMarkerProgress ? module.markerProgress : [],
    leaderSummary:
      leaders.length === 0
        ? "Module leader not assigned"
        : leaders.length === 1
          ? `Module leader: ${leaders[0]}`
          : `Module leaders: ${leaders.join(", ")}`,
  };
}

function buildCountMap(rows: { assessmentInstanceId: string; _count: { _all: number } }[]) {
  return new Map(rows.map((row) => [row.assessmentInstanceId, row._count._all]));
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
            _count: {
              select: {
                scripts: true,
              },
            },
          },
        },
      },
    },
  } as const;

  const modules = await prisma.module.findMany({
    where:
      role === Role.ADMIN
        ? undefined
        : {
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

  const instanceIds = modules.flatMap((module) =>
    module.assessmentTemplates.flatMap((template) => template.assessmentInstances.map((instance) => instance.id))
  );
  const moduleIdByInstanceId = new Map(
    modules.flatMap((module) =>
      module.assessmentTemplates.flatMap((template) =>
        template.assessmentInstances.map((instance) => [instance.id, module.id] as const)
      )
    )
  );

  let markedCounts: { assessmentInstanceId: string; _count: { _all: number } }[] = [];
  let myAllocationCounts: { assessmentInstanceId: string; _count: { _all: number } }[] = [];
  let myMarkedCounts: { assessmentInstanceId: string; _count: { _all: number } }[] = [];
  let allocationRows: {
    markerUserId: string;
    marker: {
      id: string;
      name: string | null;
      email: string | null;
    };
    script: {
      assessmentInstanceId: string;
      grade: number | null;
    };
  }[] = [];

  if (instanceIds.length) {
    [markedCounts, myAllocationCounts, myMarkedCounts, allocationRows] = await Promise.all([
      prisma.script.groupBy({
        by: ["assessmentInstanceId"],
        where: {
          assessmentInstanceId: { in: instanceIds },
          grade: { not: null },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.script.groupBy({
        by: ["assessmentInstanceId"],
        where: {
          assessmentInstanceId: { in: instanceIds },
          allocation: {
            is: {
              markerUserId: userId,
            },
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.script.groupBy({
        by: ["assessmentInstanceId"],
        where: {
          assessmentInstanceId: { in: instanceIds },
          grade: { not: null },
          allocation: {
            is: {
              markerUserId: userId,
            },
          },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.allocation.findMany({
        where: {
          script: {
            assessmentInstanceId: { in: instanceIds },
          },
        },
        select: {
          markerUserId: true,
          marker: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          script: {
            select: {
              assessmentInstanceId: true,
              grade: true,
            },
          },
        },
      }),
    ]);
  }

  const markedCountByInstanceId = buildCountMap(markedCounts);
  const myAllocationCountByInstanceId = buildCountMap(myAllocationCounts);
  const myMarkedCountByInstanceId = buildCountMap(myMarkedCounts);
  const markerProgressByModuleId = new Map<string, Map<string, Omit<MarkerProgressSummary, "remainingScripts" | "progressPercentage">>>();

  for (const allocation of allocationRows) {
    const moduleId = moduleIdByInstanceId.get(allocation.script.assessmentInstanceId);

    if (!moduleId) {
      continue;
    }

    const currentModuleProgress = markerProgressByModuleId.get(moduleId) ?? new Map();
    const currentMarkerProgress = currentModuleProgress.get(allocation.markerUserId) ?? {
      markerId: allocation.markerUserId,
      markerName: getDisplayName(allocation.marker),
      allocatedScripts: 0,
      markedScripts: 0,
    };

    currentMarkerProgress.allocatedScripts += 1;

    if (allocation.script.grade !== null) {
      currentMarkerProgress.markedScripts += 1;
    }

    currentModuleProgress.set(allocation.markerUserId, currentMarkerProgress);
    markerProgressByModuleId.set(moduleId, currentModuleProgress);
  }

  return modules.map((module) =>
    summarizeModule(
      {
        ...module,
        assessmentTemplates: module.assessmentTemplates.map((template) => ({
          ...template,
          assessmentInstances: template.assessmentInstances.map((instance) => ({
            id: instance.id,
            dueAt: instance.dueAt,
            moderatorUserId: instance.moderatorUserId,
            totalScripts: instance._count.scripts,
            markedScripts: markedCountByInstanceId.get(instance.id) ?? 0,
            myAllocatedScripts: myAllocationCountByInstanceId.get(instance.id) ?? 0,
            myMarkedScripts: myMarkedCountByInstanceId.get(instance.id) ?? 0,
          })),
        })),
        markerProgress: Array.from(markerProgressByModuleId.get(module.id)?.values() ?? [])
          .map((marker) => ({
            ...marker,
            remainingScripts: marker.allocatedScripts - marker.markedScripts,
            progressPercentage:
              marker.allocatedScripts === 0 ? 0 : Math.round((marker.markedScripts / marker.allocatedScripts) * 100),
          }))
          .sort((left, right) => left.markerName.localeCompare(right.markerName)),
      },
      userId,
      role
    )
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  const modules = await getDashboardModules(session.user.id, session.user.role);
  const currentUserOption: UserPickerOption = {
    id: session.user.id,
    name: session.user.name?.trim() || session.user.email?.trim() || "Current user",
    email: session.user.email?.trim() || "",
  };

  return (
    <>
      <PageBreadcrumbs items={[{ label: "Dashboard", href: "/dashboard", current: true }]} />
      <DashboardClient
        currentUserId={session.user.id}
        isAdmin={session.user.role === Role.ADMIN}
        modules={modules}
        currentUserOption={currentUserOption}
      />
    </>
  );
}
