import { problem } from "@/lib/problems";
import { clientIp, rateLimitHeaders, takeRateLimit, type RateBucket } from "@/lib/rate-limit";

export function requestOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "");
  return configured || new URL(request.url).origin;
}

export async function guardRateLimit(
  request: Request,
  bucket: RateBucket
): Promise<{ ok: true; headers: Headers } | { ok: false; response: Response }> {
  try {
    const result = await takeRateLimit(bucket, clientIp(request));
    const headers = rateLimitHeaders(
      bucket,
      result.ok ? result.remaining : 0,
      result.resetSeconds
    );
    if (!result.ok) {
      headers.set("Retry-After", String(result.resetSeconds));
      return {
        ok: false,
        response: problem("rate_limited", "Too many requests. Try again later.", undefined, headers),
      };
    }
    return { ok: true, headers };
  } catch (error) {
    console.error("Rate limit check failed", error);
    return {
      ok: false,
      response: problem("unavailable", "Scheduling is temporarily unavailable."),
    };
  }
}

export function jsonWith(body: unknown, headers: Headers, status = 200): Response {
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}
