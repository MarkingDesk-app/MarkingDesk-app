import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { PageBreadcrumbs } from "@/components/breadcrumb-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const LONDON_TIME_ZONE = "Europe/London";
const ACADEMIC_YEAR_START_MONTH = 8;

type DashboardTimelinePageProps = {
  searchParams: Promise<{
    year?: string | string[];
  }>;
};

type TimelineRow = {
  id: string;
  assessmentId: string;
  moduleId: string;
  moduleCode: string;
  moduleTitle: string;
  assessmentName: string;
  roleLabel: string;
  rowKind: "marker" | "moderator";
  dueAtLabel: string;
  markingDeadlineAtLabel: string;
  leftPercentage: number;
  widthPercentage: number;
  progressPercentage: number | null;
  allocationLabel: string | null;
  allocatedScriptsCount: number | null;
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: LONDON_TIME_ZONE,
  }).format(date);
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: LONDON_TIME_ZONE,
  }).format(date);
}

function formatAcademicYearLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function parseAcademicYearStart(value: string): number | null {
  const match = value.match(/^(\d{4})\/(\d{2})$/);

  if (!match) {
    return null;
  }

  const startYear = Number(match[1]);
  const endYearSuffix = Number(match[2]);

  if (!Number.isFinite(startYear) || !Number.isFinite(endYearSuffix)) {
    return null;
  }

  const expectedSuffix = (startYear + 1) % 100;

  if (endYearSuffix !== expectedSuffix) {
    return null;
  }

  return startYear;
}

function getLondonParts(date: Date): { year: number; month: number } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIME_ZONE,
    year: "numeric",
    month: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
  };
}

function getCurrentAcademicYearLabel(now: Date): string {
  const { year, month } = getLondonParts(now);
  const startYear = month >= ACADEMIC_YEAR_START_MONTH + 1 ? year : year - 1;

  return formatAcademicYearLabel(startYear);
}

function shiftAcademicYear(value: string, delta: number): string {
  const startYear = parseAcademicYearStart(value);

  return formatAcademicYearLabel((startYear ?? new Date().getFullYear()) + delta);
}

function getAcademicYearWindow(academicYear: string): { start: Date; end: Date } {
  const startYear = parseAcademicYearStart(academicYear);
  const fallbackStartYear = new Date().getFullYear();
  const resolvedStartYear = startYear ?? fallbackStartYear;

  return {
    start: new Date(Date.UTC(resolvedStartYear, ACADEMIC_YEAR_START_MONTH, 1)),
    end: new Date(Date.UTC(resolvedStartYear + 1, ACADEMIC_YEAR_START_MONTH, 1)),
  };
}

function getTimelinePosition(
  dueAt: Date,
  markingDeadlineAt: Date,
  windowStart: Date,
  windowEnd: Date
): { leftPercentage: number; widthPercentage: number } {
  const totalDuration = windowEnd.getTime() - windowStart.getTime();
  const clampedStart = Math.max(dueAt.getTime(), windowStart.getTime());
  const clampedEnd = Math.min(markingDeadlineAt.getTime(), windowEnd.getTime());
  const leftPercentage = ((clampedStart - windowStart.getTime()) / totalDuration) * 100;
  const rawWidthPercentage = ((Math.max(clampedEnd, clampedStart) - clampedStart) / totalDuration) * 100;

  return {
    leftPercentage: Math.max(0, Math.min(leftPercentage, 100)),
    widthPercentage: Math.max(rawWidthPercentage, 1.4),
  };
}

function buildMonthColumns(academicYear: string) {
  const startYear = parseAcademicYearStart(academicYear) ?? getLondonParts(new Date()).year;

  return Array.from({ length: 12 }, (_, index) => {
    const monthStart = new Date(Date.UTC(startYear, ACADEMIC_YEAR_START_MONTH + index, 1));

    return {
      key: `${academicYear}:${index}`,
      label: formatMonthLabel(monthStart),
    };
  });
}

