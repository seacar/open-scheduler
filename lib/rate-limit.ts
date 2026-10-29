import { createHash } from "crypto";

export type RateBucket = "availability" | "holds" | "bookings";

const POLICIES: Record<RateBucket, { q: number; w: number }> = {
  availability: { q: 60, w: 60 },
  holds: { q: 10, w: 60 },
  bookings: { q: 10, w: 60 },
};

const hits = new Map<string, number[]>();

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

function hashIp(ip: string): string {
  const pepper = process.env.SCHEDULER_SECRET ?? "open-scheduler";
  return createHash("sha256").update(`${pepper}:${ip}`).digest("hex");
}

export function rateLimitHeaders(bucket: RateBucket, remaining: number, resetSeconds: number): Headers {
  const policy = POLICIES[bucket];
  const headers = new Headers();
  headers.set("RateLimit-Policy", `"${bucket}";q=${policy.q};w=${policy.w}`);
  headers.set(
    "RateLimit",
    `"${bucket}";r=${Math.max(0, remaining)};t=${Math.max(0, resetSeconds)}`
  );
  return headers;
}

export async function takeRateLimit(
  bucket: RateBucket,
  ip: string
): Promise<{ ok: true; remaining: number; resetSeconds: number } | { ok: false; resetSeconds: number }> {
  const policy = POLICIES[bucket];
  const now = Date.now();
  const windowStart = now - policy.w * 1000;
  if (hits.size > 1000) {
    for (const [key, stamps] of hits) {
      const newest = stamps[stamps.length - 1] ?? 0;
      if (newest < now - 120_000) hits.delete(key);
    }
  }

  const key = `${bucket}:${hashIp(ip)}`;
  const recent = (hits.get(key) ?? []).filter((stamp) => stamp >= windowStart);
  const oldest = recent[0] ?? now;
  const resetSeconds = Math.max(1, Math.ceil((oldest + policy.w * 1000 - now) / 1000));
  if (recent.length >= policy.q) {
    hits.set(key, recent);
    return { ok: false, resetSeconds };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true, remaining: policy.q - recent.length, resetSeconds };
}
