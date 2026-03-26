import { NextResponse } from "next/server";

import { generateSignupCaptchaChallenge } from "@/lib/signup-captcha";

export async function GET() {
  try {
    const challenge = generateSignupCaptchaChallenge();

    return NextResponse.json(challenge, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Signup captcha error", error);
    return NextResponse.json({ error: "Captcha is unavailable right now." }, { status: 500 });
  }
}
