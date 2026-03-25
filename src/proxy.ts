import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

const authMiddleware = withAuth({
  pages: {
    signIn: "/auth/sign-in",
  },
});

const PROTECTED_PATH_PREFIXES = ["/dashboard", "/modules", "/admin"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function renderMaintenanceResponse() {
  const maintenanceHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>MarkingDesk | Scheduled Maintenance</title>
    <style>
      :root {
        --sky-50: #f0f9ff;
        --sky-100: #e0f2fe;
        --sky-500: #0ea5e9;
        --sky-600: #0284c7;
        --teal-300: #5eead4;
        --slate-50: #f8fafc;
        --slate-100: #f1f5f9;
        --slate-200: #e2e8f0;
        --slate-500: #64748b;
        --slate-700: #334155;
        --slate-900: #0f172a;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Geist", "Segoe UI", Arial, sans-serif;
        color: var(--slate-900);
        background:
          radial-gradient(circle at 16% 14%, rgba(14, 165, 233, 0.18), transparent 28%),
          radial-gradient(circle at 84% 88%, rgba(20, 184, 166, 0.14), transparent 26%),
          linear-gradient(180deg, #f6fbff 0%, #edf4fb 100%);
        display: grid;
        place-items: center;
        padding: 1.5rem;
      }

      .shell {
        width: min(1040px, 100%);
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid rgba(226, 232, 240, 0.9);
        border-radius: 28px;
        box-shadow: 0 28px 70px rgba(15, 23, 42, 0.14);
        overflow: hidden;
        backdrop-filter: blur(14px);
      }

      .layout {
        display: grid;
        grid-template-columns: 1.05fr 0.95fr;
      }

      .content {
        padding: 3rem;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.55rem;
        margin-bottom: 1.1rem;
        border-radius: 999px;
        border: 1px solid var(--sky-100);
        background: var(--sky-50);
        color: var(--sky-600);
        padding: 0.45rem 0.9rem;
        font-size: 0.76rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0 0 0.9rem;
        font-size: clamp(1.9rem, 3.2vw, 2.8rem);
        line-height: 1.08;
        letter-spacing: -0.03em;
      }

      p {
        margin: 0;
        color: var(--slate-700);
        line-height: 1.7;
        font-size: 1rem;
      }

      .stack {
        display: grid;
        gap: 1rem;
      }

      .meta {
        margin-top: 1.8rem;
        display: grid;
        gap: 0.65rem;
        color: var(--slate-500);
        font-size: 0.95rem;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 0.8rem;
        margin-top: 2rem;
        color: var(--slate-900);
        font-weight: 700;
        letter-spacing: -0.02em;
      }

      .brand-mark {
        display: inline-flex;
        height: 2.6rem;
        width: 2.6rem;
        align-items: center;
        justify-content: center;
        border-radius: 18px;
        background: linear-gradient(145deg, var(--sky-500), var(--sky-600));
        color: white;
        box-shadow: 0 14px 30px rgba(2, 132, 199, 0.24);
      }

      .art-wrap {
        position: relative;
        border-left: 1px solid rgba(226, 232, 240, 0.9);
        background:
          radial-gradient(circle at 78% 22%, rgba(14, 165, 233, 0.16), transparent 22%),
          linear-gradient(145deg, #f6fbff 0%, #eff8ff 46%, #eefcfb 100%);
        display: grid;
        place-items: center;
        padding: 2rem;
      }

      .art-frame {
        width: min(380px, 100%);
        aspect-ratio: 1.12;
        border-radius: 28px;
        border: 1px solid rgba(186, 230, 253, 0.9);
        background: rgba(255, 255, 255, 0.82);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
        display: grid;
        place-items: center;
      }

      @media (max-width: 920px) {
        .layout {
          grid-template-columns: 1fr;
        }

        .art-wrap {
          border-left: 0;
          border-top: 1px solid rgba(226, 232, 240, 0.9);
          padding-top: 1.4rem;
        }

        .content {
          padding: 2.1rem 1.5rem;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell" role="main" aria-labelledby="maintenance-title">
      <div class="layout">
        <section class="content">
          <div class="badge">Scheduled Maintenance</div>
          <div class="stack">
            <h1 id="maintenance-title">MarkingDesk is temporarily unavailable</h1>
            <p>
              We are applying updates to the marking workspace to keep allocation, grading, moderation,
              and review workflows fast and reliable.
            </p>
            <p>
              Please check back shortly. Any links or notifications from MarkingDesk will start working
              again as soon as maintenance is complete.
            </p>
          </div>

          <div class="meta">
            <div>Thank you for your patience while this update is being completed.</div>
          </div>

          <div class="brand" aria-label="MarkingDesk">
            <span class="brand-mark" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.5 9.2L12 4L21.5 9.2L12 14.4L2.5 9.2Z" fill="currentColor"/>
                <path d="M6.5 11.4V15.1C6.5 15.1 8.4 18 12 18C15.6 18 17.5 15.1 17.5 15.1V11.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M21.5 9.2V15.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </span>
            <span>MarkingDesk</span>
          </div>
        </section>

        <aside class="art-wrap" aria-hidden="true">
          <div class="art-frame">
            <svg width="320" height="280" viewBox="0 0 320 280" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="34" y="42" width="252" height="162" rx="22" fill="white" stroke="#BAE6FD" stroke-width="2"/>
              <rect x="58" y="66" width="204" height="104" rx="16" fill="#F0F9FF"/>
              <rect x="122" y="214" width="76" height="12" rx="6" fill="#7DD3FC"/>
              <path d="M160 92L212 120L160 148L108 120L160 92Z" fill="#0EA5E9"/>
              <path d="M126 132V152C126 152 139 168 160 168C181 168 194 152 194 152V132" stroke="#0284C7" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M212 120V160" stroke="#0284C7" stroke-width="6" stroke-linecap="round"/>
              <circle cx="212" cy="171" r="9" fill="#5EEAD4"/>
              <rect x="82" y="186" width="156" height="8" rx="4" fill="#BFDBFE"/>
              <rect x="96" y="201" width="128" height="8" rx="4" fill="#DBEAFE"/>
            </svg>
          </div>
        </aside>
      </div>
    </main>
  </body>
</html>`;

  return new NextResponse(maintenanceHtml, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Retry-After": "3600",
    },
  });
}

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (process.env.MAINTENANCE_MODE === "true") {
    return renderMaintenanceResponse();
  }

  if (!isProtectedPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  return authMiddleware(request as Parameters<typeof authMiddleware>[0], event);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
