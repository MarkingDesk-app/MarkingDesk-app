"use client";

import { LayoutDashboard, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type AppTopNavProps = {
  isAdmin: boolean;
};

const navLinkBase =
  "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition-colors";

export function AppTopNav({ isAdmin }: AppTopNavProps) {
  const pathname = usePathname();
  const isDashboardArea = pathname === "/dashboard";
  const isAdminArea = pathname === "/admin";

  return (
    <nav
      className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-white/70 bg-white/80 p-1 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_rgba(15,23,42,0.05)] backdrop-blur-sm"
      aria-label="Primary navigation"
    >
      <Link
        href="/dashboard"
        className={cn(
          navLinkBase,
          isDashboardArea ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
        )}
        aria-current={isDashboardArea ? "page" : undefined}
      >
        <LayoutDashboard className="h-4 w-4" />
        Dashboard
      </Link>
      {isAdmin ? (
        <Link
          href="/admin"
          className={cn(
            navLinkBase,
            isAdminArea ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
          )}
          aria-current={isAdminArea ? "page" : undefined}
        >
          <ShieldCheck className="h-4 w-4" />
          Admin
        </Link>
      ) : null}
    </nav>
  );
}
