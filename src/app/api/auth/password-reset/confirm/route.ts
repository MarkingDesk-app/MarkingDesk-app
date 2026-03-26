import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp, RateLimitError } from "@/lib/rate-limit";
import { hashToken } from "@/lib/tokens";

type ConfirmBody = {
  token?: string;
  password?: string;
};

export async function POST(request: NextRequest) {
  let body: ConfirmBody;

  try {
    body = (await request.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const token = body.token?.trim();
  const password = body.password ?? "";

  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  try {
    const clientIp = getClientIp(request.headers);
    const hashedToken = hashToken(token);

    assertRateLimit({
      key: `password-reset-confirm:${clientIp}`,
      limit: 20,
      windowMs: 10 * 60 * 1000,
    });

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        OR: [{ token: hashedToken }, { token }],
      },
      select: { userId: true, expiresAt: true },
    });

    if (!resetToken) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    if (resetToken.expiresAt < new Date()) {
      await prisma.passwordResetToken.deleteMany({
        where: {
          OR: [{ token: hashedToken }, { token }],
        },
      });
      return NextResponse.json({ error: "Token has expired" }, { status: 410 });
    }

    const user = await prisma.user.findUnique({
      where: { id: resetToken.userId },
      select: { id: true, emailVerified: true },
    });

    if (!user) {
      await prisma.passwordResetToken.deleteMany({
        where: {
          OR: [{ token: hashedToken }, { token }],
        },
      });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const passwordHash = await hash(password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          emailVerified: user.emailVerified ?? new Date(),
        },
      }),
      prisma.passwordResetToken.deleteMany({
        where: {
          OR: [{ token: hashedToken }, { token }],
        },
      }),
    ]);

    return NextResponse.json({ message: "Password updated successfully" });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    console.error("Password reset confirm error", error);
    return NextResponse.json({ error: "Unable to reset password right now" }, { status: 500 });
  }
}
