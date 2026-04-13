import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { DashboardClient } from "./dashboard-client";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { PageBreadcrumbs } from "@/components/breadcrumb-context";
import { getCurrentAcademicYearLabel } from "@/lib/academic-year";
import { authOptions } from "@/lib/auth";
import { buildDashboardProgressSummary } from "@/lib/dashboard-utils";
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
}, currentUserId: string) {
  const allInstances = module.assessmentTemplates.flatMap((template) => template.assessmentInstances);
  const progressSummary = buildDashboardProgressSummary(allInstances, currentUserId);
  const leaders = module.memberships
    .filter((membership) => membership.isLeader)
    .map((membership) => getDisplayName(membership.user));
  const currentUserIsLeader = module.memberships.some(
    (membership) => membership.userId === currentUserId && membership.isLeader
  );

  return {
    id: module.id,
    code: module.code,
    title: module.title,
    assessments: module.assessmentTemplates.length,
    totalScripts: progressSummary.totalScripts,
    markedScripts: progressSummary.markedScripts,
    remainingScripts: progressSummary.remainingScripts,
    myAllocatedScripts: progressSummary.myAllocatedScripts,
    myMarkedScripts: progressSummary.myMarkedScripts,
    nextDeadline: formatDeadline(progressSummary.nextDeadline),
    progressPercentage: progressSummary.progressPercentage,
    currentUserIsLeader,
    currentUserIsModerator: progressSummary.moderatedAssessments > 0,
    moderatedAssessments: progressSummary.moderatedAssessments,
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
  const currentAcademicYear = getCurrentAcademicYearLabel(new Date());
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
        assessmentInstances: {
          some: {
            academicYear: currentAcademicYear,
          },
        },
      },
      include: {
        assessmentInstances: {
          where: {
            academicYear: currentAcademicYear,
          },
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
                        academicYear: currentAcademicYear,
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
                        academicYear: currentAcademicYear,
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

  let markedCounts: { assessmentInstanceId: string; _count: { _all: number } }[] = [];
  let myAllocationCounts: { assessmentInstanceId: string; _count: { _all: number } }[] = [];
  let myMarkedCounts: { assessmentInstanceId: string; _count: { _all: number } }[] = [];

  if (instanceIds.length) {
    [markedCounts, myAllocationCounts, myMarkedCounts] = await Promise.all([
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
    ]);
  }

  const markedCountByInstanceId = buildCountMap(markedCounts);
  const myAllocationCountByInstanceId = buildCountMap(myAllocationCounts);
  const myMarkedCountByInstanceId = buildCountMap(myMarkedCounts);

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
      },
      userId
    )
  );
}

async function DashboardContent({
  currentUserId,
  currentUserOption,
  role,
}: {
  currentUserId: string;
  currentUserOption: UserPickerOption;
  role: Role;
}) {
  const modules = await getDashboardModules(currentUserId, role);

  return (
    <DashboardClient
      currentUserId={currentUserId}
      isAdmin={role === Role.ADMIN}
      modules={modules}
      currentUserOption={currentUserOption}
    />
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  const currentUserOption: UserPickerOption = {
    id: session.user.id,
    name: session.user.name?.trim() || session.user.email?.trim() || "Current user",
    email: session.user.email?.trim() || "",
  };

  return (
    <>
      <PageBreadcrumbs items={[{ label: "Dashboard", href: "/dashboard", current: true }]} />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent
          currentUserId={session.user.id}
          role={session.user.role}
          currentUserOption={currentUserOption}
        />
      </Suspense>
    </>
  );
}
