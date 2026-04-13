import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { AssessmentDistributionClient, type DistributionMarkerSlot, type DistributionSeries } from "./assessment-distribution-client";
import { PageBreadcrumbs } from "@/components/breadcrumb-context";
import { authOptions } from "@/lib/auth";
import { computeBoxPlotStats } from "@/lib/grade-distribution";
import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@/lib/user-display";

type DistributionPageProps = {
  params: Promise<{ moduleId: string; assessmentId: string }>;
};

type DistributionScriptRecord = {
  assessmentInstanceId: string;
  grade: number | null;
  allocation: {
    markerUserId: string;
    marker: {
      id: string;
      name: string | null;
      email: string | null;
    };
  } | null;
};

const OVERALL_MARKER_ID = "__overall__";
const OVERALL_MARKER_NAME = "Overall";

function getOrCreateGrades<K>(map: Map<K, number[]>, key: K): number[] {
  const grades = map.get(key);

  if (grades) {
    return grades;
  }

  const createdGrades: number[] = [];
  map.set(key, createdGrades);
  return createdGrades;
}

function buildDistributionBuckets(
  scripts: DistributionScriptRecord[],
  currentAssessmentId: string,
  currentMarkerAssignments: {
    userId: string;
    user: {
      id: string;
      name: string | null;
      email: string | null;
    };
  }[]
) {
  const markerSlots = new Map<string, { markerId: string; markerName: string }>();
  const gradesByInstance = new Map<string, number[]>();
  const gradesByInstanceAndMarker = new Map<string, Map<string, number[]>>();

  for (const assignment of currentMarkerAssignments) {
    markerSlots.set(assignment.user.id, {
      markerId: assignment.user.id,
      markerName: getDisplayName(assignment.user),
    });
  }

  for (const script of scripts) {
    if (script.grade === null || !script.allocation) {
      continue;
    }

    getOrCreateGrades(gradesByInstance, script.assessmentInstanceId).push(script.grade);

    let markerGradesByInstance = gradesByInstanceAndMarker.get(script.assessmentInstanceId);

    if (!markerGradesByInstance) {
      markerGradesByInstance = new Map<string, number[]>();
      gradesByInstanceAndMarker.set(script.assessmentInstanceId, markerGradesByInstance);
    }

    getOrCreateGrades(markerGradesByInstance, script.allocation.markerUserId).push(script.grade);

    if (script.assessmentInstanceId === currentAssessmentId) {
      const marker = script.allocation.marker;

      markerSlots.set(marker.id, {
        markerId: marker.id,
        markerName: getDisplayName(marker),
      });
    }
  }

  return {
    markerSlots,
    gradesByInstance,
    gradesByInstanceAndMarker,
  };
}

function buildDistributionSeries(input: {
  assessmentId: string;
  academicYear: string;
  markerId: string;
  markerName: string;
  grades: number[];
  isCurrentYear: boolean;
}): DistributionSeries | null {
  const stats = computeBoxPlotStats(input.grades);

  if (!stats) {
    return null;
  }

  return {
    key: `${input.assessmentId}:${input.markerId}`,
    assessmentId: input.assessmentId,
    academicYear: input.academicYear,
    markerId: input.markerId,
    markerName: input.markerName,
    isCurrentYear: input.isCurrentYear,
    ...stats,
  };
}

