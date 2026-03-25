const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP_NAME = "MarkingDesk";
const URL_REGEX = /https?:\/\/[^\s<]+/g;

function extractEmail(input?: string | null): string | null {
  if (!input) return null;
  const match = input.match(/([^\s<]+@[^\s>]+)/);
  return match ? (match[1] ?? match[0] ?? null) : null;
}

type SendEmailOptions = {
  cc?: string[];
};

function normalizeRecipients(recipients: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      recipients
        .map((recipient) => recipient?.trim())
        .filter((recipient): recipient is string => Boolean(recipient))
    )
  );
}

function logMockEmail(to: string, subject: string, message: string, cc?: string[]): void {
  const ccLine = cc && cc.length > 0 ? `\nCC: ${cc.join(", ")}` : "";
  // Keep a visible audit trail in server logs when real delivery is not configured.
  console.log(`\n[Mock Email]\nTo: ${to}${ccLine}\nSubject: ${subject}\n\n${message}\n`);
}

function getAppUrl(): string {
  return (process.env.NEXTAUTH_URL || "https://markingdesk.app").trim().replace(/\/$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function withLinkedUrls(value: string): string {
  let lastIndex = 0;
  const parts: string[] = [];

  for (const match of value.matchAll(URL_REGEX)) {
    const matchedUrl = match[0];
    const startIndex = match.index ?? 0;
    const endIndex = startIndex + matchedUrl.length;

    parts.push(escapeHtml(value.slice(lastIndex, startIndex)));
    parts.push(
      `<a href="${escapeHtml(matchedUrl)}" style="color:#0284c7;text-decoration:none;font-weight:600;">${escapeHtml(matchedUrl)}</a>`
    );
    lastIndex = endIndex;
  }

  parts.push(escapeHtml(value.slice(lastIndex)));
  return parts.join("");
}

function brandSubject(subject: string): string {
  const trimmed = subject.trim();
  return trimmed.startsWith(`[${APP_NAME}]`) ? trimmed : `[${APP_NAME}] ${trimmed}`;
}

function brandMessage(message: string): string {
  return message.trim();
}

function getEmailLogoUrl(): string {
  const envLogoUrl = (process.env.EMAIL_LOGO_URL || "").trim();
  if (envLogoUrl) {
    return envLogoUrl;
  }

  return `${getAppUrl()}/icon.svg`;
}

function renderHtmlMessageBody(message: string): string {
  const blocks = message
    .trim()
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((block) => block.length > 0);

  return blocks
    .map((block) => {
      const isBulletBlock = block.every((line) => line.startsWith("- "));

      if (isBulletBlock) {
        return [
          '<ul style="margin:0;padding-left:20px;color:#334155;">',
          ...block.map(
            (line) =>
              `<li style="margin:0 0 8px;">${withLinkedUrls(line.slice(2))}</li>`
          ),
          "</ul>",
        ].join("");
      }

      return block
        .map(
          (line) =>
            `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.7;">${withLinkedUrls(line)}</p>`
        )
        .join("");
    })
    .join('<div style="height:10px;line-height:10px;">&nbsp;</div>');
}

function buildHtmlTemplate(subject: string, message: string): string {
  const logoUrl = getEmailLogoUrl();
  const safeTitle = escapeHtml(subject);
  const safeAppUrl = escapeHtml(getAppUrl());
  const safeAppName = escapeHtml(APP_NAME);
  const safeLogoUrl = escapeHtml(logoUrl);
  const messageHtml = renderHtmlMessageBody(message);

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef4fb;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <div style="padding:32px 12px;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f3;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(15,23,42,0.08);">
        <div style="padding:28px 32px;background:linear-gradient(180deg,#f8fbff 0%,#eef6ff 100%);border-bottom:1px solid #dbe7f3;">
          <div style="display:flex;align-items:center;gap:14px;">
            <div style="width:56px;height:56px;border-radius:18px;background:#0284c7;text-align:center;line-height:56px;">
              <img src="${safeLogoUrl}" alt="${safeAppName}" style="width:32px;height:32px;vertical-align:middle;display:inline-block;" />
            </div>
            <div>
              <div style="font-size:28px;line-height:1.1;font-weight:700;color:#0f172a;">${safeAppName}</div>
              <div style="margin-top:4px;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#64748b;">
                Marking And Moderation Workspace
              </div>
            </div>
          </div>
        </div>

        <div style="padding:32px;">
          <div style="display:inline-block;margin-bottom:16px;padding:6px 12px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
            Notification
          </div>
          <h1 style="margin:0 0 20px;font-size:26px;line-height:1.2;font-weight:700;color:#0f172a;">${safeTitle}</h1>
          <div style="font-size:15px;line-height:1.7;color:#334155;">
            ${messageHtml}
          </div>

          <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;">
            <p style="margin:0 0 10px;color:#475569;font-size:13px;line-height:1.6;">
              This message was sent by MarkingDesk. The sending email address may use another domain, but this notification relates to your MarkingDesk account and workflow.
            </p>
            <p style="margin:0;font-size:13px;line-height:1.6;">
              <a href="${safeAppUrl}" style="color:#0284c7;text-decoration:none;font-weight:600;">Open MarkingDesk</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>
`;
}

export async function sendEmail(
  to: string,
  subject: string,
  message: string,
  options: SendEmailOptions = {}
): Promise<void> {
  const recipient = extractEmail(to);
  if (!recipient || !EMAIL_REGEX.test(recipient)) {
    throw new Error("Invalid recipient email address");
  }

  const ccRecipients = normalizeRecipients(options.cc ?? [])
    .map((recipientEmail) => extractEmail(recipientEmail))
    .filter((recipientEmail): recipientEmail is string => recipientEmail !== null && EMAIL_REGEX.test(recipientEmail));
  const brandedSubject = brandSubject(subject);
  const brandedMessage = brandMessage(message);
  const brandedHtml = buildHtmlTemplate(brandedSubject, brandedMessage);

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
    logMockEmail(recipient, brandedSubject, brandedMessage, ccRecipients);
    return;
  }

  const body = new URLSearchParams({
    from: fromRaw,
    to: recipient,
    subject: brandedSubject,
    text: brandedMessage,
    html: brandedHtml,
  });

  if (ccRecipients.length > 0) {
    body.set("cc", ccRecipients.join(", "));
  }

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
