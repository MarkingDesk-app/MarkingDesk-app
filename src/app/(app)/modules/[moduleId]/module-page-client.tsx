"use client";

import { useMemo, useState, useTransition } from "react";
import { Archive, CalendarPlus2, ChevronRight, Plus, Settings2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  archiveAssessmentAction,
  createAcademicYearAction,
  createAssessmentAction,
  deactivateAssessmentMarkerAction,
  deactivateModuleMembershipAction,
  inviteAssessmentMarkerAction,
  inviteModuleUserAction,
  saveAssessmentMarkerAction,
  saveModuleMembershipAction,
} from "./actions";
import { AsyncUserMultiPicker } from "@/components/ui/async-user-multi-picker";
import { AsyncUserPicker } from "@/components/ui/async-user-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingNotice } from "@/components/ui/loading-state";
import { ModalShell } from "@/components/ui/modal-shell";

type ModuleLeader = {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  meta?: string;
};

type AssessmentInstanceSummary = {
  id: string;
  label: string;
  academicYear: string;
  dueAt: string;
  markingDeadlineAt: string;
  moderatorName: string | null;
  moderationStatus: string;
  totalScripts: number;
  markedScripts: number;
  teamMembers: {
    userId: string;
    displayName: string;
    email: string;
    meta?: string;
  }[];
};

type AssessmentSummary = {
  id: string;
  name: string;
  instances: AssessmentInstanceSummary[];
};

type ModulePageClientProps = {
  moduleId: string;
  moduleCode: string;
  moduleTitle: string;
  canManageModule: boolean;
  currentUserIsLeader: boolean;
  moduleLeaders: ModuleLeader[];
  assessments: AssessmentSummary[];
};