export default async function AssessmentDistributionPage({ params }: DistributionPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  const { moduleId, assessmentId } = await params;

  const assessment = await prisma.assessmentInstance.findUnique({
    where: { id: assessmentId },
    include: {
      markerAssignments: {
        where: {
          active: true,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      assessmentTemplate: {
        include: {
          module: true,
        },
      },
      moderatorUser: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!assessment || assessment.assessmentTemplate.module.id !== moduleId) {
    notFound();
  }

  const moduleMemberships = await prisma.moduleMembership.findMany({
    where: {
      moduleId,
      active: true,
      isLeader: true,
    },
    select: {
      userId: true,
    },
  });

  const isAdmin = session.user.role === Role.ADMIN;
  const currentUserIsLeader = moduleMemberships.some((membership) => membership.userId === session.user.id);
  const currentUserIsAssessmentMarker = assessment.markerAssignments.some(
    (assignment) => assignment.userId === session.user.id
  );
  const currentUserIsModerator = assessment.moderatorUser?.id === session.user.id;
  const isArchived = assessment.assessmentTemplate.isArchived;

  if (!isAdmin && !currentUserIsLeader && !currentUserIsAssessmentMarker && !currentUserIsModerator) {
    notFound();
  }

  if (isArchived && !isAdmin && !currentUserIsLeader) {
    notFound();
  }

  const relatedInstances = await prisma.assessmentInstance.findMany({
    where: {
      assessmentTemplateId: assessment.assessmentTemplateId,
    },
    orderBy: [{ dueAt: "desc" }, { academicYear: "desc" }],
    select: {
      id: true,
      academicYear: true,
      dueAt: true,
    },
  });

  const relatedInstanceIds = relatedInstances.map((instance) => instance.id);
  const scripts = await prisma.script.findMany({
    where: {
      assessmentInstanceId: {
        in: relatedInstanceIds,
      },
      grade: {
        not: null,
      },
      allocation: {
        isNot: null,
      },
    },
    select: {
      assessmentInstanceId: true,
      grade: true,
      allocation: {
        select: {
          markerUserId: true,
          marker: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  const { markerSlots, gradesByInstance, gradesByInstanceAndMarker } = buildDistributionBuckets(
    scripts,
    assessment.id,
    assessment.markerAssignments
  );

  const sortedMarkerSlots = Array.from(markerSlots.values()).sort((left, right) =>
    left.markerName.localeCompare(right.markerName)
  );
  const currentInstanceDistributions = new Map<string, DistributionSeries>();
  const currentAssessmentGrades = gradesByInstance.get(assessment.id) ?? [];

  for (const marker of sortedMarkerSlots) {
    const series = buildDistributionSeries({
      assessmentId: assessment.id,
      academicYear: assessment.academicYear,
      markerId: marker.markerId,
      markerName: marker.markerName,
      grades: gradesByInstanceAndMarker.get(assessment.id)?.get(marker.markerId) ?? [],
      isCurrentYear: true,
    });

    if (series) {
      currentInstanceDistributions.set(marker.markerId, series);
    }
  }

  const previousInstances = relatedInstances
    .filter((instance) => instance.id !== assessment.id && instance.dueAt < assessment.dueAt)
    .sort((left, right) => right.dueAt.getTime() - left.dueAt.getTime());

  const previousDistributionYears = new Map<string, number>();
  const distributionSlots: DistributionMarkerSlot[] = sortedMarkerSlots.map((marker) => {
    const previousDistributions = previousInstances
      .map((instance) => {
        return buildDistributionSeries({
          assessmentId: instance.id,
          academicYear: instance.academicYear,
          markerId: marker.markerId,
          markerName: marker.markerName,
          grades: gradesByInstanceAndMarker.get(instance.id)?.get(marker.markerId) ?? [],
          isCurrentYear: false,
        });
      })
      .filter((distribution): distribution is DistributionSeries => distribution !== null);

    for (const distribution of previousDistributions) {
      previousDistributionYears.set(
        distribution.academicYear,
        (previousDistributionYears.get(distribution.academicYear) ?? 0) + 1
      );
    }

    return {
      markerId: marker.markerId,
      markerName: marker.markerName,
      currentDistribution: currentInstanceDistributions.get(marker.markerId) ?? null,
      previousDistributions,
    };
  });

  const overallCurrentDistribution = buildDistributionSeries({
    assessmentId: assessment.id,
    academicYear: assessment.academicYear,
    markerId: OVERALL_MARKER_ID,
    markerName: OVERALL_MARKER_NAME,
    grades: currentAssessmentGrades,
    isCurrentYear: true,
  });
  const overallPreviousDistributions = previousInstances
    .map((instance) =>
      buildDistributionSeries({
        assessmentId: instance.id,
        academicYear: instance.academicYear,
        markerId: OVERALL_MARKER_ID,
        markerName: OVERALL_MARKER_NAME,
        grades: gradesByInstance.get(instance.id) ?? [],
        isCurrentYear: false,
      })
    )
    .filter((distribution): distribution is DistributionSeries => distribution !== null);

  for (const distribution of overallPreviousDistributions) {
    previousDistributionYears.set(
      distribution.academicYear,
      (previousDistributionYears.get(distribution.academicYear) ?? 0) + 1
    );
  }

  if (overallCurrentDistribution || overallPreviousDistributions.length > 0) {
    distributionSlots.push({
      markerId: OVERALL_MARKER_ID,
      markerName: OVERALL_MARKER_NAME,
      currentDistribution: overallCurrentDistribution,
      previousDistributions: overallPreviousDistributions,
    });
  }

  const previousYears = previousInstances
    .map((instance) => ({
      academicYear: instance.academicYear,
      distributionCount: previousDistributionYears.get(instance.academicYear) ?? 0,
    }))
      .filter(
        (year, index, years) =>
          year.distributionCount > 0 &&
          years.findIndex((candidate) => candidate.academicYear === year.academicYear) === index
    );

  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: assessment.assessmentTemplate.module.code, href: `/modules/${moduleId}` },
          { label: assessment.assessmentTemplate.name, href: `/modules/${moduleId}/assessments/${assessmentId}` },
          {
            label: "Distribution",
            href: `/modules/${moduleId}/assessments/${assessmentId}/distribution`,
            current: true,
          },
        ]}
      />
      <AssessmentDistributionClient
        moduleCode={assessment.assessmentTemplate.module.code}
        assessmentName={assessment.assessmentTemplate.name}
        academicYear={assessment.academicYear}
        isArchived={isArchived}
        slots={distributionSlots}
        previousYears={previousYears}
      />
    </>
  );
}
