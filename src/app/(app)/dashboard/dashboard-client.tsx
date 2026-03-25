"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { Clock3, Plus, Rows3, Search, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createModuleAction } from "./actions";
import { AsyncUserPicker } from "@/components/ui/async-user-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ModalShell } from "@/components/ui/modal-shell";
import type { UserPickerOption } from "@/components/ui/user-picker";

type ModuleSummary = {
  id: string;
  code: string;
  title: string;
  assessments: number;
  totalScripts: number;
  markedScripts: number;
  remainingScripts: number;
  myAllocatedScripts: number;
  myMarkedScripts: number;
  nextDeadline: string;
  progressPercentage: number;
  leaderSummary: string;
  currentUserIsLeader: boolean;
  currentUserIsModerator: boolean;
  moderatedAssessments: number;
};

type DashboardClientProps = {
  currentUserId: string;
  isAdmin: boolean;
  modules: ModuleSummary[];
  currentUserOption: UserPickerOption;
};

type Feedback = {
  tone: "success" | "error";
  message: string;
} | null;

function getAllocationProgressPercentage(marked: number, allocated: number): number {
  return allocated === 0 ? 0 : Math.round((marked / allocated) * 100);
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  if (!feedback) {
    return null;
  }

  return (
    <div
      className={
        feedback.tone === "error"
          ? "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          : "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
      }
    >
      {feedback.message}
    </div>
  );
}

