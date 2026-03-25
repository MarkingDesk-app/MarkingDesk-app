"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";

export function SignOutButton() {
  return (
    <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/auth/sign-in" })}>
      <LogOut className="h-4 w-4" />
      Sign out
    </Button>
  );
}
