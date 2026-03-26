import {
  ModerationStatus,
  PrismaClient,
  ReviewFlagStatus,
  Role,
  ScriptStatus,
  SubmissionType,
} from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "DemoPass123!";

const demoUsers = [
  { email: "demo.admin@markingdesk.test", name: "Demo Admin", role: Role.ADMIN },
  { email: "demo.leader@markingdesk.test", name: "Demo Module Leader", role: Role.USER },
  { email: "demo.marker@markingdesk.test", name: "Demo Marker", role: Role.USER },
  { email: "demo.second-marker@markingdesk.test", name: "Demo Second Marker", role: Role.USER },
  { email: "demo.moderator@markingdesk.test", name: "Demo Moderator", role: Role.USER },
] as const;

const PREVIOUS_YEAR_DEMO_SCRIPTS = [
  {
    turnitinId: "223456781",
    externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=223456781",
    submissionType: SubmissionType.FIRST_SUBMISSION,
    markerEmail: "demo.leader@markingdesk.test",
    grade: 72,
    markerNotes: "Confident argument and well-structured analysis.",
  },
  {
    turnitinId: "223456782",
    externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=223456782",
    submissionType: SubmissionType.FIRST_SUBMISSION,
    markerEmail: "demo.leader@markingdesk.test",
    grade: 69,
    markerNotes: "Strong overall, though the discussion section could be tighter.",
  },
  {
    turnitinId: "223456783",
    externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=223456783",
    submissionType: SubmissionType.SEVEN_DAY_WINDOW,
    markerEmail: "demo.leader@markingdesk.test",
    grade: 74,
    markerNotes: "Excellent engagement with the literature.",
  },
  {
    turnitinId: "223456784",
    externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=223456784",
    submissionType: SubmissionType.FIRST_SUBMISSION,
    markerEmail: "demo.marker@markingdesk.test",
    grade: 58,
    markerNotes: "Competent script with some weaker critical evaluation.",
  },
  {
    turnitinId: "223456785",
    externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=223456785",
    submissionType: SubmissionType.FIRST_SUBMISSION,
    markerEmail: "demo.marker@markingdesk.test",
    grade: 55,
    markerNotes: "Satisfactory but lacked depth in the methodology discussion.",
  },
  {
    turnitinId: "223456786",
    externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=223456786",
    submissionType: SubmissionType.SEVEN_DAY_WINDOW,
    markerEmail: "demo.marker@markingdesk.test",
    grade: 61,
    markerNotes: "Good recovery in the resubmission with clearer analysis.",
  },
  {
    turnitinId: "223456787",
    externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=223456787",
    submissionType: SubmissionType.FIRST_SUBMISSION,
    markerEmail: "demo.second-marker@markingdesk.test",
    grade: 77,
    markerNotes: "Careful and persuasive use of evidence throughout.",
  },
  {
    turnitinId: "223456788",
    externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=223456788",
    submissionType: SubmissionType.FIRST_SUBMISSION,
    markerEmail: "demo.second-marker@markingdesk.test",
    grade: 80,
    markerNotes: "Very strong critical insight and polished structure.",
  },
  {
    turnitinId: "223456789",
    externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=223456789",
    submissionType: SubmissionType.SEVEN_DAY_WINDOW,
    markerEmail: "demo.second-marker@markingdesk.test",
    grade: 83,
    markerNotes: "Excellent performance with a particularly strong conclusion.",
  },
] as const;

