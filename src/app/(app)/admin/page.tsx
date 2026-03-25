import { ModuleRole, Role } from "@prisma/client";
import { BookPlus, ShieldCheck, UsersRound } from "lucide-react";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { RoleBadge } from "@/components/role-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function assertAdminAccess() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== Role.ADMIN) {
    throw new Error("Unauthorized");
  }
  return session;
}

async function createModuleAction(formData: FormData) {
  "use server";

  await assertAdminAccess();

  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const title = String(formData.get("title") ?? "").trim();

  if (!code || !title) {
    throw new Error("Module code and title are required.");
  }

  await prisma.module.upsert({
    where: { code },
    update: { title },
    create: { code, title },
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard");
}

async function assignMembershipAction(formData: FormData) {
  "use server";

  await assertAdminAccess();

  const userId = String(formData.get("userId") ?? "");
  const moduleId = String(formData.get("moduleId") ?? "");
  const roleRaw = String(formData.get("role") ?? "");

  if (!userId || !moduleId || !roleRaw) {
    throw new Error("User, module, and role are required.");
  }

  if (!(roleRaw in ModuleRole)) {
    throw new Error("Invalid module role.");
  }

  const role = roleRaw as ModuleRole;

  await prisma.moduleMembership.upsert({
    where: {
      userId_moduleId_role: {
        userId,
        moduleId,
        role,
      },
    },
    update: {
      active: true,
    },
    create: {
      userId,
      moduleId,
      role,
      active: true,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath(`/modules/${moduleId}`);
}

async function toggleMembershipAction(formData: FormData) {
  "use server";

  await assertAdminAccess();

  const membershipId = String(formData.get("membershipId") ?? "");
  const nextActive = String(formData.get("nextActive") ?? "") === "true";

  if (!membershipId) {
    throw new Error("Membership id is required.");
  }

  const membership = await prisma.moduleMembership.update({
    where: { id: membershipId },
    data: { active: nextActive },
    select: { moduleId: true },
  });

  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath(`/modules/${membership.moduleId}`);
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  if (session.user.role !== Role.ADMIN) {
    notFound();
  }

  const [users, modules, memberships] = await Promise.all([
    prisma.user.findMany({
      orderBy: { email: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    }),
    prisma.module.findMany({
      orderBy: { code: "asc" },
      include: {
        _count: {
          select: { memberships: true, assessmentTemplates: true },
        },
      },
    }),
    prisma.moduleMembership.findMany({
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
        module: {
          select: { id: true, code: true, title: true },
        },
      },
      orderBy: [{ module: { code: "asc" } }, { user: { email: "asc" } }, { role: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ShieldCheck className="h-7 w-7 text-blue-600" />
          Admin Console
        </h2>
        <p className="mt-2 text-sm text-blue-900">
          Manage module setup, team memberships, and role-scoped access from one place.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookPlus className="h-5 w-5 text-blue-600" />
              Create Or Update Module
            </CardTitle>
            <CardDescription>
              Enter a new module code/title, or reuse an existing code to update its title.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createModuleAction} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="module-code" className="text-sm font-medium text-slate-700">
                  Module code
                </label>
                <input
                  id="module-code"
                  name="code"
                  required
                  maxLength={30}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                  placeholder="PSY-401"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="module-title" className="text-sm font-medium text-slate-700">
                  Module title
                </label>
                <input
                  id="module-title"
                  name="title"
                  required
                  maxLength={120}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                  placeholder="Advanced Research Methods"
                />
              </div>

              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Save module
              </button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="h-5 w-5 text-blue-600" />
              Assign Module Membership
            </CardTitle>
            <CardDescription>
              Add or reactivate a role assignment for any user in a selected module.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={assignMembershipAction} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="membership-user" className="text-sm font-medium text-slate-700">
                  User
                </label>
                <select
                  id="membership-user"
                  name="userId"
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                >
                  <option value="">Select user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email} ({user.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="membership-module" className="text-sm font-medium text-slate-700">
                  Module
                </label>
                <select
                  id="membership-module"
                  name="moduleId"
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                >
                  <option value="">Select module</option>
                  {modules.map((module) => (
                    <option key={module.id} value={module.id}>
                      {module.code} - {module.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="membership-role" className="text-sm font-medium text-slate-700">
                  Module role
                </label>
                <select
                  id="membership-role"
                  name="role"
                  required
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
                >
                  {Object.values(ModuleRole).map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Save membership
              </button>
            </form>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Existing Modules</CardTitle>
          <CardDescription>Summary of modules, assessment templates, and membership counts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {modules.length > 0 ? (
            modules.map((module) => (
              <div
                key={module.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{module.code}</p>
                  <p className="text-sm text-slate-600">{module.title}</p>
                </div>
                <p className="text-xs text-slate-500">
                  {module._count.memberships} memberships, {module._count.assessmentTemplates} templates
                </p>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No modules yet. Create your first module above.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membership Directory</CardTitle>
          <CardDescription>Activate/deactivate role assignments without deleting audit history.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {memberships.length > 0 ? (
            memberships.map((membership) => (
              <div
                key={membership.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-900">
                    {membership.user.name} ({membership.user.email})
                  </p>
                  <p className="text-xs text-slate-600">
                    {membership.module.code} - {membership.module.title}
                  </p>
                  <div className="flex items-center gap-2">
                    <RoleBadge role={membership.role} />
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        membership.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {membership.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                <form action={toggleMembershipAction}>
                  <input type="hidden" name="membershipId" value={membership.id} />
                  <input type="hidden" name="nextActive" value={String(!membership.active)} />
                  <button
                    type="submit"
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                      membership.active
                        ? "bg-slate-800 text-white hover:bg-slate-900"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  >
                    {membership.active ? "Deactivate" : "Reactivate"}
                  </button>
                </form>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              No memberships yet. Assign users to modules to unlock dashboards.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
