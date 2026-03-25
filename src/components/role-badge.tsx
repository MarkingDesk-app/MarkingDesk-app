import { ModuleRole, Role } from "@prisma/client";

import { cn } from "@/lib/utils";

type BadgeRole = Role | ModuleRole;

const roleLabelMap: Record<BadgeRole, string> = {
  MARKER: "Marker",
  MODULE_LEADER: "Module Leader",
  MODERATOR: "Moderator",
  ADMIN: "Admin",
};

const roleColorMap: Record<BadgeRole, string> = {
  MARKER: "bg-slate-100 text-slate-700 border-slate-200",
  MODULE_LEADER: "bg-blue-100 text-blue-700 border-blue-200",
  MODERATOR: "bg-amber-100 text-amber-800 border-amber-200",
  ADMIN: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export function RoleBadge({ role }: { role: BadgeRole }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        roleColorMap[role]
      )}
    >
      {roleLabelMap[role]}
    </span>
  );
}
