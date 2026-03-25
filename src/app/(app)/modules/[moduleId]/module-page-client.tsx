"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarPlus2, ChevronRight, Plus, Settings2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createAcademicYearAction,
  createAssessmentAction,
  deactivateModuleMembershipAction,
  inviteModuleUserAction,
  saveModuleMembershipAction,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ModalShell } from "@/components/ui/modal-shell";
import { UserPicker, type UserPickerOption } from "@/components/ui/user-picker";

type Member = {
  id: string;
  userId: string;
  isLeader: boolean;
  displayName: string;
  email: string;
  meta?: string;
};

type AssessmentInstanceSummary = {
  id: string;
  academicYear: string;
  dueAt: string;
  markingDeadlineAt: string;
  moderatorName: string | null;
  moderationStatus: string;
  totalScripts: number;
  markedScripts: number;
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
  activeMembers: Member[];
  allUsers: UserPickerOption[];
  moderatorOptions: UserPickerOption[];
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
  activeMembers,
  allUsers,
  moderatorOptions,
  assessments,
}: ModulePageClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [academicYearModal, setAcademicYearModal] = useState<AssessmentSummary | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [newMembershipIsLeader, setNewMembershipIsLeader] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteIsLeader, setInviteIsLeader] = useState(false);
  const [selectedModeratorUserId, setSelectedModeratorUserId] = useState("");
  const leaderCount = useMemo(
    () => activeMembers.filter((member) => member.isLeader).length,
    [activeMembers]
  );

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
    const opensAt = String(formData.get("opensAt") ?? "");
    const dueAt = String(formData.get("dueAt") ?? "");
    const markingDeadlineAt = String(formData.get("markingDeadlineAt") ?? "");

    startTransition(async () => {
      const result = await createAcademicYearAction({
        moduleId,
        assessmentTemplateId,
        academicYear,
        opensAt,
        dueAt,
        markingDeadlineAt,
        moderatorUserId: selectedModeratorUserId,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setAcademicYearModal(null);
      setSelectedModeratorUserId("");
      setFeedback({ tone: "success", message: result.message ?? "Academic year saved." });
      router.refresh();
    });
  };

  const handleMembershipSave = () => {
    startTransition(async () => {
      const result = await saveModuleMembershipAction({
        moduleId,
        userId: selectedUserId,
        isLeader: newMembershipIsLeader,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setSelectedUserId("");
      setNewMembershipIsLeader(false);
      setFeedback({ tone: "success", message: result.message ?? "Team member saved." });
      router.refresh();
    });
  };

  const handleInvite = () => {
    startTransition(async () => {
      const result = await inviteModuleUserAction({
        moduleId,
        name: inviteName,
        email: inviteEmail,
        isLeader: inviteIsLeader,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setInviteName("");
      setInviteEmail("");
      setInviteIsLeader(false);
      setFeedback({ tone: "success", message: result.message ?? "Invitation sent." });
      router.refresh();
    });
  };

  const handleDeactivateMembership = (membershipId: string) => {
    startTransition(async () => {
      const result = await deactivateModuleMembershipAction({
        moduleId,
        membershipId,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setFeedback({ tone: "success", message: result.message ?? "Team member removed." });
      router.refresh();
    });
  };

  const handleLeadershipChange = (userId: string, isLeader: boolean) => {
    startTransition(async () => {
      const result = await saveModuleMembershipAction({
        moduleId,
        userId,
        isLeader,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setFeedback({
        tone: "success",
        message: isLeader ? "Module leader assigned." : "Module leader removed.",
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
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
                {activeMembers.length} team member{activeMembers.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {canManageModule ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => setShowTeamModal(true)}>
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

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Users className="h-5 w-5 text-sky-600" />
              Module Team
            </CardTitle>
            <p className="mt-1 text-sm text-slate-600">Active members and current module leaders.</p>
          </div>
          {canManageModule ? (
            <Button variant="ghost" onClick={() => setShowTeamModal(true)}>
              Manage
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {activeMembers.map((member) => (
              <div key={member.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                <p className="text-sm font-semibold text-slate-950">{member.displayName}</p>
                <p className="mt-1 text-sm text-slate-500">{member.email}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {member.isLeader ? (
                    <span className="rounded-full bg-sky-100 px-2.5 py-1 font-medium text-sky-800">
                      Module leader
                    </span>
                  ) : null}
                  {member.meta ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                      {member.meta}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

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
        open={academicYearModal !== null}
        onClose={() => setAcademicYearModal(null)}
        title="Add academic year"
        description="Create a new yearly run of this assessment and assign the moderator."
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
              <label htmlFor="opens-at" className="text-sm font-medium text-slate-700">
                Opens at
              </label>
              <input
                id="opens-at"
                name="opensAt"
                type="datetime-local"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="due-at" className="text-sm font-medium text-slate-700">
                Due at
              </label>
              <input
                id="due-at"
                name="dueAt"
                type="datetime-local"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
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
            <UserPicker
              options={moderatorOptions}
              value={selectedModeratorUserId}
              onValueChange={setSelectedModeratorUserId}
              label="Assigned moderator"
              placeholder="Search for a module member"
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
        description="Add existing users, invite new users, and update module leadership."
      >
        <div className="space-y-6">
          <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-slate-950">
              <Users className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-semibold">Add existing user</h3>
            </div>

            <UserPicker
              options={allUsers}
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              placeholder="Search for a user"
            />

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={newMembershipIsLeader}
                onChange={(event) => setNewMembershipIsLeader(event.target.checked)}
              />
              Assign as module leader
            </label>

            <div className="flex justify-end">
              <Button onClick={handleMembershipSave} disabled={isPending || !selectedUserId}>
                Save team member
              </Button>
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-slate-950">
              <UserPlus className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-semibold">Invite new user</h3>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="invite-name" className="text-sm font-medium text-slate-700">
                  Name
                </label>
                <input
                  id="invite-name"
                  value={inviteName}
                  onChange={(event) => setInviteName(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
                  placeholder="Alex Smith"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="invite-email" className="text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="invite-email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
                  placeholder="alex@example.edu"
                />
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={inviteIsLeader}
                onChange={(event) => setInviteIsLeader(event.target.checked)}
              />
              Add to this module as a leader
            </label>

            <div className="flex justify-end">
              <Button onClick={handleInvite} disabled={isPending || !inviteName.trim() || !inviteEmail.trim()}>
                Send invitation
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {activeMembers.map((member) => {
              const isOnlyLeader = member.isLeader && leaderCount === 1;

              return (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-950">{member.displayName}</p>
                    <p className="mt-1 text-sm text-slate-500">{member.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {member.isLeader ? (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800">
                        Module leader
                      </span>
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => handleLeadershipChange(member.userId, !member.isLeader)}
                      disabled={isPending || isOnlyLeader}
                    >
                      {member.isLeader ? "Remove leader" : "Make leader"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeactivateMembership(member.id)}
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
      </ModalShell>
    </div>
  );
}
