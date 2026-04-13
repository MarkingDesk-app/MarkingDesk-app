function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-slate-200/90 ${className}`} />;
}

function SkeletonCard() {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/85 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBar className="h-3 w-20" />
          <SkeletonBar className="h-7 w-3/4" />
          <SkeletonBar className="h-4 w-2/3" />
        </div>
        <div className="flex gap-2">
          <SkeletonBar className="h-6 w-20" />
          <SkeletonBar className="h-6 w-24" />
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5">
          <SkeletonBar className="h-3 w-36" />
          <SkeletonBar className="mt-3 h-6 w-24" />
          <SkeletonBar className="mt-3 h-2 w-full" />
          <SkeletonBar className="mt-3 h-4 w-28" />
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5">
          <SkeletonBar className="h-3 w-36" />
          <SkeletonBar className="mt-3 h-6 w-24" />
          <SkeletonBar className="mt-3 h-2 w-full" />
          <SkeletonBar className="mt-3 h-4 w-32" />
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3.5 md:col-span-2">
          <SkeletonBar className="h-3 w-28" />
          <SkeletonBar className="mt-3 h-4 w-4/5" />
        </div>
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1 space-y-4">
          <SkeletonBar className="h-3 w-24" />
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Dashboard</p>
            <p className="text-3xl font-semibold tracking-tight text-slate-950">Loading dashboard</p>
          </div>
          <SkeletonBar className="h-12 w-full max-w-xl rounded-2xl" />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SkeletonBar className="h-10 w-32 rounded-2xl" />
          <SkeletonBar className="h-10 w-24 rounded-2xl" />
          <SkeletonBar className="h-10 w-32 rounded-2xl" />
        </div>
      </div>

      <SkeletonBar className="h-12 w-full rounded-2xl" />

      <section id="modules" className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </section>
    </div>
  );
}
