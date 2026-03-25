"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Status = "loading" | "success" | "error";

type VerifyResponse = {
  message?: string;
  error?: string;
};

export function VerifyEmailView() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const handledRef = useRef(false);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Confirming your email...");

  useEffect(() => {
    async function verifyEmail() {
      if (!token) {
        setStatus("error");
        setMessage("Missing verification token.");
        return;
      }

      if (handledRef.current) return;
      handledRef.current = true;

      setStatus("loading");
      setMessage("Confirming your email...");

      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const payload = (await response.json().catch(() => ({}))) as VerifyResponse;
        if (!response.ok) {
          setStatus("error");
          setMessage(payload.error ?? "Could not verify email.");
          return;
        }

        setStatus("success");
        setMessage(payload.message ?? "Email verified.");
      } catch {
        setStatus("error");
        setMessage("Could not verify email.");
      }
    }

    verifyEmail();
  }, [token]);

  return (
    <div className="space-y-4 text-center">
      <p className={status === "success" ? "text-green-700" : status === "error" ? "text-red-600" : "text-slate-600"}>
        {message}
      </p>
      <div className="flex justify-center gap-3">
        <Link
          href="/auth/sign-in"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Go to sign in
        </Link>
        <Link
          href="/"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Return home
        </Link>
      </div>
    </div>
  );
}
