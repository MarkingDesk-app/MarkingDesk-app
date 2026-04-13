import { prisma } from "@/lib/prisma";

export function normalizeUserIds(userIds: string[]): string[] {
  return Array.from(new Set(userIds.map((userId) => userId.trim()).filter(Boolean)));
}

export async function assertUsersExist(userIds: string[]): Promise<void> {
  const normalizedUserIds = normalizeUserIds(userIds);

  if (normalizedUserIds.length === 0) {
    return;
  }

  const users = await prisma.user.findMany({
    where: {
      id: { in: normalizedUserIds },
    },
    select: { id: true },
  });

  if (users.length !== normalizedUserIds.length) {
    throw new Error("One or more selected users could not be found.");
  }
}

async function assertNoAllocatedScriptsForRemovedMarkers(
  assessmentId: string,
  removedUserIds: string[]
): Promise<void> {
  if (removedUserIds.length === 0) {
    return;
  }

  const allocationCount = await prisma.allocation.count({
    where: {
      markerUserId: {
        in: removedUserIds,
      },
      script: {
        assessmentInstanceId: assessmentId,
      },
    },
  });

  if (allocationCount > 0) {
    throw new Error("Reallocate scripts before removing a marker from this assessment team.");
  }
}

export async function replaceAssessmentMarkerAssignments(input: {
  assessmentId: string;
  markerUserIds: string[];
}): Promise<string[]> {
  const markerUserIds = normalizeUserIds(input.markerUserIds);

  await assertUsersExist(markerUserIds);

  const existingAssignments = await prisma.assessmentMarker.findMany({
    where: {
      assessmentInstanceId: input.assessmentId,
      active: true,
    },
    select: {
      id: true,
      userId: true,
    },
  });

  const nextUserIdSet = new Set(markerUserIds);
  const removedUserIds = existingAssignments
    .map((assignment) => assignment.userId)
    .filter((userId) => !nextUserIdSet.has(userId));

  await assertNoAllocatedScriptsForRemovedMarkers(input.assessmentId, removedUserIds);

  if (removedUserIds.length > 0) {
    await prisma.assessmentMarker.updateMany({
      where: {
        assessmentInstanceId: input.assessmentId,
        userId: {
          in: removedUserIds,
        },
      },
      data: {
        active: false,
      },
    });
  }

  const existingUserIdSet = new Set(existingAssignments.map((assignment) => assignment.userId));
  const reactivatedUserIds = markerUserIds.filter((userId) => existingUserIdSet.has(userId));
  const newUserIds = markerUserIds.filter((userId) => !existingUserIdSet.has(userId));

  if (reactivatedUserIds.length > 0) {
    await prisma.assessmentMarker.updateMany({
      where: {
        assessmentInstanceId: input.assessmentId,
        userId: {
          in: reactivatedUserIds,
        },
      },
      data: {
        active: true,
      },
    });
  }

  if (newUserIds.length > 0) {
    await prisma.assessmentMarker.createMany({
      data: newUserIds.map((userId) => ({
        assessmentInstanceId: input.assessmentId,
        userId,
        active: true,
      })),
      skipDuplicates: true,
    });
  }

  return markerUserIds;
}

export async function saveAssessmentMarkerAssignment(input: {
  assessmentId: string;
  userId: string;
}): Promise<void> {
  const userId = input.userId.trim();

  if (!userId) {
    throw new Error("A user is required.");
  }

  await assertUsersExist([userId]);

  await prisma.assessmentMarker.upsert({
    where: {
      assessmentInstanceId_userId: {
        assessmentInstanceId: input.assessmentId,
        userId,
      },
    },
    update: {
      active: true,
    },
    create: {
      assessmentInstanceId: input.assessmentId,
      userId,
      active: true,
    },
  });
}

export async function deactivateAssessmentMarkerAssignment(input: {
  assessmentId: string;
  userId: string;
}): Promise<void> {
  const userId = input.userId.trim();

  if (!userId) {
    throw new Error("A user is required.");
  }

  await assertNoAllocatedScriptsForRemovedMarkers(input.assessmentId, [userId]);

  await prisma.assessmentMarker.updateMany({
    where: {
      assessmentInstanceId: input.assessmentId,
      userId,
    },
    data: {
      active: false,
    },
  });
}
