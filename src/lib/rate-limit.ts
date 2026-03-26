type RateLimitEntry = {
  count: number;
  resetAt: number;
};

type RateLimitConfig = {
  key: string;
  limit: number;
  windowMs: number;
};

export class RateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const globalStore = globalThis as typeof globalThis & {
  __markingDeskRateLimitStore?: Map<string, RateLimitEntry>;
};

function getStore(): Map<string, RateLimitEntry> {
  if (!globalStore.__markingDeskRateLimitStore) {
    globalStore.__markingDeskRateLimitStore = new Map<string, RateLimitEntry>();
  }

  return globalStore.__markingDeskRateLimitStore;
}

export function assertRateLimit(config: RateLimitConfig): void {
  const now = Date.now();
  const store = getStore();
  const existing = store.get(config.key);

  if (!existing || existing.resetAt <= now) {
    store.set(config.key, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return;
  }

  if (existing.count >= config.limit) {
    throw new RateLimitError(
      "Too many requests. Please try again later.",
      Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    );
  }

  store.set(config.key, {
    count: existing.count + 1,
    resetAt: existing.resetAt,
  });
}

export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}
