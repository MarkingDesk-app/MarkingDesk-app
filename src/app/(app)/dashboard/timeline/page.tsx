import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Prisma } from "@prisma/client";

import { PageBreadcrumbs } from "@/components/breadcrumb-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ACADEMIC_YEAR_START_MONTH,
  formatAcademicYearLabel,
  getCurrentAcademicYearLabel,
  LONDON_TIME_ZONE,
  parseAcademicYearStart,
} from "@/lib/academic-year";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  assessmentName: string;
  dateSpanLabel: string;
  rowKind: "marker" | "moderator";
  leftPercentage: number;
  widthPercentage: number;
};

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    timeZone: LONDON_TIME_ZONE,
  }).format(date);
}

function formatShortDate(date: Date, includeYear: boolean): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "numeric",
    ...(includeYear ? { year: "2-digit" as const } : {}),
    timeZone: LONDON_TIME_ZONE,
  }).format(date);
}

function formatDateSpan(dueAt: Date, markingDeadlineAt: Date): string {
  const includeYear = getLondonParts(dueAt).year !== getLondonParts(markingDeadlineAt).year;
  return `${formatShortDate(dueAt, includeYear)} - ${formatShortDate(markingDeadlineAt, includeYear)}`;
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
  const currentAcademicYear = getCurrentAcademicYearLabel(new Date());
  const selectedAcademicYear = yearParam && parseAcademicYearStart(yearParam) ? yearParam : currentAcademicYear;
  const assessmentAccessWhere: Prisma.AssessmentInstanceWhereInput = {
    assessmentTemplate: {
      isArchived: false,
    },
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
  } as const;

  const [availableAcademicYearRows, assessments] = await Promise.all([
    prisma.assessmentInstance.findMany({
      where: assessmentAccessWhere,
      select: {
        academicYear: true,
      },
      distinct: ["academicYear"],
    }),
    prisma.assessmentInstance.findMany({
      where: {
        ...assessmentAccessWhere,
        academicYear: selectedAcademicYear,
      },
      orderBy: [{ dueAt: "asc" }, { markingDeadlineAt: "asc" }],
      select: {
        id: true,
        dueAt: true,
        markingDeadlineAt: true,
        moderatorUserId: true,
        _count: {
          select: {
            markerAssignments: {
              where: {
                userId: session.user.id,
                active: true,
              },
            },
          },
        },
        assessmentTemplate: {
          select: {
            name: true,
            module: {
              select: {
                id: true,
                code: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const availableAcademicYears = availableAcademicYearRows
    .map((row) => row.academicYear)
    .sort((left, right) => (parseAcademicYearStart(right) ?? 0) - (parseAcademicYearStart(left) ?? 0));
  const { start: timelineStart, end: timelineEnd } = getAcademicYearWindow(selectedAcademicYear);
  const monthColumns = buildMonthColumns(selectedAcademicYear);

  const rows = assessments.flatMap((assessment) => {
    const position = getTimelinePosition(assessment.dueAt, assessment.markingDeadlineAt, timelineStart, timelineEnd);
    const rowsForAssessment: TimelineRow[] = [];
    const dateSpanLabel = formatDateSpan(assessment.dueAt, assessment.markingDeadlineAt);

    if (assessment._count.markerAssignments > 0) {
      rowsForAssessment.push({
        id: `${assessment.id}:marker`,
        assessmentId: assessment.id,
        moduleId: assessment.assessmentTemplate.module.id,
        moduleCode: assessment.assessmentTemplate.module.code,
        assessmentName: assessment.assessmentTemplate.name,
        dateSpanLabel,
        rowKind: "marker",
        leftPercentage: position.leftPercentage,
        widthPercentage: position.widthPercentage,
      });
    }

    if (assessment.moderatorUserId === session.user.id) {
      rowsForAssessment.push({
        id: `${assessment.id}:moderator`,
        assessmentId: assessment.id,
        moduleId: assessment.assessmentTemplate.module.id,
        moduleCode: assessment.assessmentTemplate.module.code,
        assessmentName: assessment.assessmentTemplate.name,
        dateSpanLabel,
        rowKind: "moderator",
        leftPercentage: position.leftPercentage,
        widthPercentage: position.widthPercentage,
      });
    }

    return rowsForAssessment;
  });

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
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
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
            <div className="min-w-[1080px]">
              <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-0 border-b border-slate-200/70 px-1">
                <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  Workload
                </div>
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

              <div className="divide-y divide-slate-200/70">
                {rows.map((row) => (
                  <Link
                    key={row.id}
                    href={`/modules/${row.moduleId}/assessments/${row.assessmentId}`}
                    className="group grid grid-cols-[220px_minmax(0,1fr)] gap-0 transition hover:bg-sky-50/40"
                  >
                    <div className="px-4 py-4 pr-5">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{row.moduleCode}</p>
                      <h2 className="mt-1 truncate text-sm font-semibold tracking-tight text-slate-950">
                        {row.assessmentName}
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        {row.dateSpanLabel}
                        {row.rowKind === "moderator" ? " • Moderator" : ""}
                      </p>
                    </div>

                    <div className="relative px-2 py-4">
                      <div className="pointer-events-none absolute inset-y-0 left-0 right-0 grid grid-cols-12">
                        {monthColumns.map((month) => (
                          <div
                            key={`${row.id}:${month.key}`}
                            className="border-l border-slate-200/60 first:border-l-0 odd:bg-slate-50/50"
                          />
                        ))}
                      </div>

                      <div className="relative h-12">
                        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200/80" />
                        <div
                          className="absolute top-1/2 -translate-y-1/2"
                          style={{
                            left: `${row.leftPercentage}%`,
                            width: `${row.widthPercentage}%`,
                          }}
                        >
                          {row.rowKind === "marker" ? (
                            <div className="h-4 rounded-full bg-sky-500 shadow-sm shadow-sky-900/10 transition group-hover:bg-sky-600" />
                          ) : (
                            <div className="h-3 rounded-full border-2 border-dashed border-amber-500 bg-amber-50/90 transition group-hover:border-amber-600" />
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
