import { ReviewFlagStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { formatReviewFlagStatus } from "@/lib/assessment-utils";
import { sendEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

const HOURS_36 = 1000 * 60 * 60 * 36;

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

function getTargetWindow(now: Date, daysAhead: number) {
  const targetDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  return {
    key: getLondonDateKey(targetDate),
    start: new Date(targetDate.getTime() - HOURS_36),
    end: new Date(targetDate.getTime() + HOURS_36),
  };
}

function formatEmailDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(date);
}

function getAppBaseUrl(): string {
  const raw = (process.env.NEXTAUTH_URL || process.env.VERCEL_URL || "https://markingdesk.app").trim();

  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/$/, "");
  }

  return `https://${raw.replace(/\/$/, "")}`;
}

function formatLeaderLabel(leaders: Array<{ name: string | null }>): string {
  const leaderNames = leaders
    .map((leader) => leader.name?.trim())
    .filter((name): name is string => Boolean(name))
    .sort((left, right) => left.localeCompare(right));

  if (leaderNames.length === 0) {
    return "Not assigned";
  }

  return leaderNames.join(", ");
}

async function sendReviewFlagReminders(now: Date) {
  const todayKey = getLondonDateKey(now);
  const reviewFlagWindow = getTargetWindow(now, 0);

  const unresolvedFlags = await prisma.reviewFlag.findMany({
    where: {
      status: {
        in: [ReviewFlagStatus.FLAGGED, ReviewFlagStatus.ACADEMIC_CONDUCT_REVIEW],
      },
      script: {
        assessmentInstance: {
          markingDeadlineAt: {
            gte: reviewFlagWindow.start,
            lte: reviewFlagWindow.end,
          },
          assessmentTemplate: {
            isArchived: false,
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
  let emailsSent = 0;
  let assessmentsNotified = 0;

  for (const assessment of assessments) {
    if (assessment.leaders.length === 0) {
      continue;
    }

    assessmentsNotified += 1;

    const subject = `Review flags outstanding: ${assessment.moduleCode} ${assessment.assessmentName} (${assessment.academicYear})`;
    const message = [
      `Module: ${assessment.moduleCode} - ${assessment.moduleTitle}`,
      `Assessment: ${assessment.assessmentName}`,
      `Academic year: ${assessment.academicYear}`,
      `Marking deadline: ${formatEmailDateTime(assessment.deadline)}`,
      "",
      "Outstanding scripts:",
      ...assessment.scripts.flatMap((script) => [
        `- ${script.turnitinId}: ${formatReviewFlagStatus(script.status)}`,
        `  Reason: ${script.reason}`,
      ]),
    ].join("\n");

    await Promise.all(
      assessment.leaders.map(async (leader) => {
        await sendEmail(leader.email, subject, message);
        emailsSent += 1;
      })
    );
  }

  return {
    assessmentsNotified,
    flagsChecked: dueTodayFlags.length,
    emailsSent,
  };
}

async function sendMarkerDueSoonReminders(now: Date) {
  const markerReminderWindow = getTargetWindow(now, 7);

  const assessments = await prisma.assessmentInstance.findMany({
    where: {
      dueAt: {
        gte: markerReminderWindow.start,
        lte: markerReminderWindow.end,
      },
      assessmentTemplate: {
        isArchived: false,
      },
    },
    select: {
      id: true,
      academicYear: true,
      dueAt: true,
      markingDeadlineAt: true,
      assessmentTemplate: {
        select: {
          name: true,
          module: {
            select: {
              id: true,
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
                      name: true,
                    },
                  },
                },
              },
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
              marker: {
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
  });

  const dueSoonAssessments = assessments.filter(
    (assessment) => getLondonDateKey(assessment.dueAt) === markerReminderWindow.key
  );
  const appBaseUrl = getAppBaseUrl();
  let emailsSent = 0;
  let assessmentsWithReminders = 0;

  for (const assessment of dueSoonAssessments) {
    const outstandingByMarker = new Map<
      string,
      {
        email: string;
        name: string | null;
        totalAllocated: number;
        remainingUngraded: number;
      }
    >();

    for (const script of assessment.scripts) {
      const allocation = script.allocation;
      const markerEmail = allocation?.marker.email?.trim();

      if (!allocation || !markerEmail) {
        continue;
      }

      const existing = outstandingByMarker.get(allocation.markerUserId) ?? {
        email: markerEmail,
        name: allocation.marker.name,
        totalAllocated: 0,
        remainingUngraded: 0,
      };

      existing.totalAllocated += 1;

      if (script.grade === null) {
        existing.remainingUngraded += 1;
      }

      outstandingByMarker.set(allocation.markerUserId, existing);
    }

    const recipients = Array.from(outstandingByMarker.values()).filter((marker) => marker.remainingUngraded > 0);

    if (recipients.length === 0) {
      continue;
    }

    assessmentsWithReminders += 1;

    const subject = `Reminder: marking due in 7 days for ${assessment.assessmentTemplate.module.code} ${assessment.assessmentTemplate.name} (${assessment.academicYear})`;
    const leaderLabel = formatLeaderLabel(
      assessment.assessmentTemplate.module.memberships.map((membership) => ({
        name: membership.user.name,
      }))
    );
    const assessmentPageUrl = `${appBaseUrl}/modules/${assessment.assessmentTemplate.module.id}/assessments/${assessment.id}`;

    await Promise.all(
      recipients.map(async (marker) => {
        const message = [
          `Module: ${assessment.assessmentTemplate.module.code} - ${assessment.assessmentTemplate.module.title}`,
          `Assessment: ${assessment.assessmentTemplate.name}`,
          `Academic year: ${assessment.academicYear}`,
          `Due date: ${formatEmailDateTime(assessment.dueAt)}`,
          `Marking deadline: ${formatEmailDateTime(assessment.markingDeadlineAt)}`,
          `Outstanding scripts: ${marker.remainingUngraded} of ${marker.totalAllocated} allocated to you`,
          "",
          `Module leader(s): ${leaderLabel}`,
          `Assessment page: ${assessmentPageUrl}`,
          "",
          "You still have scripts remaining on this assessment. Please complete your marking before the deadline.",
        ].join("\n");

        await sendEmail(marker.email, subject, message);
        emailsSent += 1;
      })
    );
  }

  return {
    assessmentsChecked: dueSoonAssessments.length,
    assessmentsNotified: assessmentsWithReminders,
    emailsSent,
  };
}

async function sendLeaderUnmarkedScriptReminders(now: Date) {
  const leaderReminderWindow = getTargetWindow(now, 2);

  const assessments = await prisma.assessmentInstance.findMany({
    where: {
      markingDeadlineAt: {
        gte: leaderReminderWindow.start,
        lte: leaderReminderWindow.end,
      },
      assessmentTemplate: {
        isArchived: false,
      },
    },
    select: {
      id: true,
      academicYear: true,
      dueAt: true,
      markingDeadlineAt: true,
      assessmentTemplate: {
        select: {
          name: true,
          module: {
            select: {
              id: true,
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
      scripts: {
        select: {
          turnitinId: true,
          grade: true,
          allocation: {
            select: {
              marker: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const deadlineSoonAssessments = assessments.filter(
    (assessment) => getLondonDateKey(assessment.markingDeadlineAt) === leaderReminderWindow.key
  );
  const appBaseUrl = getAppBaseUrl();
  let emailsSent = 0;
  let assessmentsWithReminders = 0;

  for (const assessment of deadlineSoonAssessments) {
    const leaders = assessment.assessmentTemplate.module.memberships.reduce<
      Array<{ email: string; name: string | null }>
    >((result, membership) => {
      const email = membership.user.email?.trim();

      if (email) {
        result.push({
          email,
          name: membership.user.name,
        });
      }

      return result;
    }, []);
    const outstandingScripts = assessment.scripts.filter((script) => script.grade === null);

    if (leaders.length === 0 || outstandingScripts.length === 0) {
      continue;
    }

    assessmentsWithReminders += 1;

    const outstandingByMarker = outstandingScripts.reduce<Record<string, number>>((summary, script) => {
      const label = script.allocation?.marker.name?.trim() || "Unallocated";
      summary[label] = (summary[label] ?? 0) + 1;
      return summary;
    }, {});

    const subject = `Reminder: unmarked scripts remain for ${assessment.assessmentTemplate.module.code} ${assessment.assessmentTemplate.name} (${assessment.academicYear})`;
    const assessmentPageUrl = `${appBaseUrl}/modules/${assessment.assessmentTemplate.module.id}/assessments/${assessment.id}`;
    const message = [
      `Module: ${assessment.assessmentTemplate.module.code} - ${assessment.assessmentTemplate.module.title}`,
      `Assessment: ${assessment.assessmentTemplate.name}`,
      `Academic year: ${assessment.academicYear}`,
      `Due date: ${formatEmailDateTime(assessment.dueAt)}`,
      `Marking deadline: ${formatEmailDateTime(assessment.markingDeadlineAt)}`,
      `Unmarked scripts: ${outstandingScripts.length} of ${assessment.scripts.length}`,
      `Assessment page: ${assessmentPageUrl}`,
      "",
      "Outstanding by marker:",
      ...Object.entries(outstandingByMarker)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([markerName, count]) => `- ${markerName}: ${count}`),
    ].join("\n");

    await Promise.all(
      leaders.map(async (leader) => {
        await sendEmail(leader.email, subject, message);
        emailsSent += 1;
      })
    );
  }

  return {
    assessmentsChecked: deadlineSoonAssessments.length,
    assessmentsNotified: assessmentsWithReminders,
    emailsSent,
  };
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
  const reviewFlags = await sendReviewFlagReminders(now);
  const markersDueSoon = await sendMarkerDueSoonReminders(now);
  const leadersDueSoon = await sendLeaderUnmarkedScriptReminders(now);

  return NextResponse.json({
    ok: true,
    date: getLondonDateKey(now),
    reviewFlagReminders: reviewFlags,
    markerDueSoonReminders: markersDueSoon,
    leaderDeadlineReminders: leadersDueSoon,
  });
}
