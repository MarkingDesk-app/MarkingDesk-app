import crypto from "node:crypto";

const CAPTCHA_TTL_MS = 15 * 60 * 1000;

type CaptchaPayload = {
  left: number;
  right: number;
  operator: "+" | "-";
  expiresAt: number;
  nonce: string;
};

export type SignupCaptchaChallenge = {
  prompt: string;
  token: string;
  expiresAt: string;
};

function getCaptchaSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET?.trim();

  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is required for signup captcha.");
  }

  return secret;
}

function encodePayload(payload: CaptchaPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(encodedPayload: string): CaptchaPayload | null {
  try {
    const decoded = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const payload = JSON.parse(decoded) as Partial<CaptchaPayload>;

    if (
      typeof payload.left !== "number" ||
      typeof payload.right !== "number" ||
      (payload.operator !== "+" && payload.operator !== "-") ||
      typeof payload.expiresAt !== "number" ||
      typeof payload.nonce !== "string"
    ) {
      return null;
    }

    return {
      left: payload.left,
      right: payload.right,
      operator: payload.operator,
      expiresAt: payload.expiresAt,
      nonce: payload.nonce,
    };
  } catch {
    return null;
  }
}

function signPayload(encodedPayload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function calculateAnswer(payload: Pick<CaptchaPayload, "left" | "right" | "operator">): number {
  return payload.operator === "+" ? payload.left + payload.right : payload.left - payload.right;
}

function buildPrompt(payload: Pick<CaptchaPayload, "left" | "right" | "operator">): string {
  return `What is ${payload.left} ${payload.operator} ${payload.right}?`;
}

export function generateSignupCaptchaChallenge(): SignupCaptchaChallenge {
  const secret = getCaptchaSecret();
  const operator: "+" | "-" = crypto.randomInt(0, 2) === 0 ? "+" : "-";
  let left = crypto.randomInt(2, 10);
  let right = crypto.randomInt(1, 10);

  if (operator === "-" && right > left) {
    [left, right] = [right, left];
  }

  const payload: CaptchaPayload = {
    left,
    right,
    operator,
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
    nonce: crypto.randomBytes(8).toString("hex"),
  };
  const encodedPayload = encodePayload(payload);
  const signature = signPayload(encodedPayload, secret);

  return {
    prompt: buildPrompt(payload),
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

export function verifySignupCaptchaAnswer(input: { token: string; answer: string }): boolean {
  const secret = getCaptchaSecret();
  const normalizedToken = input.token.trim();
  const normalizedAnswer = input.answer.trim();

  if (!normalizedToken || !normalizedAnswer) {
    return false;
  }

  const [encodedPayload, providedSignature] = normalizedToken.split(".");

  if (!encodedPayload || !providedSignature) {
    return false;
  }

  const expectedSignature = signPayload(encodedPayload, secret);
  const providedSignatureBuffer = Buffer.from(providedSignature, "utf8");
  const expectedSignatureBuffer = Buffer.from(expectedSignature, "utf8");

  if (
    providedSignatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)
  ) {
    return false;
  }

  const payload = decodePayload(encodedPayload);

  if (!payload || payload.expiresAt < Date.now()) {
    return false;
  }

  if (!/^-?\d+$/.test(normalizedAnswer)) {
    return false;
  }

  return Number.parseInt(normalizedAnswer, 10) === calculateAnswer(payload);
}
