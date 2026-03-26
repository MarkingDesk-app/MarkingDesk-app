"use client";

import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useBreadcrumbs } from "@/components/breadcrumb-context";
import { cn } from "@/lib/utils";

type Crumb = {
  label: string;
  href: string;
  current?: boolean;
};

function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) {
    return [];
  }

  if (segments[0] === "dashboard") {
    return [
      {
        label: "Dashboard",
        href: "/dashboard",
        current: true,
      },
    ];
  }

  if (segments[0] === "admin") {
    return [
      { label: "Dashboard", href: "/dashboard" },
      {
        label: "Admin",
        href: "/admin",
        current: true,
      },
    ];
  }

  if (segments[0] === "modules") {
    const crumbs: Crumb[] = [{ label: "Dashboard", href: "/dashboard" }];

    if (segments.length === 2) {
      crumbs.push({
        label: "Module",
        href: `/modules/${segments[1]}`,
        current: true,
      });
      return crumbs;
    }

    if (segments.length >= 4 && segments[2] === "assessments") {
      crumbs.push({
        label: "Module",
        href: `/modules/${segments[1]}`,
      });
      crumbs.push({
        label: "Assessment",
        href: `/modules/${segments[1]}/assessments/${segments[3]}`,
        current: true,
      });
      return crumbs;
    }
  }

  return [];
}

export function AppBreadcrumbs() {
  const pathname = usePathname();
  const { items, pathname: breadcrumbPathname } = useBreadcrumbs();
  const crumbs = breadcrumbPathname === pathname && items.length > 0 ? items : buildCrumbs(pathname);

  if (crumbs.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-4">
      <ol className="flex min-w-0 items-center gap-1.5 overflow-x-auto text-sm text-slate-500">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          const isFirst = index === 0;

          return (
            <li key={`${crumb.href}-${crumb.label}`} className="flex shrink-0 items-center gap-1.5">
              {!isFirst ? <ChevronRight className="h-3.5 w-3.5 text-slate-300" /> : null}
              {crumb.current || isLast ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-900">
                  {isFirst ? <Home className="h-3.5 w-3.5" /> : null}
                  <span>{crumb.label}</span>
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
                  )}
                >
                  {isFirst ? <Home className="h-3.5 w-3.5" /> : null}
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
