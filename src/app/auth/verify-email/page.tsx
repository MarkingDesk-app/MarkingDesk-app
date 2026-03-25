import { MailCheck } from "lucide-react";
import { Suspense } from "react";

import { VerifyEmailView } from "@/components/auth/verify-email-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailCheck className="h-5 w-5 text-blue-600" />
            Verify email
          </CardTitle>
          <CardDescription>We are validating your verification link.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-center text-sm text-slate-600">Confirming your email...</p>}>
            <VerifyEmailView />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
