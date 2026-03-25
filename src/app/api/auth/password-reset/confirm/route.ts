import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

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
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      select: { userId: true, expiresAt: true },
    });

    if (!resetToken) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    if (resetToken.expiresAt < new Date()) {
      await prisma.passwordResetToken.delete({ where: { token } });
      return NextResponse.json({ error: "Token has expired" }, { status: 410 });
    }

    const user = await prisma.user.findUnique({
      where: { id: resetToken.userId },
      select: { id: true },
    });

    if (!user) {
      await prisma.passwordResetToken.delete({ where: { token } });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const passwordHash = await hash(password, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.delete({ where: { token } }),
    ]);

    return NextResponse.json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Password reset confirm error", error);
    return NextResponse.json({ error: "Unable to reset password right now" }, { status: 500 });
  }
}
