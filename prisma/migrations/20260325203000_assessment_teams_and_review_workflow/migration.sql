-- Move marking-team membership to the assessment level, replace the legacy
-- integrity/review split with a unified review flag, and remove opensAt.

-- CreateEnum
CREATE TYPE "public"."ReviewFlagStatus" AS ENUM (
  'FLAGGED',
  'ACADEMIC_CONDUCT_REVIEW',
  'NO_ISSUE',
  'REVIEW_COMPLETED'
);

-- AlterTable
ALTER TABLE "public"."AssessmentInstance"
  DROP COLUMN IF EXISTS "opensAt";

-- CreateTable
CREATE TABLE "public"."AssessmentMarker" (
  "id" TEXT NOT NULL,
  "assessmentInstanceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AssessmentMarker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReviewFlag" (
  "id" TEXT NOT NULL,
  "scriptId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "status" "public"."ReviewFlagStatus" NOT NULL,
  "reason" TEXT NOT NULL,
  "outcomeNotes" TEXT,
  "notifiedLeaderUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReviewFlag_pkey" PRIMARY KEY ("id")
);

-- Seed assessment-level marking teams from the prior active module memberships
-- so existing modules keep their current access/allocation surface after deploy.
INSERT INTO "public"."AssessmentMarker" (
  "id",
  "assessmentInstanceId",
  "userId",
  "active",
  "createdAt"
)
SELECT DISTINCT
  'assessment_marker_' || md5("assessment"."id" || ':' || "membership"."userId"),
  "assessment"."id",
  "membership"."userId",
  true,
  CURRENT_TIMESTAMP
FROM "public"."ModuleMembership" AS "membership"
INNER JOIN "public"."AssessmentTemplate" AS "template"
  ON "template"."moduleId" = "membership"."moduleId"
INNER JOIN "public"."AssessmentInstance" AS "assessment"
  ON "assessment"."assessmentTemplateId" = "template"."id"
WHERE "membership"."active" = true;

-- Migrate any legacy integrity flags into the new review-flag workflow.
INSERT INTO "public"."ReviewFlag" (
  "id",
  "scriptId",
  "createdByUserId",
  "status",
  "reason",
  "outcomeNotes",
  "notifiedLeaderUserIds",
  "resolvedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'review_flag_' || md5("flag"."id"),
  "flag"."scriptId",
  COALESCE(
    "allocation"."markerUserId",
    "assessment"."moderatorUserId",
    "leader"."userId",
    "fallbackUser"."id"
  ),
  CASE
    WHEN "flag"."status"::text = 'SUSPECTED_PLAGIARISM'
      THEN 'ACADEMIC_CONDUCT_REVIEW'::"public"."ReviewFlagStatus"
    ELSE 'FLAGGED'::"public"."ReviewFlagStatus"
  END,
  COALESCE("flag"."notes", 'Migrated from the legacy integrity flag workflow.'),
  NULL,
  ARRAY[]::TEXT[],
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "public"."IntegrityFlag" AS "flag"
INNER JOIN "public"."Script" AS "script"
  ON "script"."id" = "flag"."scriptId"
INNER JOIN "public"."AssessmentInstance" AS "assessment"
  ON "assessment"."id" = "script"."assessmentInstanceId"
INNER JOIN "public"."AssessmentTemplate" AS "template"
  ON "template"."id" = "assessment"."assessmentTemplateId"
LEFT JOIN "public"."Allocation" AS "allocation"
  ON "allocation"."scriptId" = "script"."id"
LEFT JOIN LATERAL (
  SELECT "membership"."userId"
  FROM "public"."ModuleMembership" AS "membership"
  WHERE "membership"."moduleId" = "template"."moduleId"
    AND "membership"."active" = true
    AND "membership"."isLeader" = true
  ORDER BY "membership"."id" ASC
  LIMIT 1
) AS "leader" ON true
LEFT JOIN LATERAL (
  SELECT "user"."id"
  FROM "public"."User" AS "user"
  ORDER BY "user"."createdAt" ASC, "user"."id" ASC
  LIMIT 1
) AS "fallbackUser" ON true;

-- Preserve old under-review scripts as open review flags where no integrity flag existed.
INSERT INTO "public"."ReviewFlag" (
  "id",
  "scriptId",
  "createdByUserId",
  "status",
  "reason",
  "outcomeNotes",
  "notifiedLeaderUserIds",
  "resolvedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'review_flag_' || md5("script"."id" || ':legacy-under-review'),
  "script"."id",
  COALESCE(
    "allocation"."markerUserId",
    "assessment"."moderatorUserId",
    "leader"."userId",
    "fallbackUser"."id"
  ),
  'FLAGGED'::"public"."ReviewFlagStatus",
  'Migrated from the previous review status.',
  NULL,
  ARRAY[]::TEXT[],
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "public"."Script" AS "script"
INNER JOIN "public"."AssessmentInstance" AS "assessment"
  ON "assessment"."id" = "script"."assessmentInstanceId"
INNER JOIN "public"."AssessmentTemplate" AS "template"
  ON "template"."id" = "assessment"."assessmentTemplateId"
LEFT JOIN "public"."Allocation" AS "allocation"
  ON "allocation"."scriptId" = "script"."id"
LEFT JOIN LATERAL (
  SELECT "membership"."userId"
  FROM "public"."ModuleMembership" AS "membership"
  WHERE "membership"."moduleId" = "template"."moduleId"
    AND "membership"."active" = true
    AND "membership"."isLeader" = true
  ORDER BY "membership"."id" ASC
  LIMIT 1
) AS "leader" ON true
LEFT JOIN LATERAL (
  SELECT "user"."id"
  FROM "public"."User" AS "user"
  ORDER BY "user"."createdAt" ASC, "user"."id" ASC
  LIMIT 1
) AS "fallbackUser" ON true
WHERE "script"."status" = 'UNDER_REVIEW'
  AND NOT EXISTS (
    SELECT 1
    FROM "public"."ReviewFlag" AS "reviewFlag"
    WHERE "reviewFlag"."scriptId" = "script"."id"
  );

-- Script marking status should no longer carry review-state semantics.
UPDATE "public"."Script"
SET "status" = CASE
  WHEN "grade" IS NULL THEN 'NOT_STARTED'::"public"."ScriptStatus"
  ELSE 'COMPLETED'::"public"."ScriptStatus"
END
WHERE "status" = 'UNDER_REVIEW';

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentMarker_assessmentInstanceId_userId_key"
  ON "public"."AssessmentMarker"("assessmentInstanceId", "userId");

-- CreateIndex
CREATE INDEX "AssessmentMarker_userId_active_idx"
  ON "public"."AssessmentMarker"("userId", "active");

-- CreateIndex
CREATE INDEX "AssessmentMarker_assessmentInstanceId_active_idx"
  ON "public"."AssessmentMarker"("assessmentInstanceId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewFlag_scriptId_key"
  ON "public"."ReviewFlag"("scriptId");

-- CreateIndex
CREATE INDEX "ReviewFlag_status_idx"
  ON "public"."ReviewFlag"("status");

-- AddForeignKey
ALTER TABLE "public"."AssessmentMarker"
  ADD CONSTRAINT "AssessmentMarker_assessmentInstanceId_fkey"
  FOREIGN KEY ("assessmentInstanceId") REFERENCES "public"."AssessmentInstance"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssessmentMarker"
  ADD CONSTRAINT "AssessmentMarker_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReviewFlag"
  ADD CONSTRAINT "ReviewFlag_scriptId_fkey"
  FOREIGN KEY ("scriptId") REFERENCES "public"."Script"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReviewFlag"
  ADD CONSTRAINT "ReviewFlag_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop legacy integrity workflow now that the unified review flag is in place.
DROP TABLE IF EXISTS "public"."IntegrityFlag";
DROP TYPE IF EXISTS "public"."IntegrityVisibility";
DROP TYPE IF EXISTS "public"."IntegrityOutcome";
DROP TYPE IF EXISTS "public"."IntegrityStatus";
