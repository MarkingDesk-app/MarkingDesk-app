CREATE INDEX "AssessmentInstance_moderatorUserId_dueAt_markingDeadlineAt_idx"
ON "public"."AssessmentInstance"("moderatorUserId", "dueAt", "markingDeadlineAt");
