import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Role } from "@prisma/client";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AppTopNav } from "@/components/app-top-nav";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { RoleBadge } from "@/components/role-badge";
import { authOptions } from "@/lib/auth";

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.email) {
    redirect("/auth/sign-in");
  }

  const displayName = session.user.name?.trim() || session.user.email;

  return (
    <main className="min-h-screen text-slate-950">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Link href="/dashboard" className="inline-flex items-center gap-3 text-slate-950">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-[0_10px_24px_rgba(14,165,233,0.28)]">
                <GraduationCap className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold tracking-tight">MarkingDesk</span>
                <span className="block text-xs uppercase tracking-[0.24em] text-slate-500">
                  Marking and moderation workspace
                </span>
              </span>
            </Link>

            <div className="flex flex-col gap-3 lg:items-end">
              <div className="flex flex-wrap items-center gap-3">
                <AppTopNav isAdmin={session.user.role === Role.ADMIN} />

                <div className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/85 px-3 py-2 shadow-sm">
                  <div className="hidden text-right sm:block">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400">Signed in as</p>
                    <p className="max-w-[14rem] truncate text-sm font-medium text-slate-900">{displayName}</p>
                  </div>
                  <RoleBadge role={session.user.role} />
                  <SignOutButton />
                </div>
              </div>

              <AppBreadcrumbs />
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">{children}</section>
    </main>
  );
}
