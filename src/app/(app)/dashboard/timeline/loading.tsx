import { PageBreadcrumbs } from "@/components/breadcrumb-context";

function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-slate-200/90 ${className}`} />;
}

export default function TimelineLoading() {
  return (
    <div className="space-y-6">
      <PageBreadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Timeline", href: "/dashboard/timeline", current: true },
        ]}
      />

      <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <SkeletonBar className="h-3 w-24" />
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Timeline</p>
              <p className="text-3xl font-semibold tracking-tight text-slate-950">Loading timeline</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SkeletonBar className="h-10 w-32 rounded-2xl" />
            <SkeletonBar className="h-10 w-28 rounded-full" />
            <SkeletonBar className="h-10 w-28 rounded-2xl" />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <SkeletonBar className="h-9 w-36 rounded-full" />
          <SkeletonBar className="h-9 w-40 rounded-full" />
        </div>
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div className="overflow-hidden">
          <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-0 border-b border-slate-200/70 px-1">
            <SkeletonBar className="mx-3 mb-3 mt-1 h-4 w-24" />
            <div className="grid grid-cols-12 gap-2 px-2 pb-3">
              {Array.from({ length: 12 }, (_, index) => (
                <SkeletonBar key={index} className="h-4 w-full" />
              ))}
            </div>
          </div>

          <div className="divide-y divide-slate-200/70">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="grid grid-cols-[220px_minmax(0,1fr)] gap-0">
                <div className="space-y-3 px-4 py-4 pr-5">
                  <SkeletonBar className="h-3 w-16" />
                  <SkeletonBar className="h-5 w-40" />
                  <SkeletonBar className="h-3 w-28" />
                </div>
                <div className="px-2 py-4">
                  <div className="h-12 rounded-2xl bg-slate-100/80">
                    <div className="relative h-full">
                      <div className="absolute left-[12%] top-1/2 h-4 w-[34%] -translate-y-1/2 rounded-full bg-slate-200/90" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
