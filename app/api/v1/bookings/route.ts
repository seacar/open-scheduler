import { authenticateAgent, hasScope } from "@/lib/agent-keys";
import { guardRateLimit, jsonWith, requestOrigin } from "@/lib/api";
import { problem } from "@/lib/problems";
import { bookMeeting } from "@/lib/scheduling-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limited = await guardRateLimit(request, "bookings");
  if (!limited.ok) return limited.response;
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent || !hasScope(agent.scopes, "book")) {
    return problem(
      "unauthorized",
      "Completing a booking requires an agent key with the book scope.",
      undefined,
      limited.headers
    );
  }
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return problem("invalid_input", "Send an Idempotency-Key header.", undefined, limited.headers);
  }
  let body: {
    startsAt?: unknown;
    guestName?: unknown;
    guestEmail?: unknown;
    guestNote?: unknown;
    guestConfirmed?: unknown;
    agent?: { name?: unknown; url?: unknown };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return problem("invalid_input", "Send a JSON booking body.", undefined, limited.headers);
  }
  if (body.guestConfirmed !== true) {
    return problem(
      "invalid_input",
      "guestConfirmed must be true. The human has to confirm the email and the time.",
      undefined,
      limited.headers
    );
  }
  if (typeof body.startsAt !== "string" || typeof body.guestName !== "string" || typeof body.guestEmail !== "string") {
    return problem(
      "invalid_input",
      "startsAt, guestName, and guestEmail are required.",
      undefined,
      limited.headers
    );
  }
  const result = await bookMeeting({
    startsAt: body.startsAt,
    guestName: body.guestName,
    guestEmail: body.guestEmail,
    guestNote: typeof body.guestNote === "string" ? body.guestNote : "",
    source: "agent",
    agentName: typeof body.agent?.name === "string" ? body.agent.name.slice(0, 120) : null,
    agentUrl: typeof body.agent?.url === "string" ? body.agent.url.slice(0, 500) : null,
    idempotencyKey,
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
  return jsonWith(result.booking, limited.headers, 201);
}
