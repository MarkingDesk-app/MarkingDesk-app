"use client";

import { useMemo, useState, useTransition } from "react";
import { ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { inviteUserAction, saveMembershipAction, toggleMembershipAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPicker, type UserPickerOption } from "@/components/ui/user-picker";

type ModuleOption = {
  id: string;
  code: string;
  title: string;
  membershipCount: number;
  assessmentCount: number;
};

type MembershipSummary = {
  id: string;
  active: boolean;
  isLeader: boolean;
  userId: string;
  userName: string;
  userEmail: string;
  userMeta?: string;
  moduleId: string;
  moduleCode: string;
  moduleTitle: string;
};

type AdminPageClientProps = {
  userOptions: UserPickerOption[];
  modules: ModuleOption[];
  memberships: MembershipSummary[];
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

export function AdminPageClient({ userOptions, modules, memberships }: AdminPageClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [membershipIsLeader, setMembershipIsLeader] = useState(false);
  const leaderCounts = useMemo(
    () =>
      memberships.reduce<Record<string, number>>((counts, membership) => {
        if (membership.active && membership.isLeader) {
          counts[membership.moduleId] = (counts[membership.moduleId] ?? 0) + 1;
        }

        return counts;
      }, {}),
    [memberships]
  );

  const handleInvite = () => {
    startTransition(async () => {
      const result = await inviteUserAction({
        name: inviteName,
        email: inviteEmail,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setInviteName("");
      setInviteEmail("");
      setFeedback({ tone: "success", message: result.message ?? "Invitation sent." });
      router.refresh();
    });
  };

  const handleMembershipSave = () => {
    startTransition(async () => {
      const result = await saveMembershipAction({
        userId: selectedUserId,
        moduleId: selectedModuleId,
        isLeader: membershipIsLeader,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setSelectedUserId("");
      setSelectedModuleId("");
      setMembershipIsLeader(false);
      setFeedback({ tone: "success", message: result.message ?? "Membership saved." });
      router.refresh();
    });
  };

  const handleMembershipToggle = (membershipId: string, nextActive: boolean) => {
    startTransition(async () => {
      const result = await toggleMembershipAction({
        membershipId,
        nextActive,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setFeedback({ tone: "success", message: result.message ?? "Membership updated." });
      router.refresh();
    });
  };

  const handleLeadershipToggle = (userId: string, moduleId: string, nextIsLeader: boolean) => {
    startTransition(async () => {
      const result = await saveMembershipAction({
        userId,
        moduleId,
        isLeader: nextIsLeader,
      });

      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }

      setFeedback({
        tone: "success",
        message: nextIsLeader ? "Module leader assigned." : "Module leader removed.",
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Admin</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">People and access</h1>
            <p className="mt-2 text-sm text-slate-600">
              Invite users, add them to modules, and adjust module leadership.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <FeedbackMessage feedback={feedback} />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Invite User</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="invite-name" className="text-sm font-medium text-slate-700">
                Name
              </label>
              <input
                id="invite-name"
                value={inviteName}
                onChange={(event) => setInviteName(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
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
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
                placeholder="alex@example.edu"
              />
            </div>
            <Button onClick={handleInvite} disabled={isPending || !inviteName.trim() || !inviteEmail.trim()}>
              Send welcome email
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <UsersRound className="h-5 w-5 text-sky-600" />
              Add User To Module
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <UserPicker
              options={userOptions}
              value={selectedUserId}
              onValueChange={setSelectedUserId}
              label="User"
              placeholder="Search for a user"
            />

            <div className="space-y-2">
              <label htmlFor="membership-module" className="text-sm font-medium text-slate-700">
                Module
              </label>
              <select
                id="membership-module"
                value={selectedModuleId}
                onChange={(event) => setSelectedModuleId(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none ring-sky-500 focus:ring-2"
              >
                <option value="">Select a module</option>
                {modules.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.code} - {module.title}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={membershipIsLeader}
                onChange={(event) => setMembershipIsLeader(event.target.checked)}
              />
              Assign as module leader
            </label>

            <Button onClick={handleMembershipSave} disabled={isPending || !selectedUserId || !selectedModuleId}>
              Save membership
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Modules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {modules.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
              No modules yet.
            </p>
          ) : (
            modules.map((module) => (
              <Link
                key={module.id}
                href={`/modules/${module.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 transition hover:border-sky-200 hover:bg-sky-50/60"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-950">{module.code}</p>
                  <p className="mt-1 text-sm text-slate-500">{module.title}</p>
                </div>
                <p className="text-xs text-slate-500">
                  {module.membershipCount} members, {module.assessmentCount} assessments
                </p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membership Directory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {memberships.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
              No memberships yet.
            </p>
          ) : (
            memberships.map((membership) => {
              const isOnlyLeader =
                membership.active && membership.isLeader && (leaderCounts[membership.moduleId] ?? 0) === 1;

              return (
                <div
                  key={membership.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-slate-950">
                      {membership.userName} ({membership.userEmail})
                    </p>
                    <p className="text-xs text-slate-500">
                      {membership.moduleCode} - {membership.moduleTitle}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {membership.isLeader ? (
                        <span className="rounded-full bg-sky-100 px-2.5 py-1 font-medium text-sky-800">
                          Module leader
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-2.5 py-1 font-medium ${
                          membership.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {membership.active ? "Active" : "Inactive"}
                      </span>
                      {membership.userMeta ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">
                          {membership.userMeta}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        handleLeadershipToggle(membership.userId, membership.moduleId, !membership.isLeader)
                      }
                      disabled={isPending || isOnlyLeader}
                    >
                      {membership.isLeader ? "Remove leader" : "Make leader"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleMembershipToggle(membership.id, !membership.active)}
                      disabled={isPending || isOnlyLeader}
                    >
                      {membership.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
