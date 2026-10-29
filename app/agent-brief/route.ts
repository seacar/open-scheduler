import { getAvailability } from "@/lib/scheduling-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const availability = await getAvailability();
  const connected = "calendarConnected" in availability && availability.calendarConnected;
  const slots = "slots" in availability ? availability.slots : [];
  const zone = "hostTimeZone" in availability ? availability.hostTimeZone : "UTC";
  const duration = "durationMinutes" in availability ? availability.durationMinutes : 30;
  const title = "meetingTitle" in availability ? availability.meetingTitle : "Meeting";
  const notice = "minNoticeMinutes" in availability ? availability.minNoticeMinutes : 0;
  const horizon = "horizonDays" in availability ? availability.horizonDays : 0;
  const lines = [
    `# ${title}`,
    "",
    connected
      ? `Duration: ${duration} minutes. Host timezone: ${zone}. Minimum notice: ${notice} minutes. Horizon: ${horizon} days.`
      : "Scheduling is temporarily unavailable. Open times stay hidden until Google Calendar is connected.",
    "",
    "## Open slots",
    "",
    slots.length > 0 ? slots.map((slot) => `- ${slot}`).join("\n") : "- None right now.",
    "",
    "## How an agent books",
    "",
    "Show these times to the human. Hold only the slot they pick with POST /api/v1/holds, then send them confirmUrl. The hold lasts five minutes.",
    "Completing a meeting without that page requires an agent key with book scope, an Idempotency-Key, and guestConfirmed true.",
    "",
    "Documents: /llms.txt, /openapi.json, /mcp, /skills/booking.",
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Vary: "Accept",
    },
  });
}
