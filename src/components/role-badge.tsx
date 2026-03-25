import { Role } from "@prisma/client";

import { cn } from "@/lib/utils";

const roleLabelMap: Record<Role, string> = {
  USER: "User",
  ADMIN: "Admin",
};

const roleColorMap: Record<Role, string> = {
  USER: "bg-slate-100 text-slate-700 border-slate-200",
  ADMIN: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export function RoleBadge({ role }: { role: Role }) {
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
