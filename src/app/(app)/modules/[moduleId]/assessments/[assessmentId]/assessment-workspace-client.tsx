"use client";

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, ArrowUpRight, Flag, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { ReviewFlagStatus } from "@prisma/client";

import {
  saveReviewFlagAction,
  saveScriptAllocationAction,
  saveScriptGradeAction,
} from "./actions";
import type { AssessmentSubmissionsSectionProps, ScriptRow } from "./assessment-workspace-types";
import {
  buildTurnitinSubmissionUrl,
  formatReviewFlagStatus,
  formatSubmissionType,
  isReviewFlagResolved,
} from "@/lib/assessment-utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FloatingToast } from "@/components/ui/floating-toast";
import { PendingNotice } from "@/components/ui/loading-state";
import { ModalShell } from "@/components/ui/modal-shell";
import { UserPicker } from "@/components/ui/user-picker";

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

const SCRIPT_PAGE_SIZE = 100;

function formatGradeValue(grade: number | null): string {
  if (grade === null) {
    return "";
  }

  return String(grade);
}

function areEqualGradeValues(left: string, right: string): boolean {
  return left.trim() === right.trim();
}

function isScriptMarked(script: ScriptRow, gradeInputs: Record<string, string>): boolean {
  const pendingGradeValue = gradeInputs[script.id];
  const effectiveValue = pendingGradeValue ?? formatGradeValue(script.grade);
  return effectiveValue.trim() !== "";
}

function compareNullableText(left: string | null, right: string | null): number {
  return (left ?? "").localeCompare(right ?? "");
}

