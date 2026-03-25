"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  LoaderCircle,
  ShieldAlert,
  Upload,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ModerationStatus, SubmissionType } from "@prisma/client";

import {
  autoAssignUnallocatedScriptsAction,
  importAssessmentSubmissionsAction,
  saveAssessmentModerationAction,
  saveScriptAllocationAction,
  saveScriptGradeAction,
  updateAssessmentSettingsAction,
} from "./actions";
import {
  buildTurnitinSubmissionUrl,
  extractTurnitinIds,
  findDuplicateIds,
  formatSubmissionType,
} from "@/lib/assessment-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FloatingToast } from "@/components/ui/floating-toast";
import { ModalShell } from "@/components/ui/modal-shell";
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
  hasIntegrityFlag: boolean;
  hasReviewFlag: boolean;
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
  dueAt: string;
  markingDeadlineAt: string;
  canManageAssessment: boolean;
  canSubmitModeration: boolean;
  markerOptions: UserPickerOption[];
  moderatorOptions: UserPickerOption[];
  opensAtInput: string;
  dueAtInput: string;
  markingDeadlineAtInput: string;
  currentModeratorUserId: string;
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

function formatGradeValue(grade: number | null): string {
  if (grade === null) {
    return "";
  }

  return Number.isInteger(grade) ? String(grade) : String(grade);
}

