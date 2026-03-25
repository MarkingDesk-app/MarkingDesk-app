ALTER TABLE "public"."AssessmentTemplate"
  ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedByUserId" TEXT;

ALTER TABLE "public"."AssessmentTemplate"
  ADD CONSTRAINT "AssessmentTemplate_archivedByUserId_fkey"
  FOREIGN KEY ("archivedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AssessmentTemplate_moduleId_isArchived_idx"
  ON "public"."AssessmentTemplate"("moduleId", "isArchived");

ALTER TABLE "public"."AssessmentInstance"
  ADD COLUMN "moderationRequestedAt" TIMESTAMP(3);
