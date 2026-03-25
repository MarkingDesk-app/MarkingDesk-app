import { AuditAction, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AuditDiff = Prisma.InputJsonValue;

export async function recordAuditLog(input: {
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  diff: AuditDiff;
}) {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      diffJson: input.diff,
    },
  });
}