export default async function DashboardTimelinePage({ searchParams }: DashboardTimelinePageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  const resolvedSearchParams = await searchParams;
  const yearParam = Array.isArray(resolvedSearchParams.year)
    ? resolvedSearchParams.year[0]
    : resolvedSearchParams.year;

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

  const currentAcademicYear = getCurrentAcademicYearLabel(new Date());
  const selectedAcademicYear = yearParam && parseAcademicYearStart(yearParam) ? yearParam : currentAcademicYear;
  const availableAcademicYears = Array.from(new Set(assessments.map((assessment) => assessment.academicYear))).sort(
    (left, right) => (parseAcademicYearStart(right) ?? 0) - (parseAcademicYearStart(left) ?? 0)
  );
  const { start: timelineStart, end: timelineEnd } = getAcademicYearWindow(selectedAcademicYear);
  const monthColumns = buildMonthColumns(selectedAcademicYear);

  const rows = assessments
    .filter((assessment) => assessment.academicYear === selectedAcademicYear)
    .flatMap((assessment) => {
      const position = getTimelinePosition(assessment.dueAt, assessment.markingDeadlineAt, timelineStart, timelineEnd);
      const myAllocatedScripts = assessment.scripts.filter(
        (script) => script.allocation?.markerUserId === session.user.id
      ).length;
      const myMarkedScripts = assessment.scripts.filter(
        (script) => script.allocation?.markerUserId === session.user.id && script.grade !== null
      ).length;
      const rowsForAssessment: TimelineRow[] = [];

      if (assessment.markerAssignments.length > 0) {
        rowsForAssessment.push({
          id: `${assessment.id}:marker`,
          assessmentId: assessment.id,
          moduleId: assessment.assessmentTemplate.module.id,
          moduleCode: assessment.assessmentTemplate.module.code,
          moduleTitle: assessment.assessmentTemplate.module.title,
          assessmentName: assessment.assessmentTemplate.name,
          roleLabel: "Marker",
          rowKind: "marker",
          dueAtLabel: formatDateTime(assessment.dueAt),
          markingDeadlineAtLabel: formatDateTime(assessment.markingDeadlineAt),
          leftPercentage: position.leftPercentage,
          widthPercentage: position.widthPercentage,
          progressPercentage:
            myAllocatedScripts > 0 ? Math.round((myMarkedScripts / myAllocatedScripts) * 100) : 0,
          allocationLabel:
            myAllocatedScripts > 0
              ? `${myMarkedScripts}/${myAllocatedScripts} marked`
              : "No scripts allocated yet",
          allocatedScriptsCount: myAllocatedScripts,
        });
      }

      if (assessment.moderatorUserId === session.user.id) {
        rowsForAssessment.push({
          id: `${assessment.id}:moderator`,
          assessmentId: assessment.id,
          moduleId: assessment.assessmentTemplate.module.id,
          moduleCode: assessment.assessmentTemplate.module.code,
          moduleTitle: assessment.assessmentTemplate.module.title,
          assessmentName: assessment.assessmentTemplate.name,
          roleLabel: "Moderator",
          rowKind: "moderator",
          dueAtLabel: formatDateTime(assessment.dueAt),
          markingDeadlineAtLabel: formatDateTime(assessment.markingDeadlineAt),
          leftPercentage: position.leftPercentage,
          widthPercentage: position.widthPercentage,
          progressPercentage: null,
          allocationLabel: null,
          allocatedScriptsCount: null,
        });
      }

      return rowsForAssessment;
    });

  const markerRowCount = rows.filter((row) => row.rowKind === "marker").length;
  const moderationRowCount = rows.filter((row) => row.rowKind === "moderator").length;
  const totalAllocatedScripts = rows
    .filter((row) => row.rowKind === "marker")
    .reduce((sum, row) => sum + (row.allocatedScriptsCount ?? 0), 0);
  const hasAssignmentsInOtherYears = availableAcademicYears.length > 0;

  return (
    <div className="space-y-6">
      <PageBreadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Timeline", href: "/dashboard/timeline", current: true },
        ]}
      />

      <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Timeline</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Marking workload across the year</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              The chart runs from September to August. Each marker bar shows the period from the due date to the
              marking deadline, so overlapping bars highlight where workload collisions build up.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" asChild>
              <Link href={`/dashboard/timeline?year=${encodeURIComponent(shiftAcademicYear(selectedAcademicYear, -1))}`}>
                <ArrowLeft className="h-4 w-4" />
                Previous year
              </Link>
            </Button>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700">
              {selectedAcademicYear}
            </span>
            <Button variant="secondary" asChild>
              <Link href={`/dashboard/timeline?year=${encodeURIComponent(shiftAcademicYear(selectedAcademicYear, 1))}`}>
                Next year
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
              <span className="h-3 w-8 rounded-full bg-sky-500" />
              Marker window
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
              <span className="h-2 w-8 rounded-full border-2 border-dashed border-amber-500 bg-amber-50" />
              Moderator assignment
            </span>
          </div>

          <p className="text-sm text-slate-500">
            {markerRowCount} marking {markerRowCount === 1 ? "window" : "windows"}, {moderationRowCount} moderation{" "}
            {moderationRowCount === 1 ? "slot" : "slots"}, {totalAllocatedScripts} allocated{" "}
            {totalAllocatedScripts === 1 ? "script" : "scripts"}.
          </p>
        </div>
      </section>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 p-8 text-sm text-slate-600">
            <p>No marking or moderation assignments are scheduled for {selectedAcademicYear}.</p>
            {hasAssignmentsInOtherYears ? <p>Use the year toggle to move to another academic year.</p> : null}
          </CardContent>
        </Card>
      ) : (
        <section className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[1120px] space-y-3">
              <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-4 px-2">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Assignments</div>
                <div className="grid grid-cols-12 gap-0">
                  {monthColumns.map((month) => (
                    <div
                      key={month.key}
                      className="border-l border-slate-200/70 px-2 pb-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 first:border-l-0"
                    >
                      {month.label}
                    </div>
                  ))}
                </div>
              </div>

              {rows.map((row) => (
                <Link
                  key={row.id}
                  href={`/modules/${row.moduleId}/assessments/${row.assessmentId}`}
                  className="grid grid-cols-[320px_minmax(0,1fr)] gap-4 rounded-[26px] border border-slate-200/70 bg-slate-50/70 p-4 transition hover:border-sky-200 hover:bg-white"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{row.moduleCode}</p>
                        <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{row.assessmentName}</h2>
                        <p className="mt-1 text-sm text-slate-600">{row.moduleTitle}</p>
                      </div>

                      <span
                        className={
                          row.rowKind === "marker"
                            ? "rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800"
                            : "rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
                        }
                      >
                        {row.roleLabel}
                      </span>
                    </div>

                    <div className="grid gap-2 text-sm text-slate-500">
                      <p>Due {row.dueAtLabel}</p>
                      <p>Marking deadline {row.markingDeadlineAtLabel}</p>
                      {row.allocationLabel ? (
                        <p className="font-medium text-slate-700">{row.allocationLabel}</p>
                      ) : (
                        <p className="font-medium text-slate-700">Moderator</p>
                      )}
                    </div>
                  </div>

                  <div className="relative flex items-center">
                    <div className="relative h-24 w-full overflow-hidden rounded-[24px] border border-slate-200/70 bg-white/80">
                      <div className="absolute inset-0 grid grid-cols-12">
                        {monthColumns.map((month) => (
                          <div
                            key={`${row.id}:${month.key}`}
                            className="border-l border-slate-200/60 first:border-l-0 odd:bg-slate-50/60"
                          />
                        ))}
                      </div>

                      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200/80" />

                      <div
                        className="absolute top-1/2 -translate-y-1/2"
                        style={{
                          left: `${row.leftPercentage}%`,
                          width: `${row.widthPercentage}%`,
                        }}
                      >
                        {row.rowKind === "marker" ? (
                          <div className="relative overflow-hidden rounded-full border border-sky-300 bg-sky-100 shadow-sm shadow-sky-900/5">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-sky-600"
                              style={{ width: `${row.progressPercentage ?? 0}%` }}
                            />
                            <div className="relative flex min-h-12 items-center justify-between gap-3 px-4 py-2.5 text-sm font-medium text-slate-900">
                              <span className="truncate">
                                {row.assessmentName}
                                {row.allocationLabel ? ` • ${row.allocationLabel}` : ""}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-full border-2 border-dashed border-amber-500 bg-amber-50/90 px-4 py-1.5 text-sm font-medium text-amber-900">
                            <span className="truncate">
                              {row.moduleTitle} • {row.assessmentName} • Moderator
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
