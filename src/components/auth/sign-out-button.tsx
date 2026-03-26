"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        await signOut({ callbackUrl: "/auth/sign-in" });
        setLoading(false);
      }}
    >
      {!loading ? <LogOut className="h-4 w-4" /> : null}
      Sign out
    </Button>
  );
}
