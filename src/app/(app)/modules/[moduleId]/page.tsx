import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ModulePageContent } from "./module-page-content";
import { ModulePageSkeleton } from "./module-page-skeleton";
import { PageBreadcrumbs } from "@/components/breadcrumb-context";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ModulePageProps = {
  params: Promise<{ moduleId: string }>;
};

const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  passwordHash: true,
  emailVerified: true,
} as const;

export default async function ModulePage({ params }: ModulePageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  const { moduleId } = await params;

  const moduleRecord = await prisma.module.findUnique({
    where: { id: moduleId },
    select: {
      id: true,
      code: true,
      title: true,
    },
  });

  if (!moduleRecord) {
    notFound();
  }

  const moduleLeaders = await prisma.moduleMembership.findMany({
    where: {
      moduleId,
      active: true,
      isLeader: true,
    },
    include: {
      user: {
        select: userSummarySelect,
      },
    },
    orderBy: [{ user: { name: "asc" } }, { user: { email: "asc" } }],
  });

  const currentUserIsLeader = moduleLeaders.some((membership) => membership.userId === session.user.id);
  const canManageModule = session.user.role === Role.ADMIN || currentUserIsLeader;

  if (!canManageModule) {
    const accessibleAssessmentTemplate = await prisma.assessmentTemplate.findFirst({
      where: {
        moduleId,
        isArchived: false,
        assessmentInstances: {
          some: {
            OR: [
              {
                moderatorUserId: session.user.id,
              },
              {
                markerAssignments: {
                  some: {
                    userId: session.user.id,
                    active: true,
                  },
                },
              },
            ],
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!accessibleAssessmentTemplate) {
      notFound();
    }
  }

  return (
    <>
      <PageBreadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: moduleRecord.code, href: `/modules/${moduleRecord.id}`, current: true },
        ]}
      />
      <Suspense fallback={<ModulePageSkeleton moduleCode={moduleRecord.code} moduleTitle={moduleRecord.title} />}>
        <ModulePageContent
          moduleId={moduleRecord.id}
          moduleCode={moduleRecord.code}
          moduleTitle={moduleRecord.title}
          currentUserId={session.user.id}
          canManageModule={canManageModule}
          currentUserIsLeader={currentUserIsLeader}
          moduleLeaders={moduleLeaders}
        />
      </Suspense>
    </>
  );
}
