import { KeyRound, ShieldCheck } from "lucide-react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { SignInForm } from "@/components/auth/sign-in-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";

export default async function SignInPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            Marking Manager
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-blue-600" />
              Sign in
            </CardTitle>
            <CardDescription>Use your email and password to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <SignInForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
