import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { AdminPageClient } from "./admin-page-client";
import { PageBreadcrumbs } from "@/components/breadcrumb-context";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDisplayName } from "@/lib/user-display";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  if (session.user.role !== Role.ADMIN) {
    notFound();
  }

  const [modules, memberships] = await Promise.all([
    prisma.module.findMany({
      orderBy: { code: "asc" },
      include: {
        _count: {
          select: { memberships: true, assessmentTemplates: true },
        },
      },
    }),
    prisma.moduleMembership.findMany({
      where: {
        isLeader: true,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            passwordHash: true,
            emailVerified: true,
          },
        },
        module: {
          select: {
            id: true,
            code: true,
            title: true,
          },
        },
      },
      orderBy: [{ module: { code: "asc" } }, { isLeader: "desc" }, { user: { email: "asc" } }],
    }),
  ]);

  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Admin", href: "/admin", current: true },
        ]}
      />
      <AdminPageClient
        modules={modules.map((module) => ({
          id: module.id,
          code: module.code,
          title: module.title,
          membershipCount: module._count.memberships,
          assessmentCount: module._count.assessmentTemplates,
        }))}
        memberships={memberships.map((membership) => ({
          id: membership.id,
          active: membership.active,
          isLeader: membership.isLeader,
          userId: membership.user.id,
          userName: getDisplayName(membership.user),
          userEmail: membership.user.email,
          userMeta:
            membership.user.passwordHash && membership.user.emailVerified
              ? undefined
              : "Invitation pending",
          moduleId: membership.module.id,
          moduleCode: membership.module.code,
          moduleTitle: membership.module.title,
        }))}
      />
    </>
  );
}
