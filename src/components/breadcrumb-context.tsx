"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type BreadcrumbItem = {
  label: string;
  href: string;
  current?: boolean;
};

type BreadcrumbContextValue = {
  items: BreadcrumbItem[];
  setItems: (items: BreadcrumbItem[]) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<BreadcrumbItem[]>([]);
  const value = useMemo(() => ({ items, setItems }), [items]);

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
  const { setItems } = useBreadcrumbs();

  useEffect(() => {
    setItems(items);

    return () => {
      setItems([]);
    };
  }, [items, setItems]);

  return null;
}
