ALTER TABLE "public"."Script" DROP CONSTRAINT IF EXISTS "Script_studentId_fkey";

ALTER TABLE "public"."Script" DROP COLUMN IF EXISTS "studentId";

DROP TABLE IF EXISTS "public"."Student";

DROP TABLE IF EXISTS "public"."ModerationCheck";

DROP TYPE IF EXISTS "public"."ModerationOutcome";
