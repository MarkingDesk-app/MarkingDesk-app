const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractEmail(input?: string | null): string | null {
  if (!input) return null;
  const match = input.match(/([^\s<]+@[^\s>]+)/);
  return match ? (match[1] ?? match[0] ?? null) : null;
}

function logMockEmail(to: string, subject: string, message: string): void {
  // Keep a visible audit trail in server logs when real delivery is not configured.
  console.log(`\n[Mock Email]\nTo: ${to}\nSubject: ${subject}\n\n${message}\n`);
}

export async function sendEmail(to: string, subject: string, message: string): Promise<void> {
  const recipient = extractEmail(to);
  if (!recipient || !EMAIL_REGEX.test(recipient)) {
    throw new Error("Invalid recipient email address");
  }

  const fromRaw = (process.env.MAILGUN_FROM_ADDRESS || "").trim();
  const fromEmail = extractEmail(fromRaw);
  const domain = (process.env.MAILGUN_DOMAIN || "").trim();
  const apiKey = (process.env.MAILGUN_API_KEY || "").trim();
  const apiBaseUrl = (process.env.MAILGUN_API_BASE_URL || "https://api.mailgun.net").trim();

  const missingConfig = !fromEmail || !domain || !apiKey;
  const forceSend = process.env.MAILGUN_FORCE_SEND === "true";
  const useMock = missingConfig || (process.env.NODE_ENV !== "production" && !forceSend);

  if (useMock) {
    if (missingConfig && process.env.NODE_ENV === "production") {
      console.warn("[Email] Mailgun is not configured. Using mock email output.");
    }
    logMockEmail(recipient, subject, message);
    return;
  }

  const body = new URLSearchParams({
    from: fromRaw,
    to: recipient,
    subject,
    text: message,
  });

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const providerError = await response.text().catch(() => "");
    throw new Error(providerError || "Email delivery failed");
  }
}
