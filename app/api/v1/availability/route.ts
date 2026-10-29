import { createHash } from "crypto";
import { guardRateLimit, jsonWith } from "@/lib/api";
import { problem } from "@/lib/problems";
import { getAvailability } from "@/lib/scheduling-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = await guardRateLimit(request, "availability");
  if (!limited.ok) return limited.response;
  const availability = await getAvailability();
  if ("code" in availability) {
    return problem(availability.code, availability.error, undefined, limited.headers);
  }
  const body = JSON.stringify(availability);
  const etag = `"${createHash("sha256").update(body).digest("hex").slice(0, 32)}"`;
  limited.headers.set("ETag", etag);
  limited.headers.set("Cache-Control", "private, max-age=30");
  limited.headers.set("Vary", "Accept");
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: limited.headers });
  }
  return jsonWith(availability, limited.headers);
}
