import { NextRequest, NextResponse } from "next/server";

import { sendEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp, RateLimitError } from "@/lib/rate-limit";
import { verifySignupCaptchaAnswer } from "@/lib/signup-captcha";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SignupBody = {
  name?: string;
  email?: string;
  captchaToken?: string;
  captchaAnswer?: string;
};

export async function POST(request: NextRequest) {
  let body: SignupBody;

  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const captchaToken = body.captchaToken?.trim() ?? "";
  const captchaAnswer = body.captchaAnswer?.trim() ?? "";

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  try {
    const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const clientIp = getClientIp(request.headers);

    assertRateLimit({
      key: `signup-request:${clientIp}:${email}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });

    if (!adminEmail || !EMAIL_REGEX.test(adminEmail)) {
      console.error("Signup request error", new Error("ADMIN_EMAIL is not configured."));
      return NextResponse.json({ error: "Account requests are not configured right now." }, { status: 500 });
    }
    if (!verifySignupCaptchaAnswer({ token: captchaToken, answer: captchaAnswer })) {
      return NextResponse.json({ error: "The maths answer was incorrect or expired. Please try again." }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordHash: true,
        emailVerified: true,
      },
    });

    const requestedAt = new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/London",
    }).format(new Date());
    const appUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin || "http://localhost:3000";
    const existingAccountLabel =
      existingUser?.passwordHash && existingUser.emailVerified ? "Existing active account" : "No active account";

    await sendEmail(
      adminEmail,
      "MarkingDesk account request",
      [
        "A new request for a MarkingDesk account has been submitted.",
        "",
        `Name: ${name}`,
        `Email: ${email}`,
        `Requested: ${requestedAt}`,
        `Account status: ${existingAccountLabel}`,
        "",
        `App: ${appUrl}`,
        "Invite this user from the Admin area if access should be granted.",
      ].join("\n")
    );

    return NextResponse.json(
      {
        message:
          "Your request has been sent to the MarkingDesk administrator. You will receive an invitation email if access is approved.",
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    console.error("Signup request error", error);
    return NextResponse.json({ error: "Unable to submit your account request right now" }, { status: 500 });
  }
}
