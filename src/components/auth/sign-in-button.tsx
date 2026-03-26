"use client";

import { LogIn } from "lucide-react";
import { signIn } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function SignInButton() {
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    await signIn("azure-ad", { callbackUrl: "/dashboard" });
    setLoading(false);
  }

  return (
    <Button className="w-full" onClick={handleSignIn} loading={loading}>
      {!loading ? <LogIn className="h-4 w-4" /> : null}
      Continue With Microsoft
    </Button>
  );
}
