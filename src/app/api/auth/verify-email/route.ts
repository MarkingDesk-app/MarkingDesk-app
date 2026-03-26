import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { assertRateLimit, getClientIp, RateLimitError } from "@/lib/rate-limit";
import { hashToken } from "@/lib/tokens";

type VerifyBody = {
  token?: string;
};

export async function POST(request: NextRequest) {
  let body: VerifyBody;

  try {
    body = (await request.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  try {
    const clientIp = getClientIp(request.headers);
    const hashedToken = hashToken(token);

    assertRateLimit({
      key: `verify-email:${clientIp}`,
      limit: 20,
      windowMs: 10 * 60 * 1000,
    });

    const verification = await prisma.emailVerification.findFirst({
      where: {
        OR: [{ token: hashedToken }, { token }],
      },
      select: { userId: true, expiresAt: true },
    });

    if (!verification) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    if (verification.expiresAt < new Date()) {
      await prisma.emailVerification.deleteMany({
        where: {
          OR: [{ token: hashedToken }, { token }],
        },
      });
      return NextResponse.json({ error: "Token has expired" }, { status: 410 });
    }

    const user = await prisma.user.findUnique({
      where: { id: verification.userId },
      select: { id: true },
    });

    if (!user) {
      await prisma.emailVerification.deleteMany({
        where: {
          OR: [{ token: hashedToken }, { token }],
        },
      });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      }),
      prisma.emailVerification.deleteMany({
        where: {
          OR: [{ token: hashedToken }, { token }],
        },
      }),
    ]);

    return NextResponse.json({ message: "Email verified" });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    console.error("Verify email error", error);
    return NextResponse.json({ error: "Unable to verify email right now" }, { status: 500 });
  }
}
