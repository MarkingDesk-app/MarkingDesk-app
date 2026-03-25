"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarPlus2, ChevronRight, Plus, Settings2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createAcademicYearAction,
  createAssessmentAction,
  deactivateModuleMembershipAction,
  saveModuleMembershipAction,
} from "./actions";
import { RoleBadge } from "@/components/role-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ModalShell } from "@/components/ui/modal-shell";

type ModuleTeamRole = "MARKER" | "MODULE_LEADER" | "MODERATOR";

type Member = {
  id: string;
  role: ModuleTeamRole;
  displayName: string;
  email: string;
};

type UserOption = {
  id: string;
  displayName: string;
  email: string;
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
  currentRole: ModuleTeamRole | "ADMIN";
  activeMembers: Member[];
  allUsers: UserOption[];
  moderatorOptions: UserOption[];
  assessments: AssessmentSummary[];
};

type Feedback = {
  tone: "error" | "success";
  message: string;
};

function FeedbackMessage({ feedback }: { feedback: Feedback | null }) {
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
  currentRole,
  activeMembers,
  allUsers,
  moderatorOptions,
  assessments,
}: ModulePageClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [academicYearModal, setAcademicYearModal] = useState<AssessmentSummary | null>(null);

  const assessmentOptions = useMemo(
    () =>
      assessments.map((assessment) => ({
        id: assessment.id,
        label: assessment.name,
      })),
    [assessments]
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
    const moderatorUserId = String(formData.get("moderatorUserId") ?? "").trim();

    startTransition(async () => {
      const result = await createAcademicYearAction({
        moduleId,
        assessmentTemplateId,
        academicYear,
        opensAt,
        dueAt,
        markingDeadlineAt,
        moderatorUserId,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setAcademicYearModal(null);
      setFeedback({ tone: "success", message: result.message ?? "Academic year saved." });
      router.refresh();
    });
  };

  const handleMembershipSubmit = async (formData: FormData) => {
    const userId = String(formData.get("userId") ?? "").trim();
    const role = String(formData.get("role") ?? "").trim() as ModuleTeamRole;

    startTransition(async () => {
      const result = await saveModuleMembershipAction({
        moduleId,
        userId,
        role,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setFeedback({ tone: "success", message: result.message ?? "Team member saved." });
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

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">{moduleCode}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{moduleTitle}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <RoleBadge role={currentRole} />
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
            <p className="mt-1 text-sm text-slate-600">Active module members and their current roles.</p>
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
              <div
                key={member.id}
                className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3"
              >
                <p className="text-sm font-semibold text-slate-950">{member.displayName}</p>
                <p className="mt-1 text-sm text-slate-500">{member.email}</p>
                <div className="mt-3">
                  <RoleBadge role={member.role} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Assessments</h2>
            <p className="mt-1 text-sm text-slate-600">Each assessment can hold multiple academic years.</p>
          </div>
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
                      {assessment.instances.length} academic year
                      {assessment.instances.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  {canManageModule ? (
                    <Button variant="secondary" size="sm" onClick={() => setAcademicYearModal(assessment)}>
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
          <input
            type="hidden"
            name="assessmentTemplateId"
            value={academicYearModal?.id ?? assessmentOptions[0]?.id ?? ""}
          />

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
            <div className="space-y-2">
              <label htmlFor="moderator-user-id" className="text-sm font-medium text-slate-700">
                Assigned moderator
              </label>
              <select
                id="moderator-user-id"
                name="moderatorUserId"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
                defaultValue=""
              >
                <option value="">Select a moderator</option>
                {moderatorOptions.map((moderator) => (
                  <option key={moderator.id} value={moderator.id}>
                    {moderator.displayName}
                  </option>
                ))}
              </select>
            </div>
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
        description="Add or reactivate a team member, or remove an active member from the module."
      >
        <div className="space-y-6">
          <form action={handleMembershipSubmit} className="grid gap-4 md:grid-cols-[1.4fr_1fr_auto] md:items-end">
            <div className="space-y-2">
              <label htmlFor="team-user" className="text-sm font-medium text-slate-700">
                Team member
              </label>
              <select
                id="team-user"
                name="userId"
                required
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
                defaultValue=""
              >
                <option value="">Select a user</option>
                {allUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName} ({user.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="team-role" className="text-sm font-medium text-slate-700">
                Role
              </label>
              <select
                id="team-role"
                name="role"
                required
                defaultValue="MARKER"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
              >
                <option value="MARKER">Marker</option>
                <option value="MODULE_LEADER">Module leader</option>
                <option value="MODERATOR">Moderator</option>
              </select>
            </div>
            <Button type="submit" disabled={isPending}>
              Save
            </Button>
          </form>

          <div className="space-y-3">
            {activeMembers.map((member) => (
              <div
                key={member.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-950">{member.displayName}</p>
                  <p className="mt-1 text-sm text-slate-500">{member.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <RoleBadge role={member.role} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeactivateMembership(member.id)}
                    disabled={isPending}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
