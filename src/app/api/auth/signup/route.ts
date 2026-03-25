import { Role } from "@prisma/client";
import { hash } from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { sendEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { generateToken, tokenExpiry } from "@/lib/tokens";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SignupBody = {
  name?: string;
  email?: string;
  password?: string;
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
  const password = body.password ?? "";

  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });

    const passwordHash = await hash(password, 10);

    let userId: string;
    if (existingUser) {
      if (existingUser.passwordHash) {
        return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
      }

      const updated = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name,
          passwordHash,
          emailVerified: null,
        },
        select: { id: true },
      });
      userId = updated.id;
    } else {
      const created = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          role: Role.MARKER,
        },
        select: { id: true },
      });
      userId = created.id;
    }

    const token = generateToken(24);
    const expiresAt = tokenExpiry(48);

    await prisma.$transaction([
      prisma.emailVerification.deleteMany({ where: { userId } }),
      prisma.emailVerification.create({
        data: {
          userId,
          token,
          expiresAt,
        },
      }),
    ]);

    const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin || "http://localhost:3000";
    const verifyLink = `${baseUrl}/auth/verify-email?token=${token}`;

    await sendEmail(
      email,
      "Activate your MarkingDesk account",
      `Hello ${name},\n\nPlease verify your email by visiting the link below:\n${verifyLink}\n\nIf you did not create this account, you can ignore this email.`
    );

    return NextResponse.json(
      { message: "Account created. Please check your email to activate your account." },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error", error);
    return NextResponse.json({ error: "Unable to create account right now" }, { status: 500 });
  }
}
