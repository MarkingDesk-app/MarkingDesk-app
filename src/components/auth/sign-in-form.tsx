"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

function getReadableError(error: string): string {
  const normalized = decodeURIComponent(error).toLowerCase();
  if (normalized.includes("email not verified")) {
    return "Your email is not verified yet. We have sent a fresh verification link.";
  }
  if (normalized.includes("invalid email or password") || normalized.includes("credentialssignin")) {
    return "Invalid email or password.";
  }
  return "Unable to sign in right now.";
}

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
        callbackUrl: "/dashboard",
      });

      if (result?.error) {
        setError(getReadableError(result.error));
        return;
      }

      if (result?.url) {
        window.location.href = result.url;
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Unable to sign in right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label htmlFor="signin-email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="signin-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="signin-password" className="text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="signin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            placeholder="At least 8 characters"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <div className="space-y-2 text-center text-sm">
        <Link href="/auth/forgot-password" className="font-medium text-blue-700 hover:underline">
          Forgot password?
        </Link>
        <p className="text-slate-600">
          Need an account?{" "}
          <Link href="/auth/sign-up" className="font-medium text-blue-700 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
