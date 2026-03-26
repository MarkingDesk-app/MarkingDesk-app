"use client";

import Link from "next/link";
import { RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type SignupResponse = {
  message?: string;
  error?: string;
};

type SignupCaptchaResponse = {
  prompt?: string;
  token?: string;
  error?: string;
};

export function SignUpForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [captchaPrompt, setCaptchaPrompt] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadCaptcha = async () => {
    setCaptchaLoading(true);

    try {
      const response = await fetch("/api/auth/signup/captcha", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as SignupCaptchaResponse;

      if (!response.ok || !payload.prompt || !payload.token) {
        setCaptchaPrompt("");
        setCaptchaToken("");
        setError(payload.error ?? "Captcha is unavailable right now. Please try again.");
        return;
      }

      setCaptchaPrompt(payload.prompt);
      setCaptchaToken(payload.token);
      setCaptchaAnswer("");
    } catch {
      setCaptchaPrompt("");
      setCaptchaToken("");
      setError("Captcha is unavailable right now. Please try again.");
    } finally {
      setCaptchaLoading(false);
    }
  };

  useEffect(() => {
    void loadCaptcha();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!captchaToken) {
      setError("Captcha is unavailable right now. Please refresh and try again.");
      setMessage(null);
      return;
    }
    if (!captchaAnswer.trim()) {
      setError("Please solve the maths question before submitting.");
      setMessage(null);
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, captchaToken, captchaAnswer }),
      });

      const payload = (await response.json().catch(() => ({}))) as SignupResponse;
      if (!response.ok) {
        setError(payload.error ?? "Unable to submit your request");
        await loadCaptcha();
        return;
      }

      setMessage(payload.message ?? "Your request has been submitted.");
      setName("");
      setEmail("");
      await loadCaptcha();
    } catch {
      setError("Unable to submit your request");
      await loadCaptcha();
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

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="signup-captcha" className="text-sm font-medium text-slate-700">
              Maths check
            </label>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setMessage(null);
                void loadCaptcha();
              }}
              disabled={captchaLoading || loading}
              className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 transition hover:text-sky-800 disabled:opacity-50"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${captchaLoading ? "animate-spin" : ""}`} />
              New question
            </button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm text-slate-700">
              {captchaLoading ? "Loading question..." : captchaPrompt || "Captcha unavailable."}
            </p>
          </div>
          <input
            id="signup-captcha"
            type="text"
            inputMode="numeric"
            required
            value={captchaAnswer}
            onChange={(event) => setCaptchaAnswer(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-500 focus:ring-2"
            placeholder="Enter your answer"
            disabled={captchaLoading || !captchaToken}
          />
          <p className="text-xs text-slate-500">Answer the question correctly before submitting your request.</p>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {message ? <p className="text-sm text-green-700">{message}</p> : null}

        <Button className="w-full" type="submit" loading={loading} disabled={captchaLoading || !captchaToken}>
          {loading ? "Sending request..." : "Request account"}
        </Button>
      </form>

      <p className="text-center text-sm text-slate-600">
        Already have access?{" "}
        <Link href="/auth/sign-in" className="font-medium text-blue-700 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
