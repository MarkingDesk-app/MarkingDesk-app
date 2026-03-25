"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type ResetConfirmResponse = {
  message?: string;
  error?: string;
};

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMessage(null);
    setError(null);
  }, [token]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!token) {
      setError("Missing password reset token.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const payload = (await response.json().catch(() => ({}))) as ResetConfirmResponse;
      if (!response.ok) {
        setError(payload.error ?? "Unable to reset password");
        return;
      }

      setMessage(payload.message ?? "Password updated successfully.");
      setPassword("");
      setConfirmPassword("");
    } catch {
      setError("Unable to reset password");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-red-600">The password reset link is invalid.</p>
        <Link href="/auth/forgot-password" className="font-medium text-blue-700 hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="reset-password" className="text-sm font-medium text-slate-700">
            New password
          </label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            placeholder="At least 8 characters"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="reset-confirm-password" className="text-sm font-medium text-slate-700">
            Confirm password
          </label>
          <input
            id="reset-confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-green-700">{message}</p> : null}

        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? "Updating password..." : "Update password"}
        </Button>
      </form>

      <p className="text-center text-sm text-slate-600">
        <Link href="/auth/sign-in" className="font-medium text-blue-700 hover:underline">
          Return to sign in
        </Link>
      </p>
    </div>
  );
}
