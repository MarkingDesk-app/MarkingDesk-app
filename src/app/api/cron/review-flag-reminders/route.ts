import { ReviewFlagStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { formatReviewFlagStatus } from "@/lib/assessment-utils";
import { sendEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

function getLondonDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export async function GET(request: Request) {
  const cronSecret = (process.env.CRON_SECRET || "").trim();

  if (cronSecret) {
    const authorization = request.headers.get("authorization");

    if (authorization !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const todayKey = getLondonDateKey(now);
  const windowStart = new Date(now.getTime() - 1000 * 60 * 60 * 36);
  const windowEnd = new Date(now.getTime() + 1000 * 60 * 60 * 36);

  const unresolvedFlags = await prisma.reviewFlag.findMany({
    where: {
      status: {
        in: [ReviewFlagStatus.FLAGGED, ReviewFlagStatus.ACADEMIC_CONDUCT_REVIEW],
      },
      script: {
        assessmentInstance: {
          markingDeadlineAt: {
            gte: windowStart,
            lte: windowEnd,
          },
        },
      },
    },
    select: {
      status: true,
      reason: true,
      script: {
        select: {
          turnitinId: true,
          assessmentInstance: {
            select: {
              id: true,
              academicYear: true,
              markingDeadlineAt: true,
              assessmentTemplate: {
                select: {
                  name: true,
                  module: {
                    select: {
                      code: true,
                      title: true,
                      memberships: {
                        where: {
                          active: true,
                          isLeader: true,
                        },
                        select: {
                          user: {
                            select: {
                              email: true,
                              name: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  const dueTodayFlags = unresolvedFlags.filter(
    (flag) => getLondonDateKey(flag.script.assessmentInstance.markingDeadlineAt) === todayKey
  );

  const assessmentGroups = dueTodayFlags.reduce<
    Record<
      string,
      {
        moduleCode: string;
        moduleTitle: string;
        assessmentName: string;
        academicYear: string;
        deadline: Date;
        leaders: { email: string; name: string | null }[];
        scripts: { turnitinId: string; status: ReviewFlagStatus; reason: string }[];
      }
    >
  >((groups, flag) => {
    const assessment = flag.script.assessmentInstance;
    const key = assessment.id;

    groups[key] = groups[key] ?? {
      moduleCode: assessment.assessmentTemplate.module.code,
      moduleTitle: assessment.assessmentTemplate.module.title,
      assessmentName: assessment.assessmentTemplate.name,
      academicYear: assessment.academicYear,
      deadline: assessment.markingDeadlineAt,
      leaders: assessment.assessmentTemplate.module.memberships
        .map((membership) => ({
          email: membership.user.email,
          name: membership.user.name,
        }))
        .filter((leader) => Boolean(leader.email)),
      scripts: [],
    };

    groups[key].scripts.push({
      turnitinId: flag.script.turnitinId,
      status: flag.status,
      reason: flag.reason,
    });

    return groups;
  }, {});

  const assessments = Object.values(assessmentGroups);

  for (const assessment of assessments) {
    const subject = `Review flags outstanding: ${assessment.moduleCode} ${assessment.assessmentName} (${assessment.academicYear})`;
    const message = [
      `Module: ${assessment.moduleCode} - ${assessment.moduleTitle}`,
      `Assessment: ${assessment.assessmentName}`,
      `Academic year: ${assessment.academicYear}`,
      `Marking deadline: ${new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Europe/London",
      }).format(assessment.deadline)}`,
      "",
      "Outstanding scripts:",
      ...assessment.scripts.flatMap((script) => [
        `- ${script.turnitinId}: ${formatReviewFlagStatus(script.status)}`,
        `  Reason: ${script.reason}`,
      ]),
    ].join("\n");

    await Promise.all(
      assessment.leaders.map((leader) => sendEmail(leader.email, subject, message))
    );
  }

  return NextResponse.json({
    ok: true,
    assessmentsNotified: assessments.length,
    flagsChecked: dueTodayFlags.length,
    date: todayKey,
  });
}
