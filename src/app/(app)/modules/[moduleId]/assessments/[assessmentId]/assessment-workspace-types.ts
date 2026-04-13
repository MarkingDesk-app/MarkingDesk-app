import type { ReviewFlagStatus, SubmissionType } from "@prisma/client";
import type { ReactNode } from "react";

import type { UserPickerOption } from "@/components/ui/user-picker";

export type ScriptRow = {
  id: string;
  turnitinId: string;
  submissionType: SubmissionType;
  grade: number | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "UNDER_REVIEW";
  markerUserId: string | null;
  markerName: string | null;
  canMark: boolean;
  assignedToCurrentUser: boolean;
  reviewFlag: {
    id: string;
    status: ReviewFlagStatus;
    reason: string;
    outcomeNotes: string | null;
    notifiedLeaderUserIds: string[];
  } | null;
};

export type ModerationSummary = {
  moderatorName: string | null;
  moderatorEmail: string | null;
  statusLabel: string;
  completedAt: string | null;
  report: string | null;
  hasCompletedModeration: boolean;
};

export type MarkerProgressSummary = {
  markerId: string;
  markerName: string;
  allocatedScripts: number;
  markedScripts: number;
  remainingScripts: number;
  progressPercentage: number;
};

export type AssessmentWorkspaceShellProps = {
  moduleId: string;
  assessmentId: string;
  moduleCode: string;
  assessmentName: string;
  academicYear: string;
  isArchived: boolean;
  archivedAt: string | null;
  dueAt: string;
  markingDeadlineAt: string;
  canManageAssessment: boolean;
  canSubmitModeration: boolean;
  canViewMarkerProgress: boolean;
  markerOptions: UserPickerOption[];
  markerProgress: MarkerProgressSummary[];
  currentModeratorOption: UserPickerOption | null;
  dueAtInput: string;
  markingDeadlineAtInput: string;
  currentModeratorUserId: string;
  currentMarkerUserIds: string[];
  totalScriptCount: number;
  markedScriptCount: number;
  myAllocatedScriptCount: number;
  myMarkedScriptCount: number;
  moderation: ModerationSummary;
  children: ReactNode;
};

export type AssessmentSubmissionsSectionProps = {
  moduleId: string;
  assessmentId: string;
  isArchived: boolean;
  canManageAssessment: boolean;
  markerOptions: UserPickerOption[];
  moduleLeaderOptions: UserPickerOption[];
  scripts: ScriptRow[];
};