export function DashboardClient({ currentUserId, isAdmin, modules, currentUserOption }: DashboardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showCreateModuleModal, setShowCreateModuleModal] = useState(false);
  const [moduleCode, setModuleCode] = useState("");
  const [moduleTitle, setModuleTitle] = useState("");
  const [moduleSearchQuery, setModuleSearchQuery] = useState("");
  const [leaderPickerValue, setLeaderPickerValue] = useState(currentUserId);
  const [selectedLeaderIds, setSelectedLeaderIds] = useState<string[]>([currentUserId]);
  const [knownLeaderOptions, setKnownLeaderOptions] = useState<UserPickerOption[]>([currentUserOption]);
  const deferredModuleSearchQuery = useDeferredValue(moduleSearchQuery);

  const selectedLeaders = selectedLeaderIds
    .map((leaderId) => knownLeaderOptions.find((user) => user.id === leaderId))
    .filter(Boolean) as UserPickerOption[];

  const selectedLeaderSet = useMemo(() => new Set(selectedLeaderIds), [selectedLeaderIds]);
  const filteredModules = useMemo(() => {
    const normalizedQuery = deferredModuleSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return modules;
    }

    return modules.filter((module) =>
      [module.code, module.title, module.leaderSummary].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    );
  }, [deferredModuleSearchQuery, modules]);

  const resetCreateModuleForm = () => {
    setModuleCode("");
    setModuleTitle("");
    setLeaderPickerValue(currentUserId);
    setSelectedLeaderIds([currentUserId]);
    setKnownLeaderOptions([currentUserOption]);
  };

  const addLeader = () => {
    if (!leaderPickerValue || selectedLeaderSet.has(leaderPickerValue)) {
      return;
    }

    setSelectedLeaderIds((current) => [...current, leaderPickerValue]);
    setLeaderPickerValue("");
  };

  const removeLeader = (leaderId: string) => {
    setSelectedLeaderIds((current) => current.filter((id) => id !== leaderId));
  };

  const handleCreateModule = () => {
    startTransition(async () => {
      const result = await createModuleAction({
        code: moduleCode,
        title: moduleTitle,
        leaderUserIds: selectedLeaderIds,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setShowCreateModuleModal(false);
      resetCreateModuleForm();
      setFeedback({ tone: "success", message: result.message ?? "Module created." });
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="relative block w-full max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={moduleSearchQuery}
            onChange={(event) => setModuleSearchQuery(event.target.value)}
            aria-label="Search modules"
            placeholder="Search modules by code, title, or leader"
            className="w-full rounded-2xl border border-slate-200 bg-white/85 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none ring-sky-500 focus:ring-2"
          />
        </label>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" asChild>
            <Link href="/dashboard/timeline">
              <Rows3 className="h-4 w-4" />
              View timeline
            </Link>
          </Button>
          {isAdmin ? (
            <Button variant="secondary" asChild>
              <Link href="/admin">
                <ShieldCheck className="h-4 w-4" />
                Admin
              </Link>
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => {
              resetCreateModuleForm();
              setShowCreateModuleModal(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Create module
          </Button>
        </div>
      </div>

      <FeedbackMessage feedback={feedback} />

      <section id="modules" className="space-y-4">
        {modules.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-sm text-slate-600">
              No modules assigned yet. Create a module or wait to be added to one.
            </CardContent>
          </Card>
        ) : filteredModules.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-sm text-slate-600">
              No modules match <span className="font-medium text-slate-900">{moduleSearchQuery.trim()}</span>.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
            {filteredModules.map((module) => {
              const myProgressPercentage = getAllocationProgressPercentage(
                module.myMarkedScripts,
                module.myAllocatedScripts
              );

              return (
                <Link
                  key={module.id}
                  href={`/modules/${module.id}`}
                  className="group rounded-[24px] border border-white/70 bg-white/85 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-sky-200"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        {module.code}
                      </p>
                      <h3 className="mt-1 line-clamp-2 text-[1.35rem] font-semibold leading-tight tracking-tight text-slate-950">
                        {module.title}
                      </h3>
                      <p className="mt-1 line-clamp-1 text-sm text-slate-600">{module.leaderSummary}</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {module.currentUserIsLeader ? (
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-medium text-sky-800">
                          Module leader
                        </span>
                      ) : null}
                      {module.currentUserIsModerator ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                          Moderator on {module.moderatedAssessments}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 grid items-stretch gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)_minmax(0,0.9fr)]">
                    <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Overall Marking Progress
                      </p>
                      <div className="mt-2 flex items-baseline justify-between gap-3">
                        <p className="text-xl font-semibold tracking-tight text-slate-950">
                          {module.markedScripts}/{module.totalScripts}
                        </p>
                        <p className="text-xs font-medium text-slate-500">{module.progressPercentage}%</p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/70">
                        <div
                          className="h-full rounded-full bg-sky-600 transition-[width]"
                          style={{ width: `${module.progressPercentage}%` }}
                        />
                      </div>
                      <p className="mt-2 text-sm text-slate-500">{module.remainingScripts} remaining</p>
                    </div>

                    <div className="min-w-0 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Your Allocation Progress
                      </p>
                      {module.myAllocatedScripts > 0 ? (
                        <>
                          <div className="mt-2 flex items-baseline justify-between gap-3">
                            <p className="text-xl font-semibold tracking-tight text-slate-950">
                              {module.myMarkedScripts}/{module.myAllocatedScripts}
                            </p>
                            <p className="text-xs font-medium text-slate-500">{myProgressPercentage}%</p>
                          </div>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/70">
                            <div
                              className="h-full rounded-full bg-emerald-600 transition-[width]"
                              style={{ width: `${myProgressPercentage}%` }}
                            />
                          </div>
                          <p className="mt-2 text-sm text-slate-500">
                            {module.myAllocatedScripts - module.myMarkedScripts} still on your list
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-slate-500">No scripts allocated to you.</p>
                      )}
                    </div>

                    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Next Deadline
                      </p>
                      <div className="mt-2 flex items-start gap-3 text-sm text-slate-600">
                        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 2xl:hidden" />
                        <div className="min-w-0 space-y-1 text-sm leading-snug text-slate-600">
                          <p className="break-words">{module.nextDeadline}</p>
                          <p className="break-words">{module.assessments} assessments</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <ModalShell
        open={showCreateModuleModal}
        onClose={() => setShowCreateModuleModal(false)}
        title="Create module"
        description="Create the module and assign one or more module leaders."
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="module-code" className="text-sm font-medium text-slate-700">
                Module code
              </label>
              <input
                id="module-code"
                value={moduleCode}
                onChange={(event) => setModuleCode(event.target.value.toUpperCase())}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
                placeholder="PSY-401"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="module-title" className="text-sm font-medium text-slate-700">
                Module title
              </label>
              <input
                id="module-title"
                value={moduleTitle}
                onChange={(event) => setModuleTitle(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
                placeholder="Advanced Research Methods"
              />
            </div>
          </div>

          <div className="space-y-3">
            <AsyncUserPicker
              value={leaderPickerValue}
              onValueChange={setLeaderPickerValue}
              selectedOption={knownLeaderOptions.find((leader) => leader.id === leaderPickerValue) ?? null}
              initialOptions={knownLeaderOptions}
              onSelectionResolve={(option) => {
                if (!option) {
                  return;
                }

                setKnownLeaderOptions((current) => {
                  if (current.some((leader) => leader.id === option.id)) {
                    return current;
                  }

                  return [...current, option];
                });
              }}
              label="Module leaders"
              placeholder="Search for a user to add as a leader"
            />

            <div className="flex justify-end">
              <Button type="button" variant="secondary" size="sm" onClick={addLeader} disabled={!leaderPickerValue}>
                Add leader
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedLeaders.map((leader) => (
                <span
                  key={leader.id}
                  className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-900"
                >
                  {leader.name}
                  <button
                    type="button"
                    onClick={() => removeLeader(leader.id)}
                    disabled={selectedLeaderIds.length === 1}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-sky-700 transition hover:bg-white/70 disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowCreateModuleModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateModule}
              disabled={isPending || !moduleCode.trim() || !moduleTitle.trim() || selectedLeaderIds.length === 0}
            >
              Create module
            </Button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
