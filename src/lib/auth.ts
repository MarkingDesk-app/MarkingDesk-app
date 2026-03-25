import { Role } from "@prisma/client";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import AzureADProvider from "next-auth/providers/azure-ad";
import { compare } from "bcryptjs";

import { sendEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { generateToken, tokenExpiry } from "@/lib/tokens";

function getDisplayName(name: string | null | undefined, email: string): string {
  if (name?.trim()) {
    return name.trim();
  }
  return email.split("@")[0] ?? "User";
}

const azureEnabled = process.env.AZURE_AD_ENABLED === "true";
const localAuthEnabled = process.env.LOCAL_AUTH_ENABLED !== "false";
const hasAzureConfig =
  Boolean(process.env.AZURE_AD_CLIENT_ID) &&
  Boolean(process.env.AZURE_AD_CLIENT_SECRET) &&
  Boolean(process.env.AZURE_AD_TENANT_ID);

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    ...(azureEnabled && hasAzureConfig
      ? [
          AzureADProvider({
            clientId: process.env.AZURE_AD_CLIENT_ID ?? "",
            clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
            tenantId: process.env.AZURE_AD_TENANT_ID ?? "",
            authorization: { params: { scope: "openid profile email" } },
          }),
        ]
      : []),
    ...(localAuthEnabled
      ? [
          CredentialsProvider({
            name: "Credentials",
            credentials: {
              email: { label: "Email", type: "email" },
              password: { label: "Password", type: "password" },
            },
            async authorize(credentials) {
              const normalizedEmail = credentials?.email?.trim().toLowerCase();
              const password = credentials?.password;

              if (!normalizedEmail || !password) {
                throw new Error("Invalid email or password");
              }

              const user = await prisma.user.findUnique({
                where: { email: normalizedEmail },
                select: {
                  id: true,
                  name: true,
                  email: true,
                  role: true,
                  passwordHash: true,
                  emailVerified: true,
                },
              });

              if (!user?.passwordHash) {
                throw new Error("Invalid email or password");
              }

              const isPasswordValid = await compare(password, user.passwordHash);
              if (!isPasswordValid) {
                throw new Error("Invalid email or password");
              }

              if (!user.emailVerified) {
                const token = generateToken(24);
                const expiresAt = tokenExpiry(24);

                await prisma.$transaction([
                  prisma.emailVerification.deleteMany({ where: { userId: user.id } }),
                  prisma.emailVerification.create({
                    data: {
                      userId: user.id,
                      token,
                      expiresAt,
                    },
                  }),
                ]);

                const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
                const verifyLink = `${baseUrl}/auth/verify-email?token=${token}`;

                await sendEmail(
                  user.email,
                  "Verify your MarkingDesk account",
                  `Hello ${user.name},\n\nPlease verify your email by visiting the link below:\n${verifyLink}\n\nIf you did not request this, you can ignore this email.`
                );

                throw new Error("Email not verified");
              }

              return {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
              };
            },
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/auth/sign-in",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "azure-ad") {
        return true;
      }

      if (!user.email) return false;

      const normalizedEmail = user.email.toLowerCase();
      const displayName = getDisplayName(user.name, normalizedEmail);
      const now = new Date();

      await prisma.user.upsert({
        where: { email: normalizedEmail },
        update: {
          name: displayName,
          emailVerified: now,
        },
        create: {
          email: normalizedEmail,
          name: displayName,
          emailVerified: now,
        },
      });

      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      }

      if (user?.role) {
        token.role = user.role;
      }

      if (!token.email || typeof token.email !== "string") {
        return token;
      }

      const dbUser = await prisma.user.findUnique({
        where: { email: token.email.toLowerCase() },
        select: { id: true, role: true, name: true },
      });

      if (dbUser) {
        token.userId = dbUser.id;
        token.role = dbUser.role;
        token.name = dbUser.name;
      } else {
        token.role = Role.MARKER;
      }

      return token;
    },
    async session({ session, token }) {
      if (!session.user) {
        return session;
      }

      if (token.userId && typeof token.userId === "string") {
        session.user.id = token.userId;
      }

      if (token.role && typeof token.role === "string") {
        session.user.role = token.role as Role;
      }

      return session;
    },
  },
};
