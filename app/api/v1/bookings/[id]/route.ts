import { authenticateAgent, hasScope } from "@/lib/agent-keys";
import { bookingIcs } from "@/lib/ics";
import { problem } from "@/lib/problems";
import { getBookingRecord } from "@/lib/scheduling-store";
import { signedMatch } from "@/lib/signatures";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const sig = url.searchParams.get("sig") ?? "";
  const agent = await authenticateAgent(request.headers.get("authorization"));
  const allowed = (agent && hasScope(agent.scopes, "manage")) || signedMatch(`cancel:${id}`, sig);
  if (!allowed) return problem("unauthorized", "Send the booking signature or a manage key.");
  const result = await getBookingRecord(id);
  if (!result.ok) return problem(result.code, result.error);
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/calendar")) {
    const ics = bookingIcs({
      id: result.booking.id,
      title: result.meetingTitle,
      startsAt: result.booking.startsAt,
      endsAt: result.booking.endsAt,
      description: result.booking.meetUrl ?? "",
    });
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        Vary: "Accept",
      },
    });
  }
  return Response.json({
    ...result.booking,
    meetingTitle: result.meetingTitle,
    ics: bookingIcs({
      id: result.booking.id,
      title: result.meetingTitle,
      startsAt: result.booking.startsAt,
      endsAt: result.booking.endsAt,
      description: result.booking.meetUrl ?? "",
    }),
  });
}
