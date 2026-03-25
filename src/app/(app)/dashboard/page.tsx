import { ModuleRole, Role } from "@prisma/client";
import { ArrowRight, BookCopy, CheckCircle2, Clock3, FolderKanban } from "lucide-react";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { RoleBadge } from "@/components/role-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  memberships: { role: ModuleRole; user: { id: string; name: string; email: string | null } }[];
  assessmentTemplates: {
    id: string;
    assessmentInstances: {
      id: string;
      dueAt: Date;
      scripts: { id: string; grade: number | null }[];
    }[];
  }[];
  membershipRole?: ModuleRole | Role;
}) {
  const allInstances = module.assessmentTemplates.flatMap((template) => template.assessmentInstances);
  const totalScripts = allInstances.reduce((sum, instance) => sum + instance.scripts.length, 0);
  const markedScripts = allInstances.reduce(
    (sum, instance) => sum + instance.scripts.filter((script) => script.grade !== null).length,
    0
  );
  const remainingScripts = totalScripts - markedScripts;
  const nextDeadline = allInstances
    .map((instance) => instance.dueAt)
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
  const progressPercentage = totalScripts === 0 ? 0 : Math.round((markedScripts / totalScripts) * 100);
  const leaders = module.memberships
    .filter((membership) => membership.role === ModuleRole.MODULE_LEADER)
    .map((membership) => getDisplayName(membership.user));

  return {
    id: module.id,
    code: module.code,
    title: module.title,
    membershipRole: module.membershipRole ?? Role.ADMIN,
    assessments: module.assessmentTemplates.length,
    totalScripts,
    markedScripts,
    remainingScripts,
    nextDeadline,
    progressPercentage,
    leaderSummary:
      leaders.length === 0
        ? "Module leader not assigned"
        : leaders.length === 1
          ? `Module leader: ${leaders[0]}`
          : `Module leaders: ${leaders.join(", ")}`,
  };
}

async function getDashboardData(userId: string, role: Role) {
  if (role === Role.ADMIN) {
    const modules = await prisma.module.findMany({
      orderBy: { code: "asc" },
      include: {
        memberships: {
          where: {
            active: true,
          },
          select: {
            role: true,
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
          include: {
            assessmentInstances: {
              select: {
                id: true,
                dueAt: true,
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
      },
    });

    return modules.map((module) => summarizeModule(module));
  }

  const moduleMemberships = await prisma.moduleMembership.findMany({
    where: { userId, active: true },
    include: {
      module: {
        include: {
          memberships: {
            where: {
              active: true,
            },
            select: {
              role: true,
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
            include: {
              assessmentInstances: {
                select: {
                  id: true,
                  dueAt: true,
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
        },
      },
    },
    orderBy: { module: { code: "asc" } },
  });

  return moduleMemberships.map((membership) =>
    summarizeModule({
      ...membership.module,
      membershipRole: membership.role,
    })
  );
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  const modules = await getDashboardData(session.user.id, session.user.role);
  const totalAssessments = modules.reduce((sum, module) => sum + module.assessments, 0);
  const totalScripts = modules.reduce((sum, module) => sum + module.totalScripts, 0);
  const totalMarked = modules.reduce((sum, module) => sum + module.markedScripts, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Marking overview</h1>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-sm">Modules</span>
                <BookCopy className="h-4 w-4 text-sky-600" />
              </div>
              <CardTitle className="text-3xl">{modules.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-sm">Assessments</span>
                <FolderKanban className="h-4 w-4 text-sky-600" />
              </div>
              <CardTitle className="text-3xl">{totalAssessments}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-sm">Marked submissions</span>
                <CheckCircle2 className="h-4 w-4 text-sky-600" />
              </div>
              <CardTitle className="text-3xl">
                {totalMarked}/{totalScripts}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      </section>

      <section id="modules" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Modules</h2>
            <p className="mt-1 text-sm text-slate-600">Progress and upcoming deadlines across your active modules.</p>
          </div>
        </div>

        {modules.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-sm text-slate-600">
              No modules assigned yet. Add memberships from the admin or module management screens.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {modules.map((module) => (
              <Link
                key={module.id}
                href={`/modules/${module.id}`}
                className="group rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-sky-200"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{module.code}</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{module.title}</h3>
                  </div>
                  <RoleBadge role={module.membershipRole} />
                </div>

                <p className="mt-3 text-sm text-slate-600">{module.leaderSummary}</p>

                <div className="mt-5 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Marking Progress</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      {module.markedScripts}/{module.totalScripts} completed
                    </p>
                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200/70">
                      <div
                        className="h-full rounded-full bg-sky-600 transition-[width]"
                        style={{ width: `${module.progressPercentage}%` }}
                      />
                    </div>
                    <p className="mt-3 text-sm text-slate-500">{module.remainingScripts} submissions remaining</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Next Deadline</p>
                    <div className="mt-3 flex items-start gap-3">
                      <Clock3 className="mt-0.5 h-4 w-4 text-sky-600" />
                      <div className="space-y-2 text-sm text-slate-600">
                        <p>{formatDeadline(module.nextDeadline)}</p>
                        <p>{module.assessments} assessments in this module</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-sky-700">
                  Open module
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
