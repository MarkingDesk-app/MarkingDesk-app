function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-slate-200/90 ${className}`} />;
}

export default function DistributionLoading() {
  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <SkeletonBar className="h-3 w-24" />
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Distribution</p>
              <p className="text-3xl font-semibold tracking-tight text-slate-950">Loading distribution</p>
            </div>
            <SkeletonBar className="h-5 w-56" />
            <div className="flex flex-wrap items-center gap-2">
              <SkeletonBar className="h-8 w-28 rounded-full" />
              <SkeletonBar className="h-8 w-32 rounded-full" />
            </div>
          </div>

          <SkeletonBar className="h-12 w-56 rounded-2xl" />
        </div>
      </section>

      <section className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SkeletonBar className="h-6 w-44" />
            <div className="flex flex-wrap gap-2">
              <SkeletonBar className="h-8 w-24 rounded-full" />
              <SkeletonBar className="h-8 w-24 rounded-full" />
              <SkeletonBar className="h-8 w-24 rounded-full" />
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-5">
            <SkeletonBar className="h-80 w-full rounded-[24px]" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="rounded-[24px] border border-slate-200/80 bg-slate-50/80 p-4">
                <SkeletonBar className="h-5 w-28" />
                <div className="mt-4 space-y-3">
                  <SkeletonBar className="h-3 w-full" />
                  <SkeletonBar className="h-3 w-5/6" />
                  <SkeletonBar className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
