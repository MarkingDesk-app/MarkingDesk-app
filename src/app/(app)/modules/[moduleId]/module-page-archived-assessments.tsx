import Link from "next/link";

import { ChevronRight } from "lucide-react";
import { unstable_cache } from "next/cache";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatModerationStatus } from "@/lib/assessment-utils";
import { getModuleArchivedAssessmentsTag } from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@/lib/user-display";

const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  emailVerified: true,
} as const;

type ArchivedMarkedScriptCount = {
  assessmentInstanceId: string;
  markedCount: number;
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

async function getArchivedAssessmentsData(moduleId: string) {
  return unstable_cache(
    async () => {
      const archivedAssessmentTemplates = await prisma.assessmentTemplate.findMany({
        where: {
          moduleId,
          isArchived: true,
        },
        orderBy: { name: "asc" },
        include: {
          archivedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          assessmentInstances: {
            orderBy: { academicYear: "desc" },
            include: {
              markerAssignments: {
                where: {
                  active: true,
                },
                include: {
                  user: {
                    select: userSummarySelect,
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
              _count: {
                select: {
                  scripts: true,
                },
              },
            },
          },
        },
      });

      const allInstanceIds = archivedAssessmentTemplates.flatMap((template) =>
        template.assessmentInstances.map((instance) => instance.id)
      );
      const markedScriptCounts = allInstanceIds.length
        ? await prisma.script.groupBy({
            by: ["assessmentInstanceId"],
            where: {
              assessmentInstanceId: { in: allInstanceIds },
              grade: { not: null },
            },
            _count: {
              _all: true,
            },
          })
        : [];

      return {
        archivedAssessmentTemplates,
        markedScriptCounts: markedScriptCounts.map<ArchivedMarkedScriptCount>((row) => ({
          assessmentInstanceId: row.assessmentInstanceId,
          markedCount: row._count._all,
        })),
      };
    },
    ["module-archived-assessments", moduleId],
    {
      revalidate: 300,
      tags: [getModuleArchivedAssessmentsTag(moduleId)],
    }
  )();
}

export async function ModulePageArchivedAssessments({ moduleId }: { moduleId: string }) {
  const { archivedAssessmentTemplates, markedScriptCounts } = await getArchivedAssessmentsData(moduleId);
  const markedScriptCountByInstanceId = new Map(
    markedScriptCounts.map((row) => [row.assessmentInstanceId, row.markedCount])
  );

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Archived Assessments</h2>
        <p className="mt-1 text-sm text-slate-600">Archived assessments remain available here for audit purposes.</p>
      </div>

      {archivedAssessmentTemplates.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-sm text-slate-600">No archived assessments.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {archivedAssessmentTemplates.map((assessment) => (
            <Card key={assessment.id} className="overflow-hidden border-slate-200 bg-slate-50/70">
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl text-slate-900">{assessment.name}</CardTitle>
                  <p className="mt-1 text-sm text-slate-600">
                    {assessment.assessmentInstances.length} academic year
                    {assessment.assessmentInstances.length === 1 ? "" : "s"}
                  </p>
                </div>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">Archived</span>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1 text-sm text-slate-600">
                  <p>Archived on {assessment.archivedAt ? formatDateTime(assessment.archivedAt) : "Not set"}</p>
                  <p>Archived by {assessment.archivedBy ? getDisplayName(assessment.archivedBy) : "Unknown"}</p>
                  <p>
                    {assessment.assessmentInstances.reduce(
                      (sum, instance) => sum + (markedScriptCountByInstanceId.get(instance.id) ?? 0),
                      0
                    )}
                    /{assessment.assessmentInstances.reduce((sum, instance) => sum + instance._count.scripts, 0)} scripts marked
                  </p>
                </div>

                <div className="space-y-3">
                  {assessment.assessmentInstances.map((instance) => (
                    <Link
                      key={instance.id}
                      href={`/modules/${moduleId}/assessments/${instance.id}`}
                      className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white/85 px-4 py-4 transition hover:border-slate-300 hover:bg-white"
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-slate-950">{instance.academicYear}</p>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                            {markedScriptCountByInstanceId.get(instance.id) ?? 0}/{instance._count.scripts} marked
                          </span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                            {instance.markerAssignments.length} marker
                            {instance.markerAssignments.length === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="space-y-1 text-sm text-slate-600">
                          <p>Due {formatDateTime(instance.dueAt)}</p>
                          <p>Deadline {formatDateTime(instance.markingDeadlineAt)}</p>
                          <p>
                            Moderator: {instance.moderatorUser ? getDisplayName(instance.moderatorUser) : "Not assigned"} ·{" "}
                            {formatModerationStatus(instance.moderationStatus)}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:text-slate-700" />
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
