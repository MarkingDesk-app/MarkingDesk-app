"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type SignupResponse = {
  message?: string;
  error?: string;
};

export function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const payload = (await response.json().catch(() => ({}))) as SignupResponse;
      if (!response.ok) {
        setError(payload.error ?? "Unable to create account");
        return;
      }

      setMessage(payload.message ?? "Account created. Check your inbox for a verification email.");
      setPassword("");
    } catch {
      setError("Unable to create account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="signup-name" className="text-sm font-medium text-slate-700">
            Full name
          </label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            placeholder="Jane Smith"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="signup-email" className="text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="signup-email"
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
          <label htmlFor="signup-password" className="text-sm font-medium text-slate-700">
            Password
          </label>
          <input
            id="signup-password"
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

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-green-700">{message}</p> : null}

        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? "Creating account..." : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link href="/auth/sign-in" className="font-medium text-blue-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
