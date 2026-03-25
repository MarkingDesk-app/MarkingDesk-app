"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type ResetRequestResponse = {
  message?: string;
  error?: string;
};

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json().catch(() => ({}))) as ResetRequestResponse;
      if (!response.ok) {
        setError(payload.error ?? "Unable to send reset link");
        return;
      }

      setMessage(payload.message ?? "If an account exists, a reset email has been sent.");
      setEmail("");
    } catch {
      setError("Unable to send reset link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="forgot-email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            placeholder="you@example.com"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-green-700">{message}</p> : null}

        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </Button>
      </form>

      <p className="text-center text-sm text-slate-600">
        Remembered your password?{" "}
        <Link href="/auth/sign-in" className="font-medium text-blue-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