function buildGradeInputMap(scripts: ScriptRow[]): Record<string, string> {
  return Object.fromEntries(scripts.map((script) => [script.id, formatGradeValue(script.grade)]));
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

function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-slate-200/90 ${className}`} />;
}

export function AssessmentSubmissionsSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-4 border-b border-slate-200/80 lg:flex-row lg:items-start lg:justify-between">
        <SkeletonBar className="h-7 w-40" />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SkeletonBar className="h-10 w-48 rounded-2xl" />
          <SkeletonBar className="h-10 w-28 rounded-2xl" />
          <SkeletonBar className="h-10 w-36 rounded-2xl" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 xl:grid-cols-[1.2fr_repeat(4,minmax(0,0.8fr))]">
          <SkeletonBar className="h-12 w-full rounded-2xl" />
          <SkeletonBar className="h-12 w-full rounded-2xl" />
          <SkeletonBar className="h-12 w-full rounded-2xl" />
          <SkeletonBar className="h-12 w-full rounded-2xl" />
          <SkeletonBar className="h-12 w-full rounded-2xl" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SkeletonBar className="h-4 w-64" />
          <div className="flex gap-2">
            <SkeletonBar className="h-10 w-44 rounded-2xl" />
            <SkeletonBar className="h-10 w-28 rounded-2xl" />
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="grid grid-cols-[40px_1fr_1fr_160px_120px_100px] gap-3 rounded-2xl border border-slate-200/80 px-4 py-3"
            >
              <SkeletonBar className="h-5 w-5" />
              <SkeletonBar className="h-5 w-28" />
              <SkeletonBar className="h-5 w-36" />
              <SkeletonBar className="h-5 w-28" />
              <SkeletonBar className="h-10 w-24 rounded-xl" />
              <SkeletonBar className="h-9 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function AssessmentSubmissionsSection({
  moduleId,
  assessmentId,
  isArchived,
  canManageAssessment,
  markerOptions,
  moduleLeaderOptions,
  scripts: initialScripts,
}: AssessmentSubmissionsSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const scripts = initialScripts;
  const [selectedScriptIds, setSelectedScriptIds] = useState<string[]>([]);
  const [gradeInputs, setGradeInputs] = useState<Record<string, string>>(() => buildGradeInputMap(initialScripts));
  const [toast, setToast] = useState<ToastState>(null);
  const [showOpenAllModal, setShowOpenAllModal] = useState(false);
  const [showOpenMyAllocationModal, setShowOpenMyAllocationModal] = useState(false);
  const [allocationDraft, setAllocationDraft] = useState<AllocationDraft>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft>(null);
  const [allocationMarkerUserId, setAllocationMarkerUserId] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [markerFilterUserId, setMarkerFilterUserId] = useState("");
  const [submissionTypeFilter, setSubmissionTypeFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [flagFilter, setFlagFilter] = useState<FlagFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("script_asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [reviewStatus, setReviewStatus] = useState<ReviewFlagStatus>(ReviewFlagStatus.FLAGGED);
  const [reviewReason, setReviewReason] = useState("");
  const [reviewOutcomeNotes, setReviewOutcomeNotes] = useState("");
  const [reviewNotifyLeaderUserIds, setReviewNotifyLeaderUserIds] = useState<string[]>([]);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedDeferredSearchQuery = deferredSearchQuery.trim().toLowerCase();
  const isSearchPending = deferredSearchQuery !== searchQuery;

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToast(null);
    }, 2200);

    return () => window.clearTimeout(timeout);
  }, [toast]);

  const scriptsById = useMemo(() => new Map(scripts.map((script) => [script.id, script])), [scripts]);
  const scriptIdSet = useMemo(() => new Set(scripts.map((script) => script.id)), [scripts]);
  const myAllocatedScripts = useMemo(() => scripts.filter((script) => script.assignedToCurrentUser), [scripts]);
  const myAllocatedScriptIdSet = useMemo(
    () => new Set(myAllocatedScripts.map((script) => script.id)),
    [myAllocatedScripts]
  );
  const filteredScripts = useMemo(() => {
    const baseScripts = viewMode === "my_allocation" ? myAllocatedScripts : scripts;

    const nextScripts = baseScripts.filter((script) => {
      const matchesSearch =
        normalizedDeferredSearchQuery.length === 0 ||
        script.turnitinId.toLowerCase().includes(normalizedDeferredSearchQuery) ||
        (script.markerName ?? "").toLowerCase().includes(normalizedDeferredSearchQuery);

      const matchesMarker = !markerFilterUserId || script.markerUserId === markerFilterUserId;
      const matchesSubmissionType = !submissionTypeFilter || script.submissionType === submissionTypeFilter;
      const matchesGrade =
        gradeFilter === "all" ||
        (gradeFilter === "graded"
          ? isScriptMarked(script, gradeInputs)
          : !isScriptMarked(script, gradeInputs));
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
    gradeInputs,
    markerFilterUserId,
    myAllocatedScripts,
    normalizedDeferredSearchQuery,
    scripts,
    sortOption,
    submissionTypeFilter,
    viewMode,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredScripts.length / SCRIPT_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const visibleScripts = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * SCRIPT_PAGE_SIZE;
    return filteredScripts.slice(startIndex, startIndex + SCRIPT_PAGE_SIZE);
  }, [filteredScripts, safeCurrentPage]);

  const visibleRangeStart = filteredScripts.length === 0 ? 0 : (safeCurrentPage - 1) * SCRIPT_PAGE_SIZE + 1;
  const visibleRangeEnd = visibleRangeStart === 0 ? 0 : visibleRangeStart + visibleScripts.length - 1;
  const filteredScriptIdSet = useMemo(() => new Set(filteredScripts.map((script) => script.id)), [filteredScripts]);
  const visibleScriptIdSet = useMemo(() => new Set(visibleScripts.map((script) => script.id)), [visibleScripts]);
  const activeSelectedScriptIds = useMemo(
    () => selectedScriptIds.filter((id) => scriptIdSet.has(id)),
    [scriptIdSet, selectedScriptIds]
  );
  const filteredSelectedScriptIds = useMemo(
    () => activeSelectedScriptIds.filter((id) => filteredScriptIdSet.has(id)),
    [activeSelectedScriptIds, filteredScriptIdSet]
  );
  const visibleSelectedScriptIds = useMemo(
    () => activeSelectedScriptIds.filter((id) => visibleScriptIdSet.has(id)),
    [activeSelectedScriptIds, visibleScriptIdSet]
  );
  const activeReviewScript = reviewDraft ? scriptsById.get(reviewDraft.scriptId) ?? null : null;
  const allSelected = visibleScripts.length > 0 && visibleSelectedScriptIds.length === visibleScripts.length;

  const showToast = (tone: "success" | "error", message: string) => {
    setToast({ tone, message });
  };

  const closeAllocationModal = () => {
    setAllocationDraft(null);
    setAllocationMarkerUserId("");
  };

  const closeReviewModal = () => {
    setReviewDraft(null);
    setReviewStatus(ReviewFlagStatus.FLAGGED);
    setReviewReason("");
    setReviewOutcomeNotes("");
    setReviewNotifyLeaderUserIds([]);
  };

  const handleViewModeChange = (nextViewMode: ViewMode) => {
    setViewMode(nextViewMode);
    setCurrentPage(1);

    if (nextViewMode === "all") {
      return;
    }

    setSelectedScriptIds((current) => current.filter((id) => myAllocatedScriptIdSet.has(id)));
  };

  const toggleSelectAll = () => {
    setSelectedScriptIds(
      allSelected
        ? activeSelectedScriptIds.filter((id) => !visibleScriptIdSet.has(id))
        : Array.from(new Set([...activeSelectedScriptIds, ...visibleScripts.map((script) => script.id)]))
    );
  };

  const toggleScriptSelection = (scriptId: string) => {
    setSelectedScriptIds((current) =>
      current.includes(scriptId) ? current.filter((id) => id !== scriptId) : [...current, scriptId]
    );
  };

  const openScriptsInTabs = (scriptIds: string[]) => {
    const selectedScripts = scriptIds
      .map((scriptId) => scriptsById.get(scriptId))
      .filter((script): script is ScriptRow => Boolean(script));

    for (const script of selectedScripts) {
      window.open(buildTurnitinSubmissionUrl(script.turnitinId), "_blank", "noopener,noreferrer");
    }
  };

  const handleGradeBlur = (scriptId: string) => {
    const script = scriptsById.get(scriptId);

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

  return (
    <>
      <PendingNotice
        show={isPending}
        title="Updating submissions"
        description="Saving grades, allocations, or review flags and refreshing the submissions list."
      />

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
            {filteredSelectedScriptIds.length > 0 ? (
              <Button variant="secondary" onClick={() => openScriptsInTabs(filteredSelectedScriptIds)}>
                Open selected ({filteredSelectedScriptIds.length})
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
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search script ID or marker"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
            />
            <select
              value={markerFilterUserId}
              onChange={(event) => {
                setMarkerFilterUserId(event.target.value);
                setCurrentPage(1);
              }}
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
              onChange={(event) => {
                setSubmissionTypeFilter(event.target.value);
                setCurrentPage(1);
              }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
            >
              <option value="">All submission types</option>
              <option value="FIRST_SUBMISSION">1st Submission</option>
              <option value="SEVEN_DAY_WINDOW">7-day</option>
            </select>
            <select
              value={gradeFilter}
              onChange={(event) => {
                setGradeFilter(event.target.value as GradeFilter);
                setCurrentPage(1);
              }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
            >
              <option value="all">All grades</option>
              <option value="graded">Graded</option>
              <option value="ungraded">Ungraded</option>
            </select>
            <select
              value={flagFilter}
              onChange={(event) => {
                setFlagFilter(event.target.value as FlagFilter);
                setCurrentPage(1);
              }}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
            >
              <option value="all">All flags</option>
              <option value="needs_attention">Flagged or under review</option>
              <option value="resolved">Resolved flags</option>
              <option value="unflagged">No flag</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
              <p>
                {filteredScripts.length} of {viewMode === "my_allocation" ? myAllocatedScripts.length : scripts.length}{" "}
                scripts match this view
              </p>
              {filteredScripts.length > 0 ? (
                <p>
                  Showing {visibleRangeStart}-{visibleRangeEnd}
                </p>
              ) : null}
              {isSearchPending ? (
                <span className="inline-flex items-center gap-2 text-slate-400">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Updating list
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={sortOption}
                onChange={(event) => {
                  setSortOption(event.target.value as SortOption);
                  setCurrentPage(1);
                }}
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
                  setCurrentPage(1);
                }}
              >
                Reset filters
              </Button>
            </div>
          </div>

          {filteredScripts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center text-sm text-slate-500">
              {searchQuery || markerFilterUserId || submissionTypeFilter || gradeFilter !== "all" || flagFilter !== "all"
                ? "No scripts match the current filters."
                : viewMode === "my_allocation"
                  ? "No scripts are currently assigned to you."
                  : "No submissions yet. Use Import Submissions to add the Turnitin IDs for this assessment."}
            </div>
          ) : (
            <>
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
              {filteredScripts.length > SCRIPT_PAGE_SIZE ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-4">
                  <p className="text-sm text-slate-500">
                    Page {safeCurrentPage} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={safeCurrentPage === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={safeCurrentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

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
        open={showOpenAllModal}
        onClose={() => setShowOpenAllModal(false)}
        title="Open all submissions"
        description={`This will open ${scripts.length} browser tab${scripts.length === 1 ? "" : "s"}.`}
        widthClassName="max-w-lg"
      >
        <div className="space-y-5">
          <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <p>
              Note: You must first <span className="font-semibold italic">manually</span> open one script directly within
              the Turnitin hand-in box, otherwise bulk opening here will fail.
            </p>
            <p>
              If you are unable to open multiple URLs, please check your browser settings. Most modern browsers have a
              built-in pop-up blocker that may prevent multiple tabs from opening at once. You can usually find this
              setting in the browser&apos;s privacy or security settings.
            </p>
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
          <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <p>
              Note: You must first <span className="font-semibold italic">manually</span> open one script directly within
              the Turnitin hand-in box, otherwise bulk opening here will fail.
            </p>
            <p>
              If you are unable to open multiple URLs, please check your browser settings. Most modern browsers have a
              built-in pop-up blocker that may prevent multiple tabs from opening at once. You can usually find this
              setting in the browser&apos;s privacy or security settings.
            </p>
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

      {toast ? <FloatingToast message={toast.message} tone={toast.tone} /> : null}
    </>
  );
}
