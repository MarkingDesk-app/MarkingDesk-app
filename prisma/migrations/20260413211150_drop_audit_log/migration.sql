-- Remove the unused application-level audit log table and enum.

DROP TABLE IF EXISTS "public"."AuditLog";

DROP TYPE IF EXISTS "public"."AuditAction";
