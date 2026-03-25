"use client";

import Link from "next/link";
import { BookOpenCheck, LayoutDashboard, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";

import { RoleBadge } from "@/components/role-badge";
import { cn } from "@/lib/utils";

export type SidebarModule = {
  id: string;
  code: string;
  title: string;
  role: "MARKER" | "MODULE_LEADER" | "MODERATOR" | "ADMIN";
};

type AppSidebarProps = {
  isAdmin: boolean;
  modules: SidebarModule[];
};

const baseLinkClass =
  "inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition";

export function AppSidebar({ isAdmin, modules }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:self-start">
      <div className="mb-5 border-b border-slate-200 pb-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">MarkingDesk</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Marking Manager</h1>
      </div>

      <nav className="space-y-1" aria-label="Main navigation">
        <Link
          href="/dashboard"
          className={cn(
            baseLinkClass,
            pathname.startsWith("/dashboard")
              ? "bg-blue-50 text-blue-700"
              : "text-slate-700 hover:bg-slate-100"
          )}
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard
        </Link>
        {isAdmin && (
          <Link
            href="/admin"
            className={cn(
              baseLinkClass,
              pathname.startsWith("/admin")
                ? "bg-blue-50 text-blue-700"
                : "text-slate-700 hover:bg-slate-100"
            )}
          >
            <ShieldCheck className="h-4 w-4" />
            Admin
          </Link>
        )}
      </nav>

      <div className="mt-6 border-t border-slate-200 pt-4">
        <h2 className="mb-3 text-xs uppercase tracking-wide text-slate-500">My Modules</h2>
        <div className="space-y-2">
          {modules.length > 0 ? (
            modules.map((module) => (
              <Link
                key={`${module.id}-${module.role}`}
                href={`/modules/${module.id}`}
                className={cn(
                  "block rounded-lg border border-slate-200 p-3 transition",
                  pathname.startsWith(`/modules/${module.id}`) ? "border-blue-200 bg-blue-50" : "hover:bg-slate-50"
                )}
              >
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <BookOpenCheck className="h-4 w-4 text-blue-600" />
                  {module.code}
                </p>
                <p className="mt-1 line-clamp-1 text-xs text-slate-600">{module.title}</p>
                <div className="mt-2">
                  <RoleBadge role={module.role} />
                </div>
              </Link>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">
              No module memberships yet.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
