# Marking Manager (MVP)

Phase 1/2 scaffold for a Marking Management app built with Next.js App Router, TypeScript, Tailwind, Prisma, PostgreSQL, and Auth.js (NextAuth).

## Included In This First Commit

- Next.js App Router project scaffold
- Prisma schema covering the MVP domain model
- Email/password authentication with verification flow
- Optional Microsoft Entra ID sign-in support (feature-flagged)
- Protected routes with middleware
- ProjectDesk-inspired shell UI (sidebar + dashboard)
- Admin module + membership management actions
- Module-level assessment template + yearly instance setup
- Assessment workspace for script import, allocation, marking updates, moderation, and integrity flags
- Baseline Prisma migration and utility tests for core workflow helpers
- Seed script for bootstrapping an ADMIN user

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS 4
- Prisma + PostgreSQL
- Auth.js / NextAuth
- shadcn-style component primitives

## Environment

1. Copy `.env.example` to `.env`.
2. Fill in database and auth settings.

Required variables:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `LOCAL_AUTH_ENABLED`
- `ADMIN_EMAIL`

Optional variables:

- `AZURE_AD_ENABLED` (`true` to enable Entra login)
- `AZURE_AD_CLIENT_ID`
- `AZURE_AD_CLIENT_SECRET`
- `AZURE_AD_TENANT_ID`
- `MAILGUN_FROM_ADDRESS`
- `MAILGUN_DOMAIN`
- `MAILGUN_API_KEY`
- `MAILGUN_API_BASE_URL`

## Local Setup

```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run prisma:seed
npm run dev
```

Optional demo data setup:

```bash
npm run prisma:seed:demo
```

## Auth Notes

- Default provider: `credentials` (email + password).
- New accounts must verify email before first sign-in.
- Password reset is available via email link.
- Microsoft Entra ID can still be enabled by setting `AZURE_AD_ENABLED=true` with valid credentials.
- Global `ADMIN` role is assigned via seed/database update.

## Route Summary

- `/` redirects to `/dashboard` if authenticated, otherwise `/auth/sign-in`
- `/auth/sign-in` public login page
- `/auth/sign-up` account creation
- `/auth/verify-email` verification callback page
- `/auth/forgot-password` request password reset
- `/auth/reset-password` set new password
- `/dashboard` protected
- `/modules/[moduleId]` protected
- `/modules/[moduleId]/assessments/[assessmentId]` operational script workflow
- `/admin` protected and ADMIN-only

## Deploying To Vercel

1. Create a PostgreSQL database.
2. Add all environment variables in Vercel project settings.
3. Run migrations/seeding against production DB (`npm run prisma:migrate:deploy` then `npm run prisma:seed`).
4. Set Mailgun variables if you want real verification/reset emails (otherwise links are logged as mock email output).
5. If enabling Entra login, ensure redirect URI includes:
   - `https://<your-domain>/api/auth/callback/azure-ad`
