import { PageBreadcrumbs } from "@/components/breadcrumb-context";

import { DashboardSkeleton } from "./dashboard-skeleton";

export default function DashboardLoading() {
  return (
    <>
      <PageBreadcrumbs items={[{ label: "Dashboard", href: "/dashboard", current: true }]} />
      <DashboardSkeleton />
    </>
  );
}