async function main() {
  const passwordHash = await hash(DEMO_PASSWORD, 10);
  const now = new Date();

  const users = await Promise.all(
    demoUsers.map((user) =>
      prisma.user.upsert({
        where: { email: user.email },
        update: {
          name: user.name,
          role: user.role,
          passwordHash,
          emailVerified: now,
        },
        create: {
          email: user.email,
          name: user.name,
          role: user.role,
          passwordHash,
          emailVerified: now,
        },
      })
    )
  );

  const byEmail = new Map(users.map((user) => [user.email, user]));

  const moduleRecord = await prisma.module.upsert({
    where: { code: "DEMO101" },
    update: { title: "Demonstration Module" },
    create: { code: "DEMO101", title: "Demonstration Module" },
  });

  const membershipPlan = [
    { email: "demo.leader@markingdesk.test", isLeader: true },
    { email: "demo.marker@markingdesk.test", isLeader: false },
    { email: "demo.second-marker@markingdesk.test", isLeader: false },
    { email: "demo.moderator@markingdesk.test", isLeader: false },
  ] as const;

  await Promise.all(
    membershipPlan.map(async (membership) => {
      const user = byEmail.get(membership.email);
      if (!user) return;

      await prisma.moduleMembership.upsert({
        where: {
          userId_moduleId: {
            userId: user.id,
            moduleId: moduleRecord.id,
          },
        },
        update: {
          active: true,
          isLeader: membership.isLeader,
        },
        create: {
          userId: user.id,
          moduleId: moduleRecord.id,
          active: true,
          isLeader: membership.isLeader,
        },
      });
    })
  );

  const template = await prisma.assessmentTemplate.upsert({
    where: {
      moduleId_name: {
        moduleId: moduleRecord.id,
        name: "Demo Coursework",
      },
    },
    update: {},
    create: {
      moduleId: moduleRecord.id,
      name: "Demo Coursework",
    },
  });

  const moderatorUser = byEmail.get("demo.moderator@markingdesk.test");
  const assessment = await prisma.assessmentInstance.upsert({
    where: {
      assessmentTemplateId_academicYear: {
        assessmentTemplateId: template.id,
        academicYear: "2025/26",
      },
    },
    update: {
      moderatorUserId: moderatorUser?.id ?? null,
      moderationStatus: ModerationStatus.MINOR_ADJUSTMENTS_REQUIRED,
      moderationReport: "A small number of scripts require grade adjustments around the 2:1 boundary.",
      moderationCompletedAt: now,
    },
    create: {
      assessmentTemplateId: template.id,
      academicYear: "2025/26",
      dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
      markingDeadlineAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 17),
      moderatorUserId: moderatorUser?.id ?? null,
      moderationStatus: ModerationStatus.MINOR_ADJUSTMENTS_REQUIRED,
      moderationReport: "A small number of scripts require grade adjustments around the 2:1 boundary.",
      moderationCompletedAt: now,
    },
  });

  const demoScripts = [
    {
      turnitinId: "123456781",
      externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=123456781",
      submissionType: SubmissionType.FIRST_SUBMISSION,
    },
    {
      turnitinId: "123456782",
      externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=123456782",
      submissionType: SubmissionType.SEVEN_DAY_WINDOW,
    },
    {
      turnitinId: "123456783",
      externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=123456783",
      submissionType: SubmissionType.FIRST_SUBMISSION,
    },
    {
      turnitinId: "123456784",
      externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=123456784",
      submissionType: SubmissionType.FIRST_SUBMISSION,
    },
    {
      turnitinId: "123456785",
      externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=123456785",
      submissionType: SubmissionType.SEVEN_DAY_WINDOW,
    },
    {
      turnitinId: "123456786",
      externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=123456786",
      submissionType: SubmissionType.FIRST_SUBMISSION,
    },
  ] as const;

  const scripts = [];

  for (const row of demoScripts) {
    const script = await prisma.script.upsert({
      where: {
        assessmentInstanceId_turnitinId: {
          assessmentInstanceId: assessment.id,
          turnitinId: row.turnitinId,
        },
      },
      update: {
        turnitinId: row.turnitinId,
        submissionType: row.submissionType,
        externalUrl: row.externalUrl,
      },
      create: {
        assessmentInstanceId: assessment.id,
        turnitinId: row.turnitinId,
        submissionType: row.submissionType,
        externalUrl: row.externalUrl,
      },
    });

    scripts.push(script);
  }

  const leader = byEmail.get("demo.leader@markingdesk.test");
  const marker = byEmail.get("demo.marker@markingdesk.test");
  const secondMarker = byEmail.get("demo.second-marker@markingdesk.test");
  const allocationTargets = [leader?.id, marker?.id, secondMarker?.id].filter(Boolean) as string[];

  for (let index = 0; index < scripts.length; index += 1) {
    const script = scripts[index];
    const markerUserId = allocationTargets[index % allocationTargets.length];

    if (!markerUserId) {
      continue;
    }

    await prisma.allocation.upsert({
      where: { scriptId: script.id },
      update: { markerUserId },
      create: { scriptId: script.id, markerUserId },
    });
  }

  await Promise.all(
    allocationTargets.map((userId) =>
      prisma.assessmentMarker.upsert({
        where: {
          assessmentInstanceId_userId: {
            assessmentInstanceId: assessment.id,
            userId,
          },
        },
        update: { active: true },
        create: {
          assessmentInstanceId: assessment.id,
          userId,
          active: true,
        },
      })
    )
  );

  if (scripts[0]) {
    await prisma.script.update({
      where: { id: scripts[0].id },
      data: {
        status: ScriptStatus.COMPLETED,
        grade: 68,
        markerNotes: "Solid script with clear methodology.",
      },
    });
  }

  if (scripts[1]) {
    await prisma.script.update({
      where: { id: scripts[1].id },
      data: {
        status: ScriptStatus.COMPLETED,
        grade: 54,
        markerNotes: "Borderline classification. Checked during moderation.",
      },
    });
  }

  if (scripts[2]) {
    await prisma.reviewFlag.upsert({
      where: { scriptId: scripts[2].id },
      update: {
        createdByUserId: leader?.id ?? marker?.id ?? secondMarker?.id ?? moderatorUser?.id ?? users[0]?.id ?? "",
        status: ReviewFlagStatus.ACADEMIC_CONDUCT_REVIEW,
        reason: "Similarity report requires formal review.",
        notifiedLeaderUserIds: leader?.id ? [leader.id] : [],
      },
      create: {
        scriptId: scripts[2].id,
        createdByUserId: leader?.id ?? marker?.id ?? secondMarker?.id ?? moderatorUser?.id ?? users[0]?.id ?? "",
        status: ReviewFlagStatus.ACADEMIC_CONDUCT_REVIEW,
        reason: "Similarity report requires formal review.",
        notifiedLeaderUserIds: leader?.id ? [leader.id] : [],
      },
    });
  }

  const previousYearAssessment = await prisma.assessmentInstance.upsert({
    where: {
      assessmentTemplateId_academicYear: {
        assessmentTemplateId: template.id,
        academicYear: "2024/25",
      },
    },
    update: {
      dueAt: new Date("2025-04-07T12:00:00.000Z"),
      markingDeadlineAt: new Date("2025-05-05T12:00:00.000Z"),
      moderatorUserId: moderatorUser?.id ?? null,
      moderationStatus: ModerationStatus.NO_ISSUES,
      moderationReport: "Moderation completed with no issues identified across the marking team.",
      moderationCompletedAt: new Date("2025-05-06T09:30:00.000Z"),
    },
    create: {
      assessmentTemplateId: template.id,
      academicYear: "2024/25",
      dueAt: new Date("2025-04-07T12:00:00.000Z"),
      markingDeadlineAt: new Date("2025-05-05T12:00:00.000Z"),
      moderatorUserId: moderatorUser?.id ?? null,
      moderationStatus: ModerationStatus.NO_ISSUES,
      moderationReport: "Moderation completed with no issues identified across the marking team.",
      moderationCompletedAt: new Date("2025-05-06T09:30:00.000Z"),
    },
  });

  await Promise.all(
    allocationTargets.map((userId) =>
      prisma.assessmentMarker.upsert({
        where: {
          assessmentInstanceId_userId: {
            assessmentInstanceId: previousYearAssessment.id,
            userId,
          },
        },
        update: { active: true },
        create: {
          assessmentInstanceId: previousYearAssessment.id,
          userId,
          active: true,
        },
      })
    )
  );

  for (const row of PREVIOUS_YEAR_DEMO_SCRIPTS) {
    const script = await prisma.script.upsert({
      where: {
        assessmentInstanceId_turnitinId: {
          assessmentInstanceId: previousYearAssessment.id,
          turnitinId: row.turnitinId,
        },
      },
      update: {
        submissionType: row.submissionType,
        externalUrl: row.externalUrl,
        status: ScriptStatus.COMPLETED,
        grade: row.grade,
        markerNotes: row.markerNotes,
      },
      create: {
        assessmentInstanceId: previousYearAssessment.id,
        turnitinId: row.turnitinId,
        submissionType: row.submissionType,
        externalUrl: row.externalUrl,
        status: ScriptStatus.COMPLETED,
        grade: row.grade,
        markerNotes: row.markerNotes,
      },
    });

    const markerUserId = byEmail.get(row.markerEmail)?.id;

    if (!markerUserId) {
      continue;
    }

    await prisma.allocation.upsert({
      where: { scriptId: script.id },
      update: { markerUserId },
      create: { scriptId: script.id, markerUserId },
    });
  }

  process.stdout.write("Demo users and assessment data seeded.\n");
  process.stdout.write(`Shared demo password: ${DEMO_PASSWORD}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Demo seed failed"}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
