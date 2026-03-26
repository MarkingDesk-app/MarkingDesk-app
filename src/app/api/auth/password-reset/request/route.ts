import { NextRequest, NextResponse } from "next/server";

import { sendEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp, RateLimitError } from "@/lib/rate-limit";
import { generateToken, hashToken, tokenExpiry } from "@/lib/tokens";

type RequestBody = {
  email?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let body: RequestBody;

  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  try {
    const clientIp = getClientIp(request.headers);

    assertRateLimit({
      key: `password-reset-request:${clientIp}:${email}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, passwordHash: true },
    });

    if (user?.passwordHash) {
      const token = generateToken(24);
      const tokenHash = hashToken(token);
      const expiresAt = tokenExpiry(2);

      await prisma.$transaction([
        prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
        prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            token: tokenHash,
            expiresAt,
          },
        }),
      ]);

      const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin || "http://localhost:3000";
      const resetLink = `${baseUrl}/auth/reset-password?token=${token}`;

      await sendEmail(
        user.email,
        "Reset your MarkingDesk password",
        `Hello ${user.name},\n\nReset your password by visiting this link:\n${resetLink}\n\nThis link expires in 2 hours.`
      );
    }

    return NextResponse.json({
      message: "If an account exists for that email, a reset link has been sent.",
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    console.error("Password reset request error", error);
    return NextResponse.json({ error: "Unable to process reset request" }, { status: 500 });
  }
}
