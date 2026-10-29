import { guardRateLimit, jsonWith, requestOrigin } from "@/lib/api";
import { problem } from "@/lib/problems";
import { createHold } from "@/lib/scheduling-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await guardRateLimit(request, "holds");
  if (!limited.ok) return limited.response;
  let body: { startsAt?: unknown; agent?: { name?: unknown; url?: unknown } };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return problem("invalid_input", "Send a JSON body with startsAt.", undefined, limited.headers);
  }
  if (typeof body.startsAt !== "string") {
    return problem("invalid_input", "startsAt must be an ISO timestamp.", undefined, limited.headers);
  }
  const agentName = typeof body.agent?.name === "string" ? body.agent.name.slice(0, 120) : null;
  const agentUrl = typeof body.agent?.url === "string" ? body.agent.url.slice(0, 500) : null;
  const result = await createHold({
    startsAt: body.startsAt,
    agentName,
    agentUrl,
    origin: requestOrigin(request),
  });
  if (!result.ok) {
    return problem(
      result.code,
      result.error,
      result.nextSlots ? { nextSlots: result.nextSlots } : undefined,
      limited.headers
    );
  }
  return jsonWith(
    {
      holdId: result.holdId,
      startsAt: result.startsAt,
      endsAt: result.endsAt,
      expiresAt: result.expiresAt,
      confirmUrl: result.confirmUrl,
    },
    limited.headers,
    201
  );
}
