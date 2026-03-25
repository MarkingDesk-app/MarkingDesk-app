import {
  IntegrityStatus,
  IntegrityVisibility,
  ModuleRole,
  ModerationStatus,
  PrismaClient,
  Role,
  ScriptStatus,
  SubmissionType,
} from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "DemoPass123!";

const demoUsers = [
  { email: "demo.admin@markingdesk.test", name: "Demo Admin", role: Role.ADMIN },
  { email: "demo.leader@markingdesk.test", name: "Demo Module Leader", role: Role.MODULE_LEADER },
  { email: "demo.marker@markingdesk.test", name: "Demo Marker", role: Role.MARKER },
  { email: "demo.moderator@markingdesk.test", name: "Demo Moderator", role: Role.MODERATOR },
  { email: "demo.monitor@markingdesk.test", name: "Demo Monitor", role: Role.MODERATOR },
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
    { email: "demo.leader@markingdesk.test", role: ModuleRole.MODULE_LEADER },
    { email: "demo.marker@markingdesk.test", role: ModuleRole.MARKER },
    { email: "demo.moderator@markingdesk.test", role: ModuleRole.MODERATOR },
    { email: "demo.monitor@markingdesk.test", role: ModuleRole.MODERATOR },
  ] as const;

  await Promise.all(
    membershipPlan.map(async (membership) => {
      const user = byEmail.get(membership.email);
      if (!user) return;
      await prisma.moduleMembership.upsert({
        where: {
          userId_moduleId_role: {
            userId: user.id,
            moduleId: moduleRecord.id,
            role: membership.role,
          },
        },
        update: { active: true },
        create: {
          userId: user.id,
          moduleId: moduleRecord.id,
          role: membership.role,
          active: true,
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
      studentNumber: "DEMO-S001",
      name: "Alex Smith",
      externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=123456781",
      submissionType: SubmissionType.FIRST_SUBMISSION,
    },
    {
      turnitinId: "123456782",
      studentNumber: "DEMO-S002",
      name: "Bea Jones",
      externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=123456782",
      submissionType: SubmissionType.SEVEN_DAY_WINDOW,
    },
    {
      turnitinId: "123456783",
      studentNumber: "DEMO-S003",
      name: "Chris Patel",
      externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=123456783",
      submissionType: SubmissionType.FIRST_SUBMISSION,
    },
    {
      turnitinId: "123456784",
      studentNumber: "DEMO-S004",
      name: "Dana Miller",
      externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=123456784",
      submissionType: SubmissionType.FIRST_SUBMISSION,
    },
    {
      turnitinId: "123456785",
      studentNumber: "DEMO-S005",
      name: "Evan Brown",
      externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=123456785",
      submissionType: SubmissionType.SEVEN_DAY_WINDOW,
    },
    {
      turnitinId: "123456786",
      studentNumber: "DEMO-S006",
      name: "Fern Davis",
      externalUrl: "https://ev.turnitinuk.com/app/carta/en_us/?u=9717219&lang=en_us&ro=103&o=123456786",
      submissionType: SubmissionType.FIRST_SUBMISSION,
    },
  ] as const;

  const scripts = [];
  for (const row of demoScripts) {
    const student = await prisma.student.upsert({
      where: { studentNumber: row.studentNumber },
      update: { name: row.name },
      create: { studentNumber: row.studentNumber, name: row.name },
    });

    const script = await prisma.script.upsert({
      where: {
        assessmentInstanceId_turnitinId: {
          assessmentInstanceId: assessment.id,
          turnitinId: row.turnitinId,
        },
      },
      update: {
        externalUrl: row.externalUrl,
        turnitinId: row.turnitinId,
        submissionType: row.submissionType,
      },
      create: {
        assessmentInstanceId: assessment.id,
        studentId: student.id,
        turnitinId: row.turnitinId,
        submissionType: row.submissionType,
        externalUrl: row.externalUrl,
      },
    });

    scripts.push(script);
  }

  const marker = byEmail.get("demo.marker@markingdesk.test");
  const leader = byEmail.get("demo.leader@markingdesk.test");
  if (marker && leader) {
    for (let i = 0; i < scripts.length; i += 1) {
      const script = scripts[i];
      const markerUserId = i % 2 === 0 ? marker.id : leader.id;
      await prisma.allocation.upsert({
        where: { scriptId: script.id },
        update: { markerUserId },
        create: { scriptId: script.id, markerUserId },
      });
    }
  }

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
    await prisma.integrityFlag.upsert({
      where: { scriptId: scripts[2].id },
      update: {
        status: IntegrityStatus.SUSPECTED_PLAGIARISM,
        visibility: IntegrityVisibility.RESTRICTED,
        notes: "Similarity report requires formal review.",
      },
      create: {
        scriptId: scripts[2].id,
        status: IntegrityStatus.SUSPECTED_PLAGIARISM,
        visibility: IntegrityVisibility.RESTRICTED,
        notes: "Similarity report requires formal review.",
      },
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
