import type { StoreCode } from "@/lib/scheduling-types";

const STATUS: Record<StoreCode, number> = {
  invalid_input: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  slot_taken: 409,
  hold_expired: 409,
  rate_limited: 429,
  unavailable: 503,
};

export function problem(
  code: StoreCode,
  detail: string,
  extra?: Record<string, unknown>,
  headers?: Headers
): Response {
  const status = STATUS[code];
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/problem+json");
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title: code,
      status,
      code,
      detail,
      ...extra,
    }),
    { status, headers: responseHeaders }
  );
}
