"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

export type BreadcrumbItem = {
  label: string;
  href: string;
  current?: boolean;
};

type BreadcrumbContextValue = {
  pathname: string | null;
  items: BreadcrumbItem[];
  setBreadcrumbs: (pathname: string, items: BreadcrumbItem[]) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [pathname, setPathname] = useState<string | null>(null);
  const [items, setItems] = useState<BreadcrumbItem[]>([]);
  const value = useMemo(
    () => ({
      pathname,
      items,
      setBreadcrumbs: (nextPathname: string, nextItems: BreadcrumbItem[]) => {
        setPathname(nextPathname);
        setItems(nextItems);
      },
    }),
    [items, pathname]
  );

  return <BreadcrumbContext.Provider value={value}>{children}</BreadcrumbContext.Provider>;
}

export function useBreadcrumbs() {
  const context = useContext(BreadcrumbContext);

  if (!context) {
    throw new Error("useBreadcrumbs must be used within a BreadcrumbProvider.");
  }

  return context;
}

export function PageBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  const pathname = usePathname();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs(pathname, items);
  }, [items, pathname, setBreadcrumbs]);

  return null;
}
