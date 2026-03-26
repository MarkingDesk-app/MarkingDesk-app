"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { LoaderCircle, Upload, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ModerationStatus, SubmissionType } from "@prisma/client";

import {
  assignAllocationsAction,
  importAssessmentSubmissionsAction,
  saveAssessmentModerationAction,
  updateAssessmentSettingsAction,
} from "./actions";
import type { AssessmentWorkspaceShellProps } from "./assessment-workspace-types";
import { extractTurnitinIds, findDuplicateIds } from "@/lib/assessment-utils";
import { AsyncUserMultiPicker } from "@/components/ui/async-user-multi-picker";
import { AsyncUserPicker } from "@/components/ui/async-user-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FloatingToast } from "@/components/ui/floating-toast";
import { PendingNotice } from "@/components/ui/loading-state";
import { ModalShell } from "@/components/ui/modal-shell";
import type { UserPickerOption } from "@/components/ui/user-picker";

type ToastState = {
  tone: "success" | "error";
  message: string;
} | null;

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

export function AssessmentWorkspaceShell({
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
  canViewMarkerProgress,
  markerOptions,
  markerProgress,
  currentModeratorOption,
  dueAtInput,
  markingDeadlineAtInput,
  currentModeratorUserId,
  currentMarkerUserIds,
  existingTurnitinIds,
  totalScriptCount,
  markedScriptCount,
  myAllocatedScriptCount,
  myMarkedScriptCount,
  moderation,
  children,
}: AssessmentWorkspaceShellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<ToastState>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showEditAssessmentModal, setShowEditAssessmentModal] = useState(false);
  const [showAssignAllocationsModal, setShowAssignAllocationsModal] = useState(false);
  const [showMarkerProgressModal, setShowMarkerProgressModal] = useState(false);
  const [showModerationModal, setShowModerationModal] = useState(false);
  const [allocationCounts, setAllocationCounts] = useState<Record<string, string>>({});
  const [importSubmissionType, setImportSubmissionType] = useState<SubmissionType>(SubmissionType.FIRST_SUBMISSION);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [settingsDueAt, setSettingsDueAt] = useState(dueAtInput);
  const [settingsMarkingDeadlineAt, setSettingsMarkingDeadlineAt] = useState(markingDeadlineAtInput);
  const [settingsModeratorUserId, setSettingsModeratorUserId] = useState(currentModeratorUserId);
  const [settingsMarkerUserIds, setSettingsMarkerUserIds] = useState(currentMarkerUserIds);
  const [moderationStatus, setModerationStatus] = useState<ModerationStatus>(
    moderationStatusFromLabel(moderation.statusLabel)
  );
  const [moderationReport, setModerationReport] = useState(moderation.report ?? "");

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    setSettingsDueAt(dueAtInput);
  }, [dueAtInput]);

  useEffect(() => {
    setSettingsMarkingDeadlineAt(markingDeadlineAtInput);
  }, [markingDeadlineAtInput]);

  useEffect(() => {
    setSettingsModeratorUserId(currentModeratorUserId);
  }, [currentModeratorUserId]);

  useEffect(() => {
    setSettingsMarkerUserIds(currentMarkerUserIds);
  }, [currentMarkerUserIds]);

  useEffect(() => {
    setModerationStatus(moderationStatusFromLabel(moderation.statusLabel));
  }, [moderation.statusLabel]);

  useEffect(() => {
    setModerationReport(moderation.report ?? "");
  }, [moderation.report]);

  const remainingScripts = totalScriptCount - markedScriptCount;
  const myRemainingScripts = myAllocatedScriptCount - myMarkedScriptCount;
  const progressPercentage = totalScriptCount === 0 ? 0 : Math.round((markedScriptCount / totalScriptCount) * 100);
  const myProgressPercentage =
    myAllocatedScriptCount === 0 ? 0 : Math.round((myMarkedScriptCount / myAllocatedScriptCount) * 100);
  const extractedIds = useMemo(() => extractTurnitinIds(importText), [importText]);
  const duplicateIdsInPaste = useMemo(() => findDuplicateIds(extractedIds), [extractedIds]);
  const existingTurnitinIdSet = useMemo(() => new Set(existingTurnitinIds), [existingTurnitinIds]);
  const existingDuplicateIds = useMemo(
    () =>
      Array.from(new Set(extractedIds.filter((turnitinId) => existingTurnitinIdSet.has(turnitinId)))).sort((left, right) =>
        left.localeCompare(right)
      ),
    [existingTurnitinIdSet, extractedIds]
  );
  const canImport =
    extractedIds.length > 0 && duplicateIdsInPaste.length === 0 && existingDuplicateIds.length === 0 && !isPending;
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

  const showToast = (tone: "success" | "error", message: string) => {
    setToast({ tone, message });
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

      setShowAssignAllocationsModal(false);
      showToast("success", result.message ?? "Allocations assigned.");
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
      <PendingNotice
        show={isPending}
        title="Updating assessment"
        description="Saving changes and refreshing allocation, grading, or moderation data."
      />

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
            <Button variant="secondary" asChild>
              <Link href={`/modules/${moduleId}/assessments/${assessmentId}/distribution`}>View distribution</Link>
            </Button>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">{remainingScripts} submissions still need grades.</p>
              {canViewMarkerProgress ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowMarkerProgressModal(true)}
                  disabled={markerProgress.length === 0}
                >
                  <UsersRound className="h-4 w-4" />
                  {markerProgress.length > 0 ? "Marker progress" : "No marker allocations yet"}
                </Button>
              ) : null}
            </div>
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

      {children}

      <ModalShell
        open={showMarkerProgressModal}
        onClose={() => setShowMarkerProgressModal(false)}
        title="Marker progress"
        description="Allocated scripts only. Progress is based on saved marks."
        widthClassName="max-w-xl"
      >
        {markerProgress.length > 0 ? (
          <div className="space-y-3">
            {markerProgress.map((marker) => (
              <div key={marker.markerId} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{marker.markerName}</p>
                    <p className="text-sm text-slate-500">
                      {marker.markedScripts}/{marker.allocatedScripts} marked
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{marker.progressPercentage}%</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    className="h-full rounded-full bg-sky-600 transition-[width]"
                    style={{ width: `${marker.progressPercentage}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-slate-500">{marker.remainingScripts} remaining</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
            No allocated markers to show yet.
          </p>
        )}
      </ModalShell>

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
            <AsyncUserPicker
              value={settingsModeratorUserId}
              onValueChange={setSettingsModeratorUserId}
              selectedOption={currentModeratorOption?.id === settingsModeratorUserId ? currentModeratorOption : null}
              initialOptions={currentModeratorOption ? [currentModeratorOption] : []}
              label="Assigned moderator"
              placeholder="Search for a user"
            />
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <AsyncUserMultiPicker
              value={settingsMarkerUserIds}
              onValueChange={setSettingsMarkerUserIds}
              selectedOptions={markerOptions}
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
        open={showAssignAllocationsModal}
        onClose={() => setShowAssignAllocationsModal(false)}
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
                <Button variant="secondary" onClick={() => setShowAssignAllocationsModal(false)}>
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
