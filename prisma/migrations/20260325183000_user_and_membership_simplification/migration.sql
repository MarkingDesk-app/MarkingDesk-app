-- Simplify global roles to USER/ADMIN and collapse module membership to one row per user/module.

-- Create the new role enum and remap existing users.
CREATE TYPE "public"."Role_new" AS ENUM ('USER', 'ADMIN');

ALTER TABLE "public"."User"
  ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "public"."User"
  ALTER COLUMN "role" TYPE "public"."Role_new"
  USING (CASE WHEN "role"::text = 'ADMIN' THEN 'ADMIN'::"public"."Role_new" ELSE 'USER'::"public"."Role_new" END);

DROP TYPE "public"."Role";
ALTER TYPE "public"."Role_new" RENAME TO "Role";

ALTER TABLE "public"."User"
  ALTER COLUMN "role" SET DEFAULT 'USER';

-- Add the new leader flag before collapsing duplicate memberships.
ALTER TABLE "public"."ModuleMembership"
  ADD COLUMN "isLeader" BOOLEAN NOT NULL DEFAULT false;

UPDATE "public"."ModuleMembership"
SET "isLeader" = ("role"::text = 'MODULE_LEADER');

WITH aggregated AS (
  SELECT
    MIN("id") AS "keepId",
    "userId",
    "moduleId",
    BOOL_OR("active") AS "nextActive",
    BOOL_OR("isLeader") AS "nextIsLeader"
  FROM "public"."ModuleMembership"
  GROUP BY "userId", "moduleId"
)
UPDATE "public"."ModuleMembership" AS "membership"
SET
  "active" = aggregated."nextActive",
  "isLeader" = aggregated."nextIsLeader"
FROM aggregated
WHERE "membership"."id" = aggregated."keepId";

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "moduleId"
      ORDER BY "active" DESC, "isLeader" DESC, "id" ASC
    ) AS "rowNumber"
  FROM "public"."ModuleMembership"
)
DELETE FROM "public"."ModuleMembership"
WHERE "id" IN (
  SELECT "id"
  FROM ranked
  WHERE "rowNumber" > 1
);

DROP INDEX IF EXISTS "public"."ModuleMembership_userId_moduleId_role_key";
DROP INDEX IF EXISTS "public"."ModuleMembership_moduleId_role_idx";

ALTER TABLE "public"."ModuleMembership"
  DROP COLUMN "role";

DROP TYPE "public"."ModuleRole";

CREATE UNIQUE INDEX "ModuleMembership_userId_moduleId_key" ON "public"."ModuleMembership"("userId", "moduleId");
CREATE INDEX "ModuleMembership_moduleId_isLeader_idx" ON "public"."ModuleMembership"("moduleId", "isLeader");