function areEqualGradeValues(left: string, right: string): boolean {
  return left.trim() === right.trim();
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

export function AssessmentWorkspaceClient({
  moduleId,
  assessmentId,
  moduleCode,
  assessmentName,
  academicYear,
  dueAt,
  markingDeadlineAt,
  canManageAssessment,
  canSubmitModeration,
  markerOptions,
  moderatorOptions,
  opensAtInput,
  dueAtInput,
  markingDeadlineAtInput,
  currentModeratorUserId,
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
  const [showModerationModal, setShowModerationModal] = useState(false);
  const [allocationDraft, setAllocationDraft] = useState<AllocationDraft>(null);
  const [allocationMarkerUserId, setAllocationMarkerUserId] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [importSubmissionType, setImportSubmissionType] = useState<SubmissionType>(SubmissionType.FIRST_SUBMISSION);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [settingsOpensAt, setSettingsOpensAt] = useState(opensAtInput);
  const [settingsDueAt, setSettingsDueAt] = useState(dueAtInput);
  const [settingsMarkingDeadlineAt, setSettingsMarkingDeadlineAt] = useState(markingDeadlineAtInput);
  const [settingsModeratorUserId, setSettingsModeratorUserId] = useState(currentModeratorUserId);
  const [moderationStatus, setModerationStatus] = useState<ModerationStatus>(
    moderationStatusFromLabel(initialModeration.statusLabel)
  );
  const [moderationReport, setModerationReport] = useState(initialModeration.report ?? "");

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
  const visibleScripts = viewMode === "my_allocation" ? myAllocatedScripts : scripts;
  const activeSelectedScriptIds = selectedScriptIds.filter((id) => scripts.some((script) => script.id === id));
  const visibleSelectedScriptIds = activeSelectedScriptIds.filter((id) =>
    visibleScripts.some((script) => script.id === id)
  );
  const totalScriptCount = scripts.length;
  const markedScriptCount = scripts.filter((script) => {
    const pendingGradeValue = gradeInputs[script.id];
    const effectiveValue = pendingGradeValue ?? formatGradeValue(script.grade);
    return effectiveValue.trim() !== "";
  }).length;
  const allSelected = visibleScripts.length > 0 && visibleSelectedScriptIds.length === visibleScripts.length;
  const remainingScripts = totalScriptCount - markedScriptCount;
  const progressPercentage = totalScriptCount === 0 ? 0 : Math.round((markedScriptCount / totalScriptCount) * 100);

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

  const showToast = (tone: "success" | "error", message: string) => {
    setToast({ tone, message });
  };

  const closeAllocationModal = () => {
    setAllocationDraft(null);
    setAllocationMarkerUserId("");
  };

  const resetAssessmentSettingsForm = () => {
    setSettingsOpensAt(opensAtInput);
    setSettingsDueAt(dueAtInput);
    setSettingsMarkingDeadlineAt(markingDeadlineAtInput);
    setSettingsModeratorUserId(currentModeratorUserId);
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

  const handleAutoAssign = () => {
    startTransition(async () => {
      const result = await autoAssignUnallocatedScriptsAction({
        moduleId,
        assessmentId,
      });

      if (!result.ok) {
        showToast("error", result.error);
        return;
      }

      showToast("success", result.message ?? "Submissions assigned.");
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
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {totalScriptCount} submissions
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">{remainingScripts} remaining</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">Due {dueAt}</span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                Marking deadline {markingDeadlineAt}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
                <Button variant="secondary" onClick={handleAutoAssign} disabled={isPending}>
                  {isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UsersRound className="h-4 w-4" />}
                  Auto-assign
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

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Marking Progress</CardTitle>
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
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl">Moderation</CardTitle>
              <p className="mt-1 text-sm text-slate-600">
                {moderation.moderatorName
                  ? `Assigned to ${moderation.moderatorName}`
                  : "No moderator assigned yet"}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setModerationStatus(moderationStatusFromLabel(moderation.statusLabel));
                setModerationReport(moderation.report ?? "");
                setShowModerationModal(true);
              }}
              disabled={!canSubmitModeration}
            >
              Moderation report
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>
              Status: <span className="font-medium text-slate-900">{moderation.statusLabel}</span>
            </p>
            <p>Completed: {moderation.completedAt ?? "Not completed yet"}</p>
            {moderation.report ? <p className="line-clamp-3 text-slate-500">{moderation.report}</p> : null}
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-slate-200/80">
          <CardTitle className="text-xl">Submissions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {visibleScripts.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              {viewMode === "my_allocation"
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
                          {script.hasReviewFlag ? (
                            <span title="Flagged for review" className="text-amber-600">
                              <AlertTriangle className="h-4 w-4" />
                            </span>
                          ) : null}
                          {script.hasIntegrityFlag ? (
                            <span title="Integrity flag present" className="text-rose-600">
                              <ShieldAlert className="h-4 w-4" />
                            </span>
                          ) : null}
                          {!script.hasReviewFlag && !script.hasIntegrityFlag ? (
                            <span className="text-slate-300">—</span>
                          ) : null}
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
        description="Update the assessment dates and assigned moderator."
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="edit-opens-at" className="text-sm font-medium text-slate-700">
                Opens at
              </label>
              <input
                id="edit-opens-at"
                type="datetime-local"
                value={settingsOpensAt}
                onChange={(event) => setSettingsOpensAt(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
              />
            </div>
            <UserPicker
              options={moderatorOptions}
              value={settingsModeratorUserId}
              onValueChange={setSettingsModeratorUserId}
              label="Assigned moderator"
              placeholder="Search for a module member"
            />
          </div>

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
                    opensAt: settingsOpensAt,
                    dueAt: settingsDueAt,
                    markingDeadlineAt: settingsMarkingDeadlineAt,
                    moderatorUserId: settingsModeratorUserId,
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
        title="Moderation report"
        description="Only the assigned moderator can submit or update this report."
      >
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="radio"
                checked={moderationStatus === ModerationStatus.NO_ISSUES}
                onChange={() => setModerationStatus(ModerationStatus.NO_ISSUES)}
              />
              <span className="text-sm font-medium text-slate-900">No issues</span>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="radio"
                checked={moderationStatus === ModerationStatus.MINOR_ADJUSTMENTS_REQUIRED}
                onChange={() => setModerationStatus(ModerationStatus.MINOR_ADJUSTMENTS_REQUIRED)}
              />
              <span className="text-sm font-medium text-slate-900">Minor adjustments</span>
            </label>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="radio"
                checked={moderationStatus === ModerationStatus.MAJOR_ISSUES}
                onChange={() => setModerationStatus(ModerationStatus.MAJOR_ISSUES)}
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
              placeholder="Add the moderation summary here..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowModerationModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleModerationSubmit} disabled={!canSubmitModeration || !moderationReport.trim()}>
              {moderation.hasCompletedModeration ? "Update report" : "Save report"}
            </Button>
          </div>
        </div>
      </ModalShell>

      {toast ? <FloatingToast message={toast.message} tone={toast.tone} /> : null}
    </div>
  );
}
