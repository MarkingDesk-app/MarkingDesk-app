import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageBreadcrumbs } from "@/components/breadcrumb-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(date);
}

function formatMonth(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(date);
}

export default async function DashboardTimelinePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  const assessments = await prisma.assessmentInstance.findMany({
    where: {
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
    },
    orderBy: [{ dueAt: "asc" }, { markingDeadlineAt: "asc" }],
    select: {
      id: true,
      academicYear: true,
      dueAt: true,
      markingDeadlineAt: true,
      moderatorUserId: true,
      markerAssignments: {
        where: {
          userId: session.user.id,
          active: true,
        },
        select: {
          id: true,
        },
      },
      assessmentTemplate: {
        select: {
          name: true,
          module: {
            select: {
              id: true,
              code: true,
              title: true,
            },
          },
        },
      },
      scripts: {
        select: {
          grade: true,
          allocation: {
            select: {
              markerUserId: true,
            },
          },
        },
      },
    },
  });

  const items = assessments.map((assessment) => {
    const myAllocatedScripts = assessment.scripts.filter(
      (script) => script.allocation?.markerUserId === session.user.id
    ).length;
    const myMarkedScripts = assessment.scripts.filter(
      (script) => script.allocation?.markerUserId === session.user.id && script.grade !== null
    ).length;
    const isModerator = assessment.moderatorUserId === session.user.id;
    const isMarker = assessment.markerAssignments.length > 0;

    return {
      id: assessment.id,
      monthKey: formatMonth(assessment.dueAt),
      moduleCode: assessment.assessmentTemplate.module.code,
      moduleId: assessment.assessmentTemplate.module.id,
      moduleTitle: assessment.assessmentTemplate.module.title,
      assessmentName: assessment.assessmentTemplate.name,
      academicYear: assessment.academicYear,
      dueAt: formatDateTime(assessment.dueAt),
      markingDeadlineAt: formatDateTime(assessment.markingDeadlineAt),
      myAllocatedScripts,
      myMarkedScripts,
      roleLabel: isModerator && isMarker ? "Marker and moderator" : isModerator ? "Moderator" : "Marker",
    };
  });

  const groupedItems = items.reduce<Record<string, typeof items>>((groups, item) => {
    groups[item.monthKey] = [...(groups[item.monthKey] ?? []), item];
    return groups;
  }, {});

  const monthKeys = Object.keys(groupedItems);

  return (
    <div className="space-y-6">
      <PageBreadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Timeline", href: "/dashboard/timeline", current: true },
        ]}
      />
      <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Timeline</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Assigned marking across the year</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Use this view to spot busy periods where several assessments land close together.
            </p>
          </div>

          <Button variant="secondary" asChild>
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </section>

      {monthKeys.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-sm text-slate-600">
            You are not currently assigned to any assessment marking teams or moderation slots.
          </CardContent>
        </Card>
      ) : (
        monthKeys.map((monthKey) => (
          <section key={monthKey} className="space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{monthKey}</h2>
            <div className="space-y-3">
              {groupedItems[monthKey]?.map((item) => (
                <Link
                  key={item.id}
                  href={`/modules/${item.moduleId}/assessments/${item.id}`}
                  className="block rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition hover:border-sky-200"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {item.moduleCode}
                      </p>
                      <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                        {item.assessmentName} <span className="text-slate-400">/</span> {item.academicYear}
                      </h3>
                      <p className="mt-2 text-sm text-slate-600">{item.moduleTitle}</p>
                    </div>

                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {item.roleLabel}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Due date</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{item.dueAt}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Marking deadline</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{item.markingDeadlineAt}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Your allocation</p>
                      {item.myAllocatedScripts > 0 ? (
                        <p className="mt-2 text-sm font-medium text-slate-900">
                          {item.myMarkedScripts}/{item.myAllocatedScripts} marked
                        </p>
                      ) : (
                        <p className="mt-2 text-sm font-medium text-slate-500">No scripts allocated yet</p>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
