import { Role } from "@prisma/client";

import { sendEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { generateToken, tokenExpiry } from "@/lib/tokens";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InviteUserInput = {
  name: string;
  email: string;
  invitedByName?: string | null;
};

export async function inviteUser(input: InviteUserInput) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!name) {
    throw new Error("Name is required.");
  }

  if (!email || !EMAIL_REGEX.test(email)) {
    throw new Error("A valid email is required.");
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      emailVerified: true,
      name: true,
    },
  });

  if (existingUser?.passwordHash && existingUser.emailVerified) {
    throw new Error("A user with this email already has an active account.");
  }

  let userId = existingUser?.id ?? "";

  if (existingUser) {
    const updated = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        name,
        role: Role.USER,
        passwordHash: null,
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
        role: Role.USER,
      },
      select: { id: true },
    });
    userId = created.id;
  }

  const token = generateToken(24);
  const expiresAt = tokenExpiry(72);

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.emailVerification.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    }),
  ]);

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const setupLink = `${baseUrl}/auth/reset-password?token=${token}`;
  const inviterName = input.invitedByName?.trim() || "A MarkingDesk user";

  await sendEmail(
    email,
    "Welcome to MarkingDesk",
    `Hello ${name},\n\n${inviterName} has invited you to MarkingDesk.\n\nUse the link below to set your password and activate your account:\n${setupLink}\n\nThis link expires in 72 hours.`
  );

  return { email, userId };
}
