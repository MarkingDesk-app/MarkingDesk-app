import { AssessmentSubmissionsSkeleton } from "./assessment-workspace-client";

function SkeletonBar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-full bg-slate-200/90 ${className}`} />;
}

export default function Loading() {
  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <SkeletonBar className="h-3 w-24" />
            <SkeletonBar className="h-9 w-80 max-w-full" />
            <div className="flex flex-wrap gap-2">
              <SkeletonBar className="h-8 w-32" />
              <SkeletonBar className="h-8 w-28" />
              <SkeletonBar className="h-8 w-40" />
              <SkeletonBar className="h-8 w-36" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <SkeletonBar className="h-10 w-36 rounded-2xl" />
            <SkeletonBar className="h-10 w-36 rounded-2xl" />
            <SkeletonBar className="h-10 w-36 rounded-2xl" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[24px] border border-slate-200/80 bg-white/85 p-6">
          <SkeletonBar className="h-6 w-56" />
          <div className="mt-5 space-y-4">
            <SkeletonBar className="h-10 w-32" />
            <SkeletonBar className="h-3 w-full" />
            <SkeletonBar className="h-4 w-48" />
          </div>
        </div>
        <div className="rounded-[24px] border border-slate-200/80 bg-white/85 p-6">
          <SkeletonBar className="h-6 w-52" />
          <div className="mt-5 space-y-4">
            <SkeletonBar className="h-10 w-32" />
            <SkeletonBar className="h-3 w-full" />
            <SkeletonBar className="h-4 w-40" />
          </div>
        </div>
      </section>

      <AssessmentSubmissionsSkeleton />
    </div>
  );
}
