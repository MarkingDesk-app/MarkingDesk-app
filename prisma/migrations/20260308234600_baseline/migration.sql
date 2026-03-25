-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('MARKER', 'MODULE_LEADER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."ModuleRole" AS ENUM ('MARKER', 'MODULE_LEADER', 'MODERATOR');

-- CreateEnum
CREATE TYPE "public"."ScriptStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "public"."ModerationOutcome" AS ENUM ('OK', 'TOO_HIGH', 'TOO_LOW', 'INCONSISTENT');

-- CreateEnum
CREATE TYPE "public"."IntegrityStatus" AS ENUM ('UNDER_INVESTIGATION', 'SUSPECTED_PLAGIARISM', 'REQUIRES_REVIEW');

-- CreateEnum
CREATE TYPE "public"."IntegrityOutcome" AS ENUM ('CAPPED_AT_40', 'FAILED_RESIT', 'NO_VIOLATION', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."IntegrityVisibility" AS ENUM ('NORMAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "public"."AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerified" TIMESTAMP(3),
    "role" "public"."Role" NOT NULL DEFAULT 'MARKER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Module" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ModuleMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "role" "public"."ModuleRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ModuleMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssessmentTemplate" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssessmentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AssessmentInstance" (
    "id" TEXT NOT NULL,
    "assessmentTemplateId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3) NOT NULL,
    "markingDeadlineAt" TIMESTAMP(3) NOT NULL,
    "monitorUserId" TEXT,

    CONSTRAINT "AssessmentInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Student" (
    "id" TEXT NOT NULL,
    "studentNumber" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Script" (
    "id" TEXT NOT NULL,
    "assessmentInstanceId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "externalUrl" TEXT NOT NULL,
    "status" "public"."ScriptStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "grade" DOUBLE PRECISION,
    "markerNotes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastEditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Allocation" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "markerUserId" TEXT NOT NULL,
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ModerationCheck" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "moderatorUserId" TEXT NOT NULL,
    "outcome" "public"."ModerationOutcome" NOT NULL,
    "notes" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IntegrityFlag" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "status" "public"."IntegrityStatus" NOT NULL,
    "outcome" "public"."IntegrityOutcome",
    "notes" TEXT,
    "visibility" "public"."IntegrityVisibility" NOT NULL DEFAULT 'NORMAL',

    CONSTRAINT "IntegrityFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "public"."AuditAction" NOT NULL,
    "diffJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Module_code_key" ON "public"."Module"("code");

-- CreateIndex
CREATE INDEX "ModuleMembership_moduleId_role_idx" ON "public"."ModuleMembership"("moduleId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleMembership_userId_moduleId_role_key" ON "public"."ModuleMembership"("userId", "moduleId", "role");

-- CreateIndex
CREATE INDEX "AssessmentTemplate_moduleId_idx" ON "public"."AssessmentTemplate"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentTemplate_moduleId_name_key" ON "public"."AssessmentTemplate"("moduleId", "name");

-- CreateIndex
CREATE INDEX "AssessmentInstance_academicYear_idx" ON "public"."AssessmentInstance"("academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentInstance_assessmentTemplateId_academicYear_key" ON "public"."AssessmentInstance"("assessmentTemplateId", "academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "Student_studentNumber_key" ON "public"."Student"("studentNumber");

-- CreateIndex
CREATE INDEX "Script_status_idx" ON "public"."Script"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Script_assessmentInstanceId_studentId_key" ON "public"."Script"("assessmentInstanceId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Allocation_scriptId_key" ON "public"."Allocation"("scriptId");

-- CreateIndex
CREATE INDEX "Allocation_markerUserId_idx" ON "public"."Allocation"("markerUserId");

-- CreateIndex
CREATE INDEX "ModerationCheck_scriptId_checkedAt_idx" ON "public"."ModerationCheck"("scriptId", "checkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrityFlag_scriptId_key" ON "public"."IntegrityFlag"("scriptId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "public"."AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "public"."AuditLog"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerification_token_key" ON "public"."EmailVerification"("token");

-- CreateIndex
CREATE INDEX "EmailVerification_userId_idx" ON "public"."EmailVerification"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "public"."PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "public"."PasswordResetToken"("userId");

-- AddForeignKey
ALTER TABLE "public"."ModuleMembership" ADD CONSTRAINT "ModuleMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ModuleMembership" ADD CONSTRAINT "ModuleMembership_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "public"."Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssessmentTemplate" ADD CONSTRAINT "AssessmentTemplate_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "public"."Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssessmentInstance" ADD CONSTRAINT "AssessmentInstance_assessmentTemplateId_fkey" FOREIGN KEY ("assessmentTemplateId") REFERENCES "public"."AssessmentTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AssessmentInstance" ADD CONSTRAINT "AssessmentInstance_monitorUserId_fkey" FOREIGN KEY ("monitorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Script" ADD CONSTRAINT "Script_assessmentInstanceId_fkey" FOREIGN KEY ("assessmentInstanceId") REFERENCES "public"."AssessmentInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Script" ADD CONSTRAINT "Script_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Allocation" ADD CONSTRAINT "Allocation_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "public"."Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Allocation" ADD CONSTRAINT "Allocation_markerUserId_fkey" FOREIGN KEY ("markerUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ModerationCheck" ADD CONSTRAINT "ModerationCheck_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "public"."Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ModerationCheck" ADD CONSTRAINT "ModerationCheck_moderatorUserId_fkey" FOREIGN KEY ("moderatorUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IntegrityFlag" ADD CONSTRAINT "IntegrityFlag_scriptId_fkey" FOREIGN KEY ("scriptId") REFERENCES "public"."Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