type Feedback = {
  tone: "error" | "success";
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

export function ModulePageClient({
  moduleId,
  moduleCode,
  moduleTitle,
  canManageModule,
  currentUserIsLeader,
  moduleLeaders,
  assessments,
}: ModulePageClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [academicYearModal, setAcademicYearModal] = useState<AssessmentSummary | null>(null);
  const [selectedLeaderUserId, setSelectedLeaderUserId] = useState("");
  const [inviteLeaderName, setInviteLeaderName] = useState("");
  const [inviteLeaderEmail, setInviteLeaderEmail] = useState("");
  const [selectedAssessmentTeamId, setSelectedAssessmentTeamId] = useState("");
  const [selectedAssessmentUserId, setSelectedAssessmentUserId] = useState("");
  const [inviteAssessmentName, setInviteAssessmentName] = useState("");
  const [inviteAssessmentEmail, setInviteAssessmentEmail] = useState("");
  const [selectedModeratorUserId, setSelectedModeratorUserId] = useState("");
  const [selectedMarkingTeamUserIds, setSelectedMarkingTeamUserIds] = useState<string[]>([]);
  const [assessmentArchiveDraft, setAssessmentArchiveDraft] = useState<AssessmentSummary | null>(null);
  const leaderCount = moduleLeaders.length;
  const assessmentTeamOptions = useMemo(
    () =>
      assessments.flatMap((assessment) =>
        assessment.instances.map((instance) => ({
          id: instance.id,
          label: `${assessment.name} / ${instance.academicYear}`,
          members: instance.teamMembers,
        }))
      ),
    [assessments]
  );
  const activeAssessmentTeam =
    assessmentTeamOptions.find((assessmentTeam) => assessmentTeam.id === selectedAssessmentTeamId) ??
    assessmentTeamOptions[0] ??
    null;

  const handleAssessmentSubmit = async (formData: FormData) => {
    const name = String(formData.get("name") ?? "").trim();

    startTransition(async () => {
      const result = await createAssessmentAction({
        moduleId,
        name,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setShowAssessmentModal(false);
      setFeedback({ tone: "success", message: result.message ?? "Assessment saved." });
      router.refresh();
    });
  };

  const handleAcademicYearSubmit = async (formData: FormData) => {
    const assessmentTemplateId = String(formData.get("assessmentTemplateId") ?? "").trim();
    const academicYear = String(formData.get("academicYear") ?? "").trim();
    const dueAt = String(formData.get("dueAt") ?? "");
    const markingDeadlineAt = String(formData.get("markingDeadlineAt") ?? "");

    startTransition(async () => {
      const result = await createAcademicYearAction({
        moduleId,
        assessmentTemplateId,
        academicYear,
        dueAt,
        markingDeadlineAt,
        moderatorUserId: selectedModeratorUserId,
        markerUserIds: selectedMarkingTeamUserIds,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setAcademicYearModal(null);
      setSelectedModeratorUserId("");
      setSelectedMarkingTeamUserIds([]);
      setFeedback({ tone: "success", message: result.message ?? "Academic year saved." });
      router.refresh();
    });
  };

  const handleArchiveAssessment = () => {
    if (!assessmentArchiveDraft) {
      return;
    }

    startTransition(async () => {
      const result = await archiveAssessmentAction({
        moduleId,
        assessmentTemplateId: assessmentArchiveDraft.id,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setAssessmentArchiveDraft(null);
      setFeedback({ tone: "success", message: result.message ?? "Assessment archived." });
      router.refresh();
    });
  };

  const handleLeaderSave = () => {
    startTransition(async () => {
      const result = await saveModuleMembershipAction({
        moduleId,
        userId: selectedLeaderUserId,
        isLeader: true,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setSelectedLeaderUserId("");
      setFeedback({ tone: "success", message: result.message ?? "Module leader saved." });
      router.refresh();
    });
  };

  const handleLeaderInvite = () => {
    startTransition(async () => {
      const result = await inviteModuleUserAction({
        moduleId,
        name: inviteLeaderName,
        email: inviteLeaderEmail,
        isLeader: true,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setInviteLeaderName("");
      setInviteLeaderEmail("");
      setFeedback({ tone: "success", message: result.message ?? "Invitation sent." });
      router.refresh();
    });
  };

  const handleAssessmentMarkerSave = () => {
    if (!activeAssessmentTeam || !selectedAssessmentUserId) {
      return;
    }

    startTransition(async () => {
      const result = await saveAssessmentMarkerAction({
        moduleId,
        assessmentId: activeAssessmentTeam.id,
        userId: selectedAssessmentUserId,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setSelectedAssessmentUserId("");
      setFeedback({ tone: "success", message: result.message ?? "Assessment team updated." });
      router.refresh();
    });
  };

  const handleAssessmentMarkerInvite = () => {
    if (!activeAssessmentTeam) {
      return;
    }

    startTransition(async () => {
      const result = await inviteAssessmentMarkerAction({
        moduleId,
        assessmentId: activeAssessmentTeam.id,
        name: inviteAssessmentName,
        email: inviteAssessmentEmail,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setInviteAssessmentName("");
      setInviteAssessmentEmail("");
      setFeedback({ tone: "success", message: result.message ?? "Invitation sent." });
      router.refresh();
    });
  };

  const handleDeactivateLeader = (membershipId: string) => {
    startTransition(async () => {
      const result = await deactivateModuleMembershipAction({
        moduleId,
        membershipId,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setFeedback({ tone: "success", message: result.message ?? "Module leader removed." });
      router.refresh();
    });
  };

  const handleAssessmentMarkerRemoval = (assessmentId: string, userId: string) => {
    startTransition(async () => {
      const result = await deactivateAssessmentMarkerAction({
        moduleId,
        assessmentId,
        userId,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setFeedback({ tone: "success", message: result.message ?? "Marker removed from the assessment team." });
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <PendingNotice
        show={isPending}
        title="Updating module"
        description="Saving the latest team, assessment, or archive changes."
      />

      <section className="flex flex-col gap-4 rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">{moduleCode}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{moduleTitle}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {currentUserIsLeader ? (
                <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-800">
                  You are a module leader
                </span>
              ) : null}
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {assessments.length} assessment{assessments.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                {moduleLeaders.length} module leader{moduleLeaders.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {canManageModule ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedAssessmentTeamId(assessmentTeamOptions[0]?.id ?? "");
                  setSelectedLeaderUserId("");
                  setSelectedAssessmentUserId("");
                  setShowTeamModal(true);
                }}
              >
                <Settings2 className="h-4 w-4" />
                Manage team
              </Button>
              <Button variant="secondary" onClick={() => setShowAssessmentModal(true)}>
                <Plus className="h-4 w-4" />
                Add assessment
              </Button>
            </div>
          ) : null}
        </div>

        <FeedbackMessage feedback={feedback} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Assessments</h2>
          <p className="mt-1 text-sm text-slate-600">Each assessment can hold multiple academic years.</p>
        </div>

        {assessments.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-sm text-slate-600">
              No assessments yet. Add the first assessment to start setting up marking.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {assessments.map((assessment) => (
              <Card key={assessment.id} className="overflow-hidden">
                <CardHeader className="flex flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl">{assessment.name}</CardTitle>
                    <p className="mt-1 text-sm text-slate-600">
                      {assessment.instances.length} academic year{assessment.instances.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {canManageModule ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setSelectedModeratorUserId("");
                          setAcademicYearModal(assessment);
                        }}
                      >
                        <CalendarPlus2 className="h-4 w-4" />
                        Add academic year
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setAssessmentArchiveDraft(assessment)}
                      >
                        <Archive className="h-4 w-4" />
                        Archive assessment
                      </Button>
                    </div>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  {assessment.instances.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
                      No academic years yet.
                    </p>
                  ) : (
                    assessment.instances.map((instance) => (
                      <Link
                        key={instance.id}
                        href={`/modules/${moduleId}/assessments/${instance.id}`}
                        className="group flex items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 transition hover:border-sky-200 hover:bg-sky-50/60"
                      >
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-slate-950">{instance.academicYear}</p>
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                              {instance.markedScripts}/{instance.totalScripts} marked
                            </span>
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                              {instance.teamMembers.length} marker{instance.teamMembers.length === 1 ? "" : "s"}
                            </span>
                          </div>
                          <div className="space-y-1 text-sm text-slate-600">
                            <p>Due {instance.dueAt}</p>
                            <p>Deadline {instance.markingDeadlineAt}</p>
                            <p>
                              Moderator: {instance.moderatorName ?? "Not assigned"} · {instance.moderationStatus}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-hover:text-sky-700" />
                      </Link>
                    ))
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <ModalShell
        open={showAssessmentModal}
        onClose={() => setShowAssessmentModal(false)}
        title="Add assessment"
        description="Create the assessment once, then add academic years beneath it."
        widthClassName="max-w-xl"
      >
        <form action={handleAssessmentSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="assessment-name" className="text-sm font-medium text-slate-700">
              Assessment name
            </label>
            <input
              id="assessment-name"
              name="name"
              required
              placeholder="Final Coursework"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              Save assessment
            </Button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        open={assessmentArchiveDraft !== null}
        onClose={() => setAssessmentArchiveDraft(null)}
        title="Archive assessment"
        description={
          assessmentArchiveDraft
            ? `${assessmentArchiveDraft.name} has ${assessmentArchiveDraft.instances.length} academic year${assessmentArchiveDraft.instances.length === 1 ? "" : "s"}.`
            : "Archive this assessment and keep the records for audit."
        }
        widthClassName="max-w-xl"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            Archiving will hide this assessment from marking teams and move it into the archived section. The
            assessment and all academic years within it will remain on file for audit purposes.
          </div>

          <div className="space-y-1 text-sm text-slate-600">
            <p>Assessment: {assessmentArchiveDraft?.name ?? "—"}</p>
            <p>Academic years: {assessmentArchiveDraft?.instances.length ?? 0}</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssessmentArchiveDraft(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleArchiveAssessment} disabled={isPending}>
              Archive assessment
            </Button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        open={academicYearModal !== null}
        onClose={() => {
          setAcademicYearModal(null);
          setSelectedModeratorUserId("");
          setSelectedMarkingTeamUserIds([]);
        }}
        title="Add academic year"
        description="Create a new yearly run of this assessment, assign the moderator, and set the marking team."
      >
        <form action={handleAcademicYearSubmit} className="space-y-4">
          <input type="hidden" name="assessmentTemplateId" value={academicYearModal?.id ?? ""} />

          <div className="space-y-2">
            <label htmlFor="academic-year" className="text-sm font-medium text-slate-700">
              Academic year
            </label>
            <input
              id="academic-year"
              name="academicYear"
              required
              placeholder="2025/26"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="due-at" className="text-sm font-medium text-slate-700">
                Due date
              </label>
              <input
                id="due-at"
                name="dueAt"
                type="datetime-local"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="marking-deadline-at" className="text-sm font-medium text-slate-700">
                Marking deadline
              </label>
              <input
                id="marking-deadline-at"
                name="markingDeadlineAt"
                type="datetime-local"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
              />
            </div>
            <AsyncUserPicker
              value={selectedModeratorUserId}
              onValueChange={setSelectedModeratorUserId}
              label="Assigned moderator"
              placeholder="Search for a user"
            />
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <AsyncUserMultiPicker
              value={selectedMarkingTeamUserIds}
              onValueChange={setSelectedMarkingTeamUserIds}
              label="Marking team"
              placeholder="Search for a marker to add"
              addLabel="Add marker"
              emptyText="No markers selected yet."
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              Save academic year
            </Button>
          </div>
        </form>
      </ModalShell>

      <ModalShell
        open={showTeamModal}
        onClose={() => setShowTeamModal(false)}
        title="Manage module team"
        description="Manage module leaders and add or remove markers on specific assessments."
      >
        <div className="space-y-6">
          <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-slate-950">
              <Users className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-semibold">Module leaders</h3>
            </div>

            <AsyncUserPicker
              value={selectedLeaderUserId}
              onValueChange={setSelectedLeaderUserId}
              placeholder="Search for a user to add as a module leader"
            />

            <div className="flex justify-end">
              <Button onClick={handleLeaderSave} disabled={isPending || !selectedLeaderUserId}>
                Add module leader
              </Button>
            </div>

            <div className="space-y-3">
              {moduleLeaders.map((leader) => {
                const isOnlyLeader = leaderCount === 1;

                return (
                  <div
                    key={leader.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{leader.displayName}</p>
                      <p className="mt-1 text-sm text-slate-500">{leader.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800">
                        Module leader
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeactivateLeader(leader.id)}
                        disabled={isPending || isOnlyLeader}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-slate-950">
              <UserPlus className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-semibold">Invite module leader</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="invite-leader-name" className="text-sm font-medium text-slate-700">
                  Name
                </label>
                <input
                  id="invite-leader-name"
                  value={inviteLeaderName}
                  onChange={(event) => setInviteLeaderName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
                  placeholder="Alex Smith"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="invite-leader-email" className="text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="invite-leader-email"
                  value={inviteLeaderEmail}
                  onChange={(event) => setInviteLeaderEmail(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
                  placeholder="alex@example.edu"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleLeaderInvite}
                disabled={isPending || !inviteLeaderName.trim() || !inviteLeaderEmail.trim()}
              >
                Send invitation
              </Button>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-slate-950">
              <Users className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-semibold">Assessment marking teams</h3>
            </div>

            {assessmentTeamOptions.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                Add an academic year before assigning markers to an assessment.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="assessment-team-select" className="text-sm font-medium text-slate-700">
                    Assessment
                  </label>
                  <select
                    id="assessment-team-select"
                    value={activeAssessmentTeam?.id ?? ""}
                    onChange={(event) => setSelectedAssessmentTeamId(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
                  >
                    {assessmentTeamOptions.map((assessmentTeam) => (
                      <option key={assessmentTeam.id} value={assessmentTeam.id}>
                        {assessmentTeam.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <AsyncUserPicker
                    value={selectedAssessmentUserId}
                    onValueChange={setSelectedAssessmentUserId}
                    label="Add existing user"
                    placeholder="Search for a marker to add to this assessment"
                  />

                  <div className="flex justify-end">
                    <Button
                      onClick={handleAssessmentMarkerSave}
                      disabled={isPending || !activeAssessmentTeam || !selectedAssessmentUserId}
                    >
                      Add marker
                    </Button>
                  </div>
                </div>

                <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label htmlFor="invite-assessment-name" className="text-sm font-medium text-slate-700">
                        Name
                      </label>
                      <input
                        id="invite-assessment-name"
                        value={inviteAssessmentName}
                        onChange={(event) => setInviteAssessmentName(event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
                        placeholder="Alex Smith"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="invite-assessment-email" className="text-sm font-medium text-slate-700">
                        Email
                      </label>
                      <input
                        id="invite-assessment-email"
                        value={inviteAssessmentEmail}
                        onChange={(event) => setInviteAssessmentEmail(event.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
                        placeholder="alex@example.edu"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      onClick={handleAssessmentMarkerInvite}
                      disabled={isPending || !activeAssessmentTeam || !inviteAssessmentName.trim() || !inviteAssessmentEmail.trim()}
                    >
                      Invite and add marker
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {activeAssessmentTeam?.members.length ? (
                    activeAssessmentTeam.members.map((member) => (
                      <div
                        key={`${activeAssessmentTeam.id}-${member.userId}`}
                        className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-950">{member.displayName}</p>
                          <p className="mt-1 text-sm text-slate-500">{member.email}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleAssessmentMarkerRemoval(activeAssessmentTeam.id, member.userId)}
                          disabled={isPending}
                        >
                          Remove
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                      No markers assigned to this assessment yet.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
