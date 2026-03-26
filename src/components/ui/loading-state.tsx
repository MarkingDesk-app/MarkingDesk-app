import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type LoadingStateProps = {
  title: string;
  description?: string;
  className?: string;
};

export function LoadingPanel({ title, description, className }: LoadingStateProps) {
  return (
    <div
      className={cn(
        "w-full max-w-md rounded-[28px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur",
        className
      )}
    >
      <div className="flex items-start gap-4">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
          <LoaderCircle className="h-5 w-5 animate-spin" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-950">{title}</p>
          {description ? <p className="text-sm leading-relaxed text-slate-600">{description}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function LoadingScreen({ title, description }: LoadingStateProps) {
  return (
    <div className="flex min-h-[42vh] items-center justify-center px-4 py-10">
      <LoadingPanel title={title} description={description} />
    </div>
  );
}

type PendingNoticeProps = {
  show: boolean;
  title: string;
  description?: string;
};

export function PendingNotice({ show, title, description }: PendingNoticeProps) {
  if (!show) {
    return null;
  }

  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))]">
      <LoadingPanel
        title={title}
        description={description}
        className="border-sky-100/80 bg-white/96 px-5 py-4 shadow-[0_24px_70px_rgba(14,165,233,0.16)]"
      />
    </div>
  );
}
