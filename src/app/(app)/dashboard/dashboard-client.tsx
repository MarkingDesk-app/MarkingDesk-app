"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowRight, Clock3, Plus, Rows3, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createModuleAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ModalShell } from "@/components/ui/modal-shell";
import { UserPicker, type UserPickerOption } from "@/components/ui/user-picker";

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
};

type DashboardClientProps = {
  currentUserId: string;
  modules: ModuleSummary[];
  allUsers: UserPickerOption[];
};

type Feedback = {
  tone: "success" | "error";
  message: string;
} | null;

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

export function DashboardClient({ currentUserId, modules, allUsers }: DashboardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showCreateModuleModal, setShowCreateModuleModal] = useState(false);
  const [moduleCode, setModuleCode] = useState("");
  const [moduleTitle, setModuleTitle] = useState("");
  const [leaderPickerValue, setLeaderPickerValue] = useState(currentUserId);
  const [selectedLeaderIds, setSelectedLeaderIds] = useState<string[]>([currentUserId]);

  const selectedLeaders = selectedLeaderIds
    .map((leaderId) => allUsers.find((user) => user.id === leaderId))
    .filter(Boolean) as UserPickerOption[];

  const selectedLeaderSet = useMemo(() => new Set(selectedLeaderIds), [selectedLeaderIds]);

  const resetCreateModuleForm = () => {
    setModuleCode("");
    setModuleTitle("");
    setLeaderPickerValue(currentUserId);
    setSelectedLeaderIds([currentUserId]);
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
      <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Your modules</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" asChild>
              <Link href="/dashboard/timeline">
                <Rows3 className="h-4 w-4" />
                View timeline
              </Link>
            </Button>
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

        <div className="mt-5">
          <FeedbackMessage feedback={feedback} />
        </div>
      </section>

      <section id="modules" className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Modules</h2>
          <p className="mt-1 text-sm text-slate-600">Progress and upcoming deadlines across your active modules.</p>
        </div>

        {modules.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-sm text-slate-600">
              No modules assigned yet. Create a module or wait to be added to one.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {modules.map((module) => (
              <Link
                key={module.id}
                href={`/modules/${module.id}`}
                className="group rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-sky-200"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{module.code}</p>
                    <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{module.title}</h3>
                  </div>
                  {module.currentUserIsLeader ? (
                    <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800">
                      Module leader
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 text-sm text-slate-600">{module.leaderSummary}</p>

                <div className="mt-5 grid gap-4">
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Overall Marking Progress
                    </p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                      {module.markedScripts}/{module.totalScripts} completed
                    </p>
                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200/70">
                      <div
                        className="h-full rounded-full bg-sky-600 transition-[width]"
                        style={{ width: `${module.progressPercentage}%` }}
                      />
                    </div>
                    <p className="mt-3 text-sm text-slate-500">{module.remainingScripts} submissions remaining</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[1fr_0.9fr]">
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        Your Allocation Progress
                      </p>
                      {module.myAllocatedScripts > 0 ? (
                        <>
                          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                            {module.myMarkedScripts}/{module.myAllocatedScripts} marked
                          </p>
                          <p className="mt-3 text-sm text-slate-500">
                            {module.myAllocatedScripts - module.myMarkedScripts} still on your list
                          </p>
                        </>
                      ) : (
                        <p className="mt-3 text-sm text-slate-500">No scripts allocated to you.</p>
                      )}
                    </div>

                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Next Deadline</p>
                      <div className="mt-3 flex items-start gap-3">
                        <Clock3 className="mt-0.5 h-4 w-4 text-sky-600" />
                        <div className="space-y-2 text-sm text-slate-600">
                          <p>{module.nextDeadline}</p>
                          <p>{module.assessments} assessments in this module</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-sky-700">
                  Open module
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </Link>
            ))}
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
            <UserPicker
              options={allUsers}
              value={leaderPickerValue}
              onValueChange={setLeaderPickerValue}
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
