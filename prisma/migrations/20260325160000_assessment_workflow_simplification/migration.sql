-- CreateEnum
CREATE TYPE "public"."SubmissionType" AS ENUM ('FIRST_SUBMISSION', 'SEVEN_DAY_WINDOW');

-- CreateEnum
CREATE TYPE "public"."ModerationStatus" AS ENUM ('NO_ISSUES', 'MINOR_ADJUSTMENTS_REQUIRED', 'MAJOR_ISSUES');

-- DropForeignKey
ALTER TABLE "public"."AssessmentInstance" DROP CONSTRAINT IF EXISTS "AssessmentInstance_monitorUserId_fkey";

-- AlterTable
ALTER TABLE "public"."AssessmentInstance"
  RENAME COLUMN "monitorUserId" TO "moderatorUserId";

ALTER TABLE "public"."AssessmentInstance"
  ADD COLUMN "moderationStatus" "public"."ModerationStatus",
  ADD COLUMN "moderationReport" TEXT,
  ADD COLUMN "moderationCompletedAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "public"."AssessmentInstance"
  ADD CONSTRAINT "AssessmentInstance_moderatorUserId_fkey"
  FOREIGN KEY ("moderatorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropForeignKey
ALTER TABLE "public"."Script" DROP CONSTRAINT IF EXISTS "Script_studentId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "public"."Script_assessmentInstanceId_studentId_key";

-- AlterTable
ALTER TABLE "public"."Script"
  ADD COLUMN "turnitinId" TEXT,
  ADD COLUMN "submissionType" "public"."SubmissionType" NOT NULL DEFAULT 'FIRST_SUBMISSION',
  ALTER COLUMN "studentId" DROP NOT NULL;

UPDATE "public"."Script" AS "script"
SET "turnitinId" = COALESCE("student"."studentNumber", "script"."id")
FROM "public"."Student" AS "student"
WHERE "script"."studentId" = "student"."id";

UPDATE "public"."Script"
SET "turnitinId" = "id"
WHERE "turnitinId" IS NULL;

ALTER TABLE "public"."Script"
  ALTER COLUMN "turnitinId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Script_turnitinId_idx" ON "public"."Script"("turnitinId");

-- CreateIndex
CREATE UNIQUE INDEX "Script_assessmentInstanceId_turnitinId_key" ON "public"."Script"("assessmentInstanceId", "turnitinId");

-- AddForeignKey
ALTER TABLE "public"."Script"
  ADD CONSTRAINT "Script_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
