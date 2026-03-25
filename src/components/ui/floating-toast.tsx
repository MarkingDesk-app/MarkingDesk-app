"use client";

type FloatingToastProps = {
  message: string;
  tone?: "success" | "error";
};

export function FloatingToast({ message, tone = "success" }: FloatingToastProps) {
  const toneClassName =
    tone === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700 shadow-[0_18px_40px_rgba(244,63,94,0.18)]"
      : "border-emerald-200 bg-emerald-50 text-emerald-800 shadow-[0_18px_40px_rgba(16,185,129,0.18)]";

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 max-w-sm">
      <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${toneClassName}`}>{message}</div>
    </div>
  );
}
