import crypto from "node:crypto";

export function generateToken(length = 24): string {
  return crypto.randomBytes(length).toString("hex");
}

export function tokenExpiry(hours = 24): Date {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + hours);
  return expiresAt;
}
