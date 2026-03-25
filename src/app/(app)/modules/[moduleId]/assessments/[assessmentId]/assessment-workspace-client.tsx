"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Flag,
  LoaderCircle,
  Upload,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ModerationStatus, ReviewFlagStatus, SubmissionType } from "@prisma/client";

import {
  assignAllocationsAction,
  importAssessmentSubmissionsAction,
  saveAssessmentModerationAction,
  saveReviewFlagAction,
  saveScriptAllocationAction,
  saveScriptGradeAction,
  updateAssessmentSettingsAction,
} from "./actions";
import {
  buildTurnitinSubmissionUrl,
  extractTurnitinIds,
  findDuplicateIds,
  formatReviewFlagStatus,
  formatSubmissionType,
  isReviewFlagResolved,
} from "@/lib/assessment-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FloatingToast } from "@/components/ui/floating-toast";
import { ModalShell } from "@/components/ui/modal-shell";
import { UserMultiPicker } from "@/components/ui/user-multi-picker";
import { UserPicker, type UserPickerOption } from "@/components/ui/user-picker";

type ScriptRow = {
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

type ModerationSummary = {
  moderatorName: string | null;
  moderatorEmail: string | null;
  statusLabel: string;
  completedAt: string | null;
  report: string | null;
  hasCompletedModeration: boolean;
};

type AssessmentWorkspaceClientProps = {
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
  markerOptions: UserPickerOption[];
  moderatorOptions: UserPickerOption[];
  allUserOptions: UserPickerOption[];
  moduleLeaderOptions: UserPickerOption[];
  dueAtInput: string;
  markingDeadlineAtInput: string;
  currentModeratorUserId: string;
  currentMarkerUserIds: string[];
  scripts: ScriptRow[];
  moderation: ModerationSummary;
};

type ToastState = {
  tone: "success" | "error";
  message: string;
} | null;

type ViewMode = "all" | "my_allocation";

type AllocationDraft = {
  scriptId: string;
  turnitinId: string;
} | null;

type ReviewDraft = {
  scriptId: string;
  turnitinId: string;
} | null;

type GradeFilter = "all" | "graded" | "ungraded";
type FlagFilter = "all" | "needs_attention" | "resolved" | "unflagged";
type SortOption = "script_asc" | "script_desc" | "marker_asc" | "submission_type" | "flag_status";

function formatGradeValue(grade: number | null): string {
  if (grade === null) {
    return "";
  }

  return Number.isInteger(grade) ? String(grade) : String(grade);
}

function areEqualGradeValues(left: string, right: string): boolean {
  return left.trim() === right.trim();
}

function isScriptMarked(script: ScriptRow, gradeInputs: Record<string, string>): boolean {
  const pendingGradeValue = gradeInputs[script.id];
  const effectiveValue = pendingGradeValue ?? formatGradeValue(script.grade);
  return effectiveValue.trim() !== "";
}

function uniqueIdsInOrder(ids: string[]): string[] {
  const seen = new Set<string>();

  return ids.filter((id) => {
    if (seen.has(id)) {
      return false;
    }

    seen.add(id);
    return true;
  });
}

function moderationStatusFromLabel(statusLabel: string): ModerationStatus {
  if (statusLabel === "Minor adjustments required") {
    return ModerationStatus.MINOR_ADJUSTMENTS_REQUIRED;
  }

  if (statusLabel === "Major issues") {
    return ModerationStatus.MAJOR_ISSUES;
  }

  return ModerationStatus.NO_ISSUES;
}

function compareNullableText(left: string | null, right: string | null): number {
  return (left ?? "").localeCompare(right ?? "");
}

function buildDefaultAllocationCounts(markerOptions: UserPickerOption[], totalScriptCount: number): Record<string, string> {
  if (markerOptions.length === 0) {
    return {};
  }

  const baseCount = Math.floor(totalScriptCount / markerOptions.length);
  const remainder = totalScriptCount % markerOptions.length;

  return Object.fromEntries(
    markerOptions.map((marker, index) => [marker.id, String(baseCount + (index < remainder ? 1 : 0))])
  );
}

function getReviewFlagClasses(status: ReviewFlagStatus | null | undefined): string {
  if (!status) {
    return "border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600";
  }

  if (status === ReviewFlagStatus.ACADEMIC_CONDUCT_REVIEW) {
    return "border-rose-200 text-rose-600 hover:border-rose-300 hover:text-rose-700";
  }

  if (isReviewFlagResolved(status)) {
    return "border-emerald-200 text-emerald-600 hover:border-emerald-300 hover:text-emerald-700";
  }

  return "border-amber-200 text-amber-600 hover:border-amber-300 hover:text-amber-700";
}

export function AssessmentWorkspaceClient({
  moduleId,
  assessmentId,
  moduleCode,
  assessmentName,
  academicYear,
  isArchived,
  archivedAt,
  dueAt,
  markingDeadlineAt,
  canManageAssessment,
  canSubmitModeration,
  markerOptions,
  moderatorOptions,
  allUserOptions,
  moduleLeaderOptions,
  dueAtInput,
  markingDeadlineAtInput,
  currentModeratorUserId,
  currentMarkerUserIds,
  scripts: initialScripts,
  moderation: initialModeration,
}: AssessmentWorkspaceClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const scripts = initialScripts;
  const moderation = initialModeration;
  const [selectedScriptIds, setSelectedScriptIds] = useState<string[]>([]);
  const [gradeInputs, setGradeInputs] = useState<Record<string, string>>(
    Object.fromEntries(initialScripts.map((script) => [script.id, formatGradeValue(script.grade)]))
  );
  const [toast, setToast] = useState<ToastState>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showOpenAllModal, setShowOpenAllModal] = useState(false);
  const [showOpenMyAllocationModal, setShowOpenMyAllocationModal] = useState(false);
  const [showEditAssessmentModal, setShowEditAssessmentModal] = useState(false);
  const [showAssignAllocationsModal, setShowAssignAllocationsModal] = useState(false);
  const [showModerationModal, setShowModerationModal] = useState(false);
  const [allocationDraft, setAllocationDraft] = useState<AllocationDraft>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft>(null);
  const [allocationMarkerUserId, setAllocationMarkerUserId] = useState("");
  const [allocationCounts, setAllocationCounts] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [importSubmissionType, setImportSubmissionType] = useState<SubmissionType>(SubmissionType.FIRST_SUBMISSION);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [settingsDueAt, setSettingsDueAt] = useState(dueAtInput);
  const [settingsMarkingDeadlineAt, setSettingsMarkingDeadlineAt] = useState(markingDeadlineAtInput);
  const [settingsModeratorUserId, setSettingsModeratorUserId] = useState(currentModeratorUserId);
  const [settingsMarkerUserIds, setSettingsMarkerUserIds] = useState(currentMarkerUserIds);
  const [moderationStatus, setModerationStatus] = useState<ModerationStatus>(
    moderationStatusFromLabel(initialModeration.statusLabel)
  );
  const [moderationReport, setModerationReport] = useState(initialModeration.report ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [markerFilterUserId, setMarkerFilterUserId] = useState("");
  const [submissionTypeFilter, setSubmissionTypeFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [flagFilter, setFlagFilter] = useState<FlagFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("script_asc");
  const [reviewStatus, setReviewStatus] = useState<ReviewFlagStatus>(ReviewFlagStatus.FLAGGED);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewOutcomeNotes, setReviewOutcomeNotes] = useState("");
  const [reviewNotifyLeaderUserIds, setReviewNotifyLeaderUserIds] = useState<string[]>([]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  const myAllocatedScripts = useMemo(
    () => scripts.filter((script) => script.assignedToCurrentUser),
    [scripts]
  );
  const filteredScripts = useMemo(() => {
    const baseScripts = viewMode === "my_allocation" ? myAllocatedScripts : scripts;
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const nextScripts = baseScripts.filter((script) => {
      const matchesSearch =
        normalizedQuery.length === 0 ||
        script.turnitinId.toLowerCase().includes(normalizedQuery) ||
        (script.markerName ?? "").toLowerCase().includes(normalizedQuery);

      const matchesMarker = !markerFilterUserId || script.markerUserId === markerFilterUserId;
      const matchesSubmissionType = !submissionTypeFilter || script.submissionType === submissionTypeFilter;
      const matchesGrade =
        gradeFilter === "all" ||
        (gradeFilter === "graded" ? script.grade !== null : script.grade === null);
      const matchesFlag =
        flagFilter === "all" ||
        (flagFilter === "unflagged"
          ? script.reviewFlag === null
          : flagFilter === "needs_attention"
            ? Boolean(script.reviewFlag && !isReviewFlagResolved(script.reviewFlag.status))
            : Boolean(script.reviewFlag && isReviewFlagResolved(script.reviewFlag.status)));

      return matchesSearch && matchesMarker && matchesSubmissionType && matchesGrade && matchesFlag;
    });

    return [...nextScripts].sort((left, right) => {
      switch (sortOption) {
        case "script_desc":
          return right.turnitinId.localeCompare(left.turnitinId);
        case "marker_asc":
          return compareNullableText(left.markerName, right.markerName) || left.turnitinId.localeCompare(right.turnitinId);
        case "submission_type":
          return (
            formatSubmissionType(left.submissionType).localeCompare(formatSubmissionType(right.submissionType)) ||
            left.turnitinId.localeCompare(right.turnitinId)
          );
        case "flag_status":
          return (
            formatReviewFlagStatus(left.reviewFlag?.status).localeCompare(formatReviewFlagStatus(right.reviewFlag?.status)) ||
            left.turnitinId.localeCompare(right.turnitinId)
          );
        case "script_asc":
        default:
          return left.turnitinId.localeCompare(right.turnitinId);
      }
    });
  }, [
    flagFilter,
    gradeFilter,
    markerFilterUserId,
    myAllocatedScripts,
    scripts,
    searchQuery,
    sortOption,
    submissionTypeFilter,
    viewMode,
  ]);
  const visibleScripts = filteredScripts;
  const activeSelectedScriptIds = selectedScriptIds.filter((id) => scripts.some((script) => script.id === id));
  const visibleSelectedScriptIds = activeSelectedScriptIds.filter((id) =>
    visibleScripts.some((script) => script.id === id)
  );
  const totalScriptCount = scripts.length;
  const markedScriptCount = scripts.filter((script) => isScriptMarked(script, gradeInputs)).length;
  const myAllocatedScriptCount = myAllocatedScripts.length;
  const myMarkedScriptCount = myAllocatedScripts.filter((script) => isScriptMarked(script, gradeInputs)).length;
  const allSelected = visibleScripts.length > 0 && visibleSelectedScriptIds.length === visibleScripts.length;
  const remainingScripts = totalScriptCount - markedScriptCount;
  const myRemainingScripts = myAllocatedScriptCount - myMarkedScriptCount;
  const progressPercentage = totalScriptCount === 0 ? 0 : Math.round((markedScriptCount / totalScriptCount) * 100);
  const myProgressPercentage =
    myAllocatedScriptCount === 0 ? 0 : Math.round((myMarkedScriptCount / myAllocatedScriptCount) * 100);
  const allocationTotal = useMemo(
    () =>
      markerOptions.reduce(
        (sum, marker) => sum + Math.max(0, Number.parseInt(allocationCounts[marker.id] ?? "0", 10) || 0),
        0
      ),
    [allocationCounts, markerOptions]
  );
  const allocationDifference = totalScriptCount - allocationTotal;
  const allocationIsValid = allocationTotal === totalScriptCount;

  const extractedIds = useMemo(() => extractTurnitinIds(importText), [importText]);
  const duplicateIdsInPaste = useMemo(() => findDuplicateIds(extractedIds), [extractedIds]);
  const existingTurnitinIdSet = useMemo(() => new Set(scripts.map((script) => script.turnitinId)), [scripts]);
  const existingDuplicateIds = useMemo(
    () =>
      Array.from(new Set(extractedIds.filter((turnitinId) => existingTurnitinIdSet.has(turnitinId)))).sort((left, right) =>
        left.localeCompare(right)
      ),
    [existingTurnitinIdSet, extractedIds]
  );
  const canImport =
    extractedIds.length > 0 && duplicateIdsInPaste.length === 0 && existingDuplicateIds.length === 0 && !isPending;
  const activeReviewScript = reviewDraft ? scripts.find((script) => script.id === reviewDraft.scriptId) ?? null : null;

  const showToast = (tone: "success" | "error", message: string) => {
    setToast({ tone, message });
  };

  const closeAllocationModal = () => {
    setAllocationDraft(null);
    setAllocationMarkerUserId("");
  };

  const closeAssignAllocationsModal = () => {
    setShowAssignAllocationsModal(false);
  };

  const closeReviewModal = () => {
    setReviewDraft(null);
    setReviewStatus(ReviewFlagStatus.FLAGGED);
    setReviewReason("");
    setReviewOutcomeNotes("");
    setReviewNotifyLeaderUserIds([]);
  };

  const resetAssessmentSettingsForm = () => {
    setSettingsDueAt(dueAtInput);
    setSettingsMarkingDeadlineAt(markingDeadlineAtInput);
    setSettingsModeratorUserId(currentModeratorUserId);
    setSettingsMarkerUserIds(currentMarkerUserIds);
  };

  const openModerationModal = () => {
    setModerationStatus(moderationStatusFromLabel(moderation.statusLabel));
    setModerationReport(moderation.report ?? "");
    setShowModerationModal(true);
  };

  const handleViewModeChange = (nextViewMode: ViewMode) => {
    setViewMode(nextViewMode);

    if (nextViewMode === "all") {
      return;
    }

    const myAllocationIds = new Set(myAllocatedScripts.map((script) => script.id));
    setSelectedScriptIds((current) => current.filter((id) => myAllocationIds.has(id)));
  };

  const rewriteImportTextWithIds = (ids: string[]) => {
    setImportText(ids.join("\n"));
    setImportError(null);
  };

  const handleRemoveDuplicateEntries = () => {
    rewriteImportTextWithIds(uniqueIdsInOrder(extractedIds));
    showToast("success", "Duplicate IDs removed from the import list.");
  };

  const handleRemoveExistingIds = () => {
    rewriteImportTextWithIds(extractedIds.filter((turnitinId) => !existingTurnitinIdSet.has(turnitinId)));
    showToast("success", "Existing IDs removed from the import list.");
  };

  const handleKeepOnlyNewUniqueIds = () => {
    rewriteImportTextWithIds(
      uniqueIdsInOrder(extractedIds).filter((turnitinId) => !existingTurnitinIdSet.has(turnitinId))
    );
    showToast("success", "Import list cleaned up.");
  };

  const toggleSelectAll = () => {
    setSelectedScriptIds(
      allSelected
        ? activeSelectedScriptIds.filter((id) => !visibleScripts.some((script) => script.id === id))
        : Array.from(new Set([...activeSelectedScriptIds, ...visibleScripts.map((script) => script.id)]))
    );
  };

  const toggleScriptSelection = (scriptId: string) => {
    setSelectedScriptIds((current) =>
      current.includes(scriptId) ? current.filter((id) => id !== scriptId) : [...current, scriptId]
    );
  };

  const openScriptsInTabs = (scriptIds: string[]) => {
    const selectedScripts = scripts.filter((script) => scriptIds.includes(script.id));

    for (const script of selectedScripts) {
      window.open(buildTurnitinSubmissionUrl(script.turnitinId), "_blank", "noopener,noreferrer");
    }
  };

  const handleGradeBlur = (scriptId: string) => {
    const script = scripts.find((currentScript) => currentScript.id === scriptId);

    if (!script) {
      return;
    }

    const nextValue = (gradeInputs[scriptId] ?? "").trim();
    const previousValue = formatGradeValue(script.grade);

    if (areEqualGradeValues(nextValue, previousValue)) {
      return;
    }

    startTransition(async () => {
      const result = await saveScriptGradeAction({
        moduleId,
        assessmentId,
        scriptId,
        grade: nextValue,
      });

      if (!result.ok) {
        setGradeInputs((current) => ({
          ...current,
          [scriptId]: previousValue,
        }));
        showToast("error", result.error);
        return;
      }

      setGradeInputs((current) => ({
        ...current,
        [scriptId]: formatGradeValue(result.data?.savedGrade ?? null),
      }));
      showToast("success", result.message ?? "Grade saved.");
      router.refresh();
    });
  };

  const openAllocationModal = (script: ScriptRow) => {
    setAllocationDraft({
      scriptId: script.id,
      turnitinId: script.turnitinId,
    });
    setAllocationMarkerUserId(script.markerUserId ?? "");
  };

  const handleAllocationSave = () => {
    if (!allocationDraft) {
      return;
    }

    startTransition(async () => {
      const result = await saveScriptAllocationAction({
        moduleId,
        assessmentId,
        scriptId: allocationDraft.scriptId,
        markerUserId: allocationMarkerUserId || null,
      });

      if (!result.ok) {
        showToast("error", result.error);
        return;
      }

      closeAllocationModal();
      showToast("success", result.message ?? "Allocation saved.");
      router.refresh();
    });
  };

  const openReviewModal = (script: ScriptRow) => {
    setReviewDraft({
      scriptId: script.id,
      turnitinId: script.turnitinId,
    });
    setReviewStatus(script.reviewFlag?.status ?? ReviewFlagStatus.FLAGGED);
    setReviewReason(script.reviewFlag?.reason ?? "");
    setReviewOutcomeNotes(script.reviewFlag?.outcomeNotes ?? "");
    setReviewNotifyLeaderUserIds(script.reviewFlag?.notifiedLeaderUserIds ?? []);
  };

  const handleReviewFlagSave = () => {
    if (!reviewDraft) {
      return;
    }

    startTransition(async () => {
      const result = await saveReviewFlagAction({
        moduleId,
        assessmentId,
        scriptId: reviewDraft.scriptId,
        status: reviewStatus,
        reason: reviewReason,
        outcomeNotes: reviewOutcomeNotes,
        notifyLeaderUserIds: reviewNotifyLeaderUserIds,
      });

      if (!result.ok) {
        showToast("error", result.error);
        return;
      }

      closeReviewModal();
      showToast("success", result.message ?? "Review flag saved.");
      router.refresh();
    });
  };

  const handleImportSubmit = () => {
    if (!canImport) {
      return;
    }

    startTransition(async () => {
      const result = await importAssessmentSubmissionsAction({
        moduleId,
        assessmentId,
        submissionType: importSubmissionType,
        rawText: importText,
      });

      if (!result.ok) {
        setImportError(result.error);
        if (result.data?.duplicateIds?.length || result.data?.existingIds?.length) {
          setImportError("Remove duplicate IDs before importing submissions.");
        }
        showToast("error", result.error);
        return;
      }

      setImportText("");
      setImportError(null);
      setShowImportModal(false);
      showToast("success", result.message ?? "Submissions imported.");
      router.refresh();
    });
  };

  const openAssignAllocationsModal = () => {
    setAllocationCounts(buildDefaultAllocationCounts(markerOptions, totalScriptCount));
    setShowAssignAllocationsModal(true);
  };

  const handleAssignAllocationsSubmit = () => {
    if (!allocationIsValid || markerOptions.length === 0) {
      return;
    }

    const allocations = markerOptions.map((marker) => ({
      markerUserId: marker.id,
      count: Math.max(0, Number.parseInt(allocationCounts[marker.id] ?? "0", 10) || 0),
    }));

    startTransition(async () => {
      const result = await assignAllocationsAction({
        moduleId,
        assessmentId,
        allocations,
      });

      if (!result.ok) {
        showToast("error", result.error);
        return;
      }

      closeAssignAllocationsModal();
      showToast("success", result.message ?? "Allocations assigned.");
      router.refresh();
    });
  };

  const handleModerationSubmit = () => {
    startTransition(async () => {
      const result = await saveAssessmentModerationAction({
        moduleId,
        assessmentId,
        status: moderationStatus,
        report: moderationReport,
      });

      if (!result.ok) {
        showToast("error", result.error);
        return;
      }

      setShowModerationModal(false);
      showToast("success", result.message ?? "Moderation report saved.");
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">{moduleCode}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              {assessmentName} <span className="text-slate-400">/</span> {academicYear}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {isArchived ? (
                <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-medium text-white">
                  Archived for audit
                </span>
              ) : null}
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {totalScriptCount} submissions
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">{remainingScripts} remaining</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">Due {dueAt}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                Marking deadline {markingDeadlineAt}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                Moderator {moderation.moderatorName ?? "Not assigned"}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                Moderation {moderation.statusLabel}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={openModerationModal}>
              View moderation
            </Button>
            {canManageAssessment ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    resetAssessmentSettingsForm();
                    setShowEditAssessmentModal(true);
                  }}
                >
                  Edit assessment
                </Button>
                <Button
                  variant="secondary"
                  onClick={openAssignAllocationsModal}
                  disabled={isPending || markerOptions.length === 0 || totalScriptCount === 0}
                >
                  {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UsersRound className="h-4 w-4" />}
                  Assign Allocations
                </Button>
                <Button onClick={() => setShowImportModal(true)}>
                  <Upload className="h-4 w-4" />
                  Import Submissions
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </section>

      {isArchived ? (
        <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-5 py-4 text-sm text-slate-600">
          This assessment was archived{archivedAt ? ` on ${archivedAt}` : ""}. It remains visible for audit purposes,
          but editing, imports, allocation changes, moderation updates, and review updates are disabled.
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Overall Marking Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-3xl font-semibold tracking-tight text-slate-950">
                {markedScriptCount}/{totalScriptCount}
              </p>
              <p className="text-sm text-slate-500">completed</p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-sky-600 transition-[width]"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <p className="text-sm text-slate-600">{remainingScripts} submissions still need grades.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Your Allocation Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {myAllocatedScriptCount > 0 ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-3xl font-semibold tracking-tight text-slate-950">
                    {myMarkedScriptCount}/{myAllocatedScriptCount}
                  </p>
                  <p className="text-sm text-slate-500">marked</p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-[width]"
                    style={{ width: `${myProgressPercentage}%` }}
                  />
                </div>
                <p className="text-sm text-slate-600">{myRemainingScripts} still on your list.</p>
              </>
            ) : (
              <p className="text-sm text-slate-600">No scripts allocated to you.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-col gap-4 border-b border-slate-200/80 lg:flex-row lg:items-start lg:justify-between">
          <CardTitle className="text-xl">Submissions</CardTitle>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => handleViewModeChange("all")}
                className={
                  viewMode === "all"
                    ? "rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white"
                    : "rounded-xl px-3 py-2 text-sm font-medium text-slate-600"
                }
              >
                View All
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange("my_allocation")}
                disabled={myAllocatedScripts.length === 0}
                className={
                  viewMode === "my_allocation"
                    ? "rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-200 disabled:text-slate-400"
                    : "rounded-xl px-3 py-2 text-sm font-medium text-slate-600 disabled:text-slate-400"
                }
              >
                View My Allocation
              </button>
            </div>
            {visibleSelectedScriptIds.length > 0 ? (
              <Button variant="secondary" onClick={() => openScriptsInTabs(visibleSelectedScriptIds)}>
                Open selected ({visibleSelectedScriptIds.length})
              </Button>
            ) : null}
            {scripts.length > 0 ? (
              <Button variant="secondary" onClick={() => setShowOpenAllModal(true)}>
                Open all
              </Button>
            ) : null}
            {myAllocatedScripts.length > 0 ? (
              <Button variant="secondary" onClick={() => setShowOpenMyAllocationModal(true)}>
                Open my allocation
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 xl:grid-cols-[1.2fr_repeat(4,minmax(0,0.8fr))]">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search script ID or marker"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
            />
            <select
              value={markerFilterUserId}
              onChange={(event) => setMarkerFilterUserId(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
            >
              <option value="">All markers</option>
              {markerOptions.map((marker) => (
                <option key={marker.id} value={marker.id}>
                  {marker.name}
                </option>
              ))}
            </select>
            <select
              value={submissionTypeFilter}
              onChange={(event) => setSubmissionTypeFilter(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
            >
              <option value="">All submission types</option>
              <option value={SubmissionType.FIRST_SUBMISSION}>1st Submission</option>
              <option value={SubmissionType.SEVEN_DAY_WINDOW}>7-day</option>
            </select>
            <select
              value={gradeFilter}
              onChange={(event) => setGradeFilter(event.target.value as GradeFilter)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
            >
              <option value="all">All grades</option>
              <option value="graded">Graded</option>
              <option value="ungraded">Ungraded</option>
            </select>
            <select
              value={flagFilter}
              onChange={(event) => setFlagFilter(event.target.value as FlagFilter)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
            >
              <option value="all">All flags</option>
              <option value="needs_attention">Flagged or under review</option>
              <option value="resolved">Resolved flags</option>
              <option value="unflagged">No flag</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              {visibleScripts.length} of {viewMode === "my_allocation" ? myAllocatedScripts.length : scripts.length} scripts shown
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={sortOption}
                onChange={(event) => setSortOption(event.target.value as SortOption)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
              >
                <option value="script_asc">Sort: Script ID A-Z</option>
                <option value="script_desc">Sort: Script ID Z-A</option>
                <option value="marker_asc">Sort: Marker A-Z</option>
                <option value="submission_type">Sort: Submission type</option>
                <option value="flag_status">Sort: Flag status</option>
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setMarkerFilterUserId("");
                  setSubmissionTypeFilter("");
                  setGradeFilter("all");
                  setFlagFilter("all");
                  setSortOption("script_asc");
                }}
              >
                Reset filters
              </Button>
            </div>
          </div>

          {visibleScripts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center text-sm text-slate-500">
              {searchQuery || markerFilterUserId || submissionTypeFilter || gradeFilter !== "all" || flagFilter !== "all"
                ? "No scripts match the current filters."
                : viewMode === "my_allocation"
                ? "No scripts are currently assigned to you."
                : (
                    <>
                      No submissions yet. Use{" "}
                      <span className="font-medium text-slate-700">Import Submissions</span> to add the Turnitin IDs for
                      this assessment.
                    </>
                  )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr className="bg-slate-50/80 text-left text-xs uppercase tracking-[0.2em] text-slate-500">
                    <th className="px-4 py-3">
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                    </th>
                    <th className="px-4 py-3">Script ID</th>
                    <th className="px-4 py-3">Marker</th>
                    <th className="px-4 py-3">Submission Type</th>
                    <th className="px-4 py-3">Grade</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleScripts.map((script) => (
                    <tr key={script.id} className="border-t border-slate-200/80 text-sm text-slate-700">
                      <td className="border-t border-slate-200/80 px-4 py-3 align-middle">
                        <input
                          type="checkbox"
                          checked={activeSelectedScriptIds.includes(script.id)}
                          onChange={() => toggleScriptSelection(script.id)}
                        />
                      </td>
                      <td className="border-t border-slate-200/80 px-4 py-3 align-middle font-medium text-slate-950">
                        {script.turnitinId}
                      </td>
                      <td className="border-t border-slate-200/80 px-4 py-3 align-middle">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-slate-600">{script.markerName ?? "Unassigned"}</span>
                          {canManageAssessment ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => openAllocationModal(script)}
                            >
                              {script.markerUserId ? "Change" : "Assign"}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                      <td className="border-t border-slate-200/80 px-4 py-3 align-middle">
                        {formatSubmissionType(script.submissionType)}
                      </td>
                      <td className="border-t border-slate-200/80 px-4 py-3 align-middle">
                        {script.canMark ? (
                          <input
                            value={gradeInputs[script.id] ?? ""}
                            onChange={(event) =>
                              setGradeInputs((current) => ({
                                ...current,
                                [script.id]: event.target.value,
                              }))
                            }
                            onBlur={() => handleGradeBlur(script.id)}
                            inputMode="decimal"
                            className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-sky-500 focus:ring-2"
                            placeholder="Grade"
                          />
                        ) : (
                          <span className="text-slate-500">{formatGradeValue(script.grade) || "—"}</span>
                        )}
                      </td>
                      <td className="border-t border-slate-200/80 px-4 py-3 align-middle">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openReviewModal(script)}
                            disabled={isArchived}
                            className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${getReviewFlagClasses(script.reviewFlag?.status)}`}
                            title={
                              isArchived
                                ? "Archived assessments are read-only"
                                : script.reviewFlag
                                  ? formatReviewFlagStatus(script.reviewFlag.status)
                                  : "Flag for review"
                            }
                          >
                            {script.reviewFlag?.status === ReviewFlagStatus.ACADEMIC_CONDUCT_REVIEW ? (
                              <AlertTriangle className="h-4 w-4" />
                            ) : (
                              <Flag className="h-4 w-4" />
                            )}
                          </button>
                          <a
                            href={buildTurnitinSubmissionUrl(script.turnitinId)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-sky-200 hover:text-sky-700"
                            title="Open script"
                          >
                            <ArrowUpRight className="h-4 w-4" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ModalShell
        open={showEditAssessmentModal}
        onClose={() => setShowEditAssessmentModal(false)}
        title="Edit assessment"
        description="Update the dates, moderator, and assessment marking team."
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="edit-due-at" className="text-sm font-medium text-slate-700">
                Due date
              </label>
              <input
                id="edit-due-at"
                type="datetime-local"
                value={settingsDueAt}
                onChange={(event) => setSettingsDueAt(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="edit-marking-deadline-at" className="text-sm font-medium text-slate-700">
                Marking deadline
              </label>
              <input
                id="edit-marking-deadline-at"
                type="datetime-local"
                value={settingsMarkingDeadlineAt}
                onChange={(event) => setSettingsMarkingDeadlineAt(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
              />
            </div>
            <UserPicker
              options={moderatorOptions}
              value={settingsModeratorUserId}
              onValueChange={setSettingsModeratorUserId}
              label="Assigned moderator"
              placeholder="Search for a user"
            />
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <UserMultiPicker
              options={allUserOptions}
              value={settingsMarkerUserIds}
              onValueChange={setSettingsMarkerUserIds}
              label="Marking team"
              placeholder="Search for a marker to add"
              addLabel="Add marker"
              emptyText="No markers selected yet."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowEditAssessmentModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                startTransition(async () => {
                  const result = await updateAssessmentSettingsAction({
                    moduleId,
                    assessmentId,
                    dueAt: settingsDueAt,
                    markingDeadlineAt: settingsMarkingDeadlineAt,
                    moderatorUserId: settingsModeratorUserId,
                    markerUserIds: settingsMarkerUserIds,
                  });

                  if (!result.ok) {
                    showToast("error", result.error);
                    return;
                  }

                  setShowEditAssessmentModal(false);
                  showToast("success", result.message ?? "Assessment settings updated.");
                  router.refresh();
                });
              }}
              disabled={isPending || !settingsDueAt || !settingsMarkingDeadlineAt}
            >
              Save changes
            </Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={allocationDraft !== null}
        onClose={closeAllocationModal}
        title="Assign marker"
        description={
          allocationDraft
            ? `Choose the marker for script ${allocationDraft.turnitinId}.`
            : "Choose the marker for this script."
        }
        widthClassName="max-w-lg"
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Script ID: <span className="font-medium text-slate-900">{allocationDraft?.turnitinId ?? "—"}</span>
          </div>

          <UserPicker
            options={markerOptions}
            value={allocationMarkerUserId}
            onValueChange={setAllocationMarkerUserId}
            label="Allocated marker"
            placeholder="Search for a module member"
          />

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeAllocationModal}>
              Cancel
            </Button>
            <Button onClick={handleAllocationSave} disabled={isPending}>
              Save allocation
            </Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={showAssignAllocationsModal}
        onClose={closeAssignAllocationsModal}
        title="Assign Allocations"
        description={`Set how many scripts each marker should receive. The counts must total ${totalScriptCount} scripts.`}
        widthClassName="max-w-3xl"
      >
        <div className="space-y-5">
          {markerOptions.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              No active markers are available for this assessment.
            </div>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {markerOptions.map((marker) => (
                  <div key={marker.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{marker.name}</p>
                        <p className="text-xs text-slate-500">{marker.email}</p>
                        {marker.meta ? <p className="text-xs text-slate-500">{marker.meta}</p> : null}
                      </div>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={allocationCounts[marker.id] ?? "0"}
                        onChange={(event) =>
                          setAllocationCounts((current) => ({
                            ...current,
                            [marker.id]: event.target.value,
                          }))
                        }
                        className="w-24 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-right text-sm outline-none ring-sky-500 focus:ring-2"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div
                className={
                  allocationIsValid
                    ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
                    : allocationDifference < 0
                      ? "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
                      : "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
                }
              >
                <p className="font-medium text-slate-900">
                  Allocation total: {allocationTotal}/{totalScriptCount} scripts
                </p>
                <p className="mt-1">
                  {allocationIsValid
                    ? "The allocation is ready to submit."
                    : allocationDifference < 0
                      ? `The allocation exceeds the total by ${Math.abs(allocationDifference)} scripts.`
                      : `Add ${allocationDifference} more script${allocationDifference === 1 ? "" : "s"} to continue.`}
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={closeAssignAllocationsModal}>
                  Cancel
                </Button>
                <Button onClick={handleAssignAllocationsSubmit} disabled={!allocationIsValid || isPending}>
                  {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                  Allocate
                </Button>
              </div>
            </>
          )}
        </div>
      </ModalShell>

      <ModalShell
        open={reviewDraft !== null}
        onClose={closeReviewModal}
        title="Review flag"
        description={
          reviewDraft
            ? `View or update the review status for script ${reviewDraft.turnitinId}.`
            : "View or update the review status for this script."
        }
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Script ID: <span className="font-medium text-slate-900">{reviewDraft?.turnitinId ?? "—"}</span>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 text-sm text-slate-600">
            <p>
              Once a script has been flagged, the flag stays on the script permanently as part of the audit trail, even
              after the review has been resolved.
            </p>
            <div className="space-y-2">
              <p className="font-medium text-slate-900">Flag colours</p>
              <p>
                <span className="font-medium text-amber-700">Amber</span>: flagged and still needs attention.
              </p>
              <p>
                <span className="font-medium text-rose-700">Red</span>: academic conduct review.
              </p>
              <p>
                <span className="font-medium text-emerald-700">Green</span>: no issue or review completed.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="radio"
                checked={reviewStatus === ReviewFlagStatus.FLAGGED}
                onChange={() => setReviewStatus(ReviewFlagStatus.FLAGGED)}
              />
              <span className="text-sm font-medium text-slate-900">Flagged</span>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="radio"
                checked={reviewStatus === ReviewFlagStatus.ACADEMIC_CONDUCT_REVIEW}
                onChange={() => setReviewStatus(ReviewFlagStatus.ACADEMIC_CONDUCT_REVIEW)}
              />
              <span className="text-sm font-medium text-slate-900">Academic Conduct Review</span>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="radio"
                checked={reviewStatus === ReviewFlagStatus.NO_ISSUE}
                onChange={() => setReviewStatus(ReviewFlagStatus.NO_ISSUE)}
              />
              <span className="text-sm font-medium text-slate-900">No issue</span>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="radio"
                checked={reviewStatus === ReviewFlagStatus.REVIEW_COMPLETED}
                onChange={() => setReviewStatus(ReviewFlagStatus.REVIEW_COMPLETED)}
              />
              <span className="text-sm font-medium text-slate-900">Review completed</span>
            </label>
          </div>

          <div className="space-y-2">
            <label htmlFor="review-reason" className="text-sm font-medium text-slate-700">
              Reason for flagging
            </label>
            <textarea
              id="review-reason"
              value={reviewReason}
              onChange={(event) => setReviewReason(event.target.value)}
              rows={4}
              className="w-full rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm outline-none ring-sky-500 focus:ring-2"
              placeholder="Describe why this script needs review..."
            />
          </div>

          {reviewStatus === ReviewFlagStatus.REVIEW_COMPLETED ? (
            <div className="space-y-2">
              <label htmlFor="review-outcome-notes" className="text-sm font-medium text-slate-700">
                Review outcome
              </label>
              <textarea
                id="review-outcome-notes"
                value={reviewOutcomeNotes}
                onChange={(event) => setReviewOutcomeNotes(event.target.value)}
                rows={4}
                className="w-full rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm outline-none ring-sky-500 focus:ring-2"
                placeholder="Record the final outcome of the review..."
              />
            </div>
          ) : null}

          <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <p className="text-sm font-medium text-slate-700">Notify module leader(s)</p>
            {moduleLeaderOptions.length === 0 ? (
              <p className="text-sm text-slate-500">No module leaders are available for notification.</p>
            ) : (
              <div className="space-y-2">
                {moduleLeaderOptions.map((leader) => (
                  <label
                    key={leader.id}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={reviewNotifyLeaderUserIds.includes(leader.id)}
                      onChange={(event) =>
                        setReviewNotifyLeaderUserIds((current) =>
                          event.target.checked
                            ? [...current, leader.id]
                            : current.filter((userId) => userId !== leader.id)
                        )
                      }
                    />
                    <span>{leader.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {activeReviewScript?.reviewFlag ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Current status:{" "}
              <span className="font-medium text-slate-900">
                {formatReviewFlagStatus(activeReviewScript.reviewFlag.status)}
              </span>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeReviewModal}>
              Cancel
            </Button>
            <Button onClick={handleReviewFlagSave} disabled={isPending || !reviewReason.trim()}>
              Save review flag
            </Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Import submissions"
        description="Paste the Turnitin page text and choose which submission window this batch belongs to."
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Submission window</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="radio"
                  name="submissionType"
                  checked={importSubmissionType === SubmissionType.FIRST_SUBMISSION}
                  onChange={() => setImportSubmissionType(SubmissionType.FIRST_SUBMISSION)}
                />
                <span className="text-sm font-medium text-slate-900">1st Submission</span>
              </label>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="radio"
                  name="submissionType"
                  checked={importSubmissionType === SubmissionType.SEVEN_DAY_WINDOW}
                  onChange={() => setImportSubmissionType(SubmissionType.SEVEN_DAY_WINDOW)}
                />
                <span className="text-sm font-medium text-slate-900">7-day window</span>
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="turnitin-text" className="text-sm font-medium text-slate-700">
              Turnitin page text
            </label>
            <textarea
              id="turnitin-text"
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportError(null);
              }}
              rows={10}
              className="w-full rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm outline-none ring-sky-500 focus:ring-2"
              placeholder="Paste the copied Turnitin list here..."
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Extracted</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{extractedIds.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Duplicates in paste</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{duplicateIdsInPaste.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Already in assessment</p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{existingDuplicateIds.length}</p>
            </div>
          </div>

          {duplicateIdsInPaste.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <p>Duplicate IDs in pasted text: {duplicateIdsInPaste.join(", ")}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={handleRemoveDuplicateEntries}>
                  Remove duplicate entries
                </Button>
                {existingDuplicateIds.length > 0 ? (
                  <Button type="button" variant="secondary" size="sm" onClick={handleKeepOnlyNewUniqueIds}>
                    Keep only new unique IDs
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {existingDuplicateIds.length > 0 ? (
            <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <p>These IDs already exist in this assessment: {existingDuplicateIds.join(", ")}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={handleRemoveExistingIds}>
                  Remove existing IDs
                </Button>
                {duplicateIdsInPaste.length > 0 ? (
                  <Button type="button" variant="secondary" size="sm" onClick={handleKeepOnlyNewUniqueIds}>
                    Keep only new unique IDs
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {importError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {importError}
            </div>
          ) : null}

          {extractedIds.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Preview: {extractedIds.slice(0, 12).join(", ")}
              {extractedIds.length > 12 ? "..." : ""}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowImportModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportSubmit} disabled={!canImport}>
              Import submissions
            </Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={showOpenAllModal}
        onClose={() => setShowOpenAllModal(false)}
        title="Open all submissions"
        description={`This will open ${scripts.length} browser tab${scripts.length === 1 ? "" : "s"}.`}
        widthClassName="max-w-lg"
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            This action is about to open {scripts.length} tabs. Are you sure you wish to continue?
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowOpenAllModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                openScriptsInTabs(scripts.map((script) => script.id));
                setShowOpenAllModal(false);
              }}
            >
              Open all
            </Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={showOpenMyAllocationModal}
        onClose={() => setShowOpenMyAllocationModal(false)}
        title="Open my allocation"
        description={`This will open ${myAllocatedScripts.length} browser tab${myAllocatedScripts.length === 1 ? "" : "s"} from your allocation.`}
        widthClassName="max-w-lg"
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            This action is about to open {myAllocatedScripts.length} tabs from your allocation. Are you sure you wish to
            continue?
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowOpenMyAllocationModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                openScriptsInTabs(myAllocatedScripts.map((script) => script.id));
                setShowOpenMyAllocationModal(false);
              }}
            >
              Open my allocation
            </Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={showModerationModal}
        onClose={() => setShowModerationModal(false)}
        title="View moderation"
        description={
          canSubmitModeration
            ? "Review the moderation status and add or update the moderation report."
            : "Only the assigned moderator can submit or update this report."
        }
      >
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Moderator</p>
              <p className="mt-2 font-medium text-slate-900">{moderation.moderatorName ?? "Not assigned"}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status</p>
              <p className="mt-2 font-medium text-slate-900">{moderation.statusLabel}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Completed</p>
              <p className="mt-2 font-medium text-slate-900">{moderation.completedAt ?? "Not completed yet"}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="radio"
                checked={moderationStatus === ModerationStatus.NO_ISSUES}
                onChange={() => setModerationStatus(ModerationStatus.NO_ISSUES)}
                disabled={!canSubmitModeration}
              />
              <span className="text-sm font-medium text-slate-900">No issues</span>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="radio"
                checked={moderationStatus === ModerationStatus.MINOR_ADJUSTMENTS_REQUIRED}
                onChange={() => setModerationStatus(ModerationStatus.MINOR_ADJUSTMENTS_REQUIRED)}
                disabled={!canSubmitModeration}
              />
              <span className="text-sm font-medium text-slate-900">Minor adjustments</span>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="radio"
                checked={moderationStatus === ModerationStatus.MAJOR_ISSUES}
                onChange={() => setModerationStatus(ModerationStatus.MAJOR_ISSUES)}
                disabled={!canSubmitModeration}
              />
              <span className="text-sm font-medium text-slate-900">Major issues</span>
            </label>
          </div>

          <div className="space-y-2">
            <label htmlFor="moderation-report" className="text-sm font-medium text-slate-700">
              Report
            </label>
            <textarea
              id="moderation-report"
              value={moderationReport}
              onChange={(event) => setModerationReport(event.target.value)}
              rows={8}
              className="w-full rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm outline-none ring-sky-500 focus:ring-2"
              placeholder={canSubmitModeration ? "Add the moderation summary here..." : "No moderation report has been added yet."}
              readOnly={!canSubmitModeration}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModerationModal(false)}>
              Close
            </Button>
            {canSubmitModeration ? (
              <Button onClick={handleModerationSubmit} disabled={!moderationReport.trim()}>
                {moderation.hasCompletedModeration ? "Update report" : "Save report"}
              </Button>
            ) : null}
          </div>
        </div>
      </ModalShell>

      {toast ? <FloatingToast message={toast.message} tone={toast.tone} /> : null}
    </div>
  );
}
