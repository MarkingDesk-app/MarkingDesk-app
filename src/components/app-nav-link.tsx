"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type AppNavLinkProps = {
  href: string;
  className?: string;
  children: ReactNode;
  fullReloadOnAdmin?: boolean;
};

export function AppNavLink({
  href,
  className,
  children,
  fullReloadOnAdmin = false,
}: AppNavLinkProps) {
  const pathname = usePathname();
  const shouldUseHardNavigation = fullReloadOnAdmin && pathname.startsWith("/admin");

  if (shouldUseHardNavigation) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
