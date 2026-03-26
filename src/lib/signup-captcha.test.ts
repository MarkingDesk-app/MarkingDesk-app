import assert from "node:assert/strict";
import test from "node:test";

import { generateSignupCaptchaChallenge, verifySignupCaptchaAnswer } from "./signup-captcha";

function extractAnswer(prompt: string): string {
  const match = prompt.match(/^What is (\d+) ([+-]) (\d+)\?$/);

  if (!match) {
    throw new Error(`Unexpected captcha prompt: ${prompt}`);
  }

  const left = Number.parseInt(match[1] ?? "0", 10);
  const operator = match[2];
  const right = Number.parseInt(match[3] ?? "0", 10);

  return String(operator === "+" ? left + right : left - right);
}

test("signup captcha verifies the generated maths answer", () => {
  const previousSecret = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = "test-signup-captcha-secret";

  try {
    const challenge = generateSignupCaptchaChallenge();
    const answer = extractAnswer(challenge.prompt);

    assert.equal(verifySignupCaptchaAnswer({ token: challenge.token, answer }), true);
  } finally {
    process.env.NEXTAUTH_SECRET = previousSecret;
  }
});

test("signup captcha rejects an incorrect answer", () => {
  const previousSecret = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = "test-signup-captcha-secret";

  try {
    const challenge = generateSignupCaptchaChallenge();

    assert.equal(verifySignupCaptchaAnswer({ token: challenge.token, answer: "999" }), false);
  } finally {
    process.env.NEXTAUTH_SECRET = previousSecret;
  }
});

test("signup captcha rejects a tampered token", () => {
  const previousSecret = process.env.NEXTAUTH_SECRET;
  process.env.NEXTAUTH_SECRET = "test-signup-captcha-secret";

  try {
    const challenge = generateSignupCaptchaChallenge();
    const answer = extractAnswer(challenge.prompt);
    const tamperedToken = `${challenge.token}x`;

    assert.equal(verifySignupCaptchaAnswer({ token: tamperedToken, answer }), false);
  } finally {
    process.env.NEXTAUTH_SECRET = previousSecret;
  }
});
