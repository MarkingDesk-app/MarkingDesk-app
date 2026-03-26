type ModulePageSkeletonProps = {
  moduleCode?: string;
  moduleTitle?: string;
};

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-slate-200/80 ${className}`} />;
}

export function ModulePageSkeleton({ moduleCode, moduleTitle }: ModulePageSkeletonProps) {
  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="space-y-3">
          <SkeletonBlock className="h-3 w-24" />
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">{moduleCode ?? "Module"}</p>
            </div>
            <p className="text-3xl font-semibold tracking-tight text-slate-950">
              {moduleTitle ?? "Loading module"}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[24px] border border-slate-200/80 bg-white/85 p-6">
          <SkeletonBlock className="h-5 w-56" />
          <div className="mt-5 space-y-4">
            <SkeletonBlock className="h-6 w-36" />
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-3 w-5/6" />
            <SkeletonBlock className="h-10 w-40" />
          </div>
        </div>
        <div className="rounded-[24px] border border-slate-200/80 bg-white/85 p-6">
          <SkeletonBlock className="h-5 w-44" />
          <div className="mt-5 space-y-4">
            <SkeletonBlock className="h-6 w-32" />
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-3 w-3/4" />
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200/80 bg-white/85 p-4">
        <SkeletonBlock className="h-6 w-32" />
        <div className="mt-4 space-y-3">
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-12 w-full" />
        </div>
      </section>
    </div>
  );
}
