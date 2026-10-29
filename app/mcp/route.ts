import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { authenticateAgent, hasScope } from "@/lib/agent-keys";
import { requestOrigin } from "@/lib/api";
import {
  bookMeeting,
  cancelAsAdmin,
  cancelWithSignature,
  createHold,
  getAvailability,
  getBookingRecord,
  listUpcomingBookings,
} from "@/lib/scheduling-store";
import { signedMatch } from "@/lib/signatures";

export const dynamic = "force-dynamic";

function toolResult(value: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    isError,
  };
}

async function handleMcp(request: Request) {
  const server = new McpServer({ name: "open-scheduler", version: "0.1.0" });
  const origin = requestOrigin(request);
  const authorization = request.headers.get("authorization");

  server.registerTool(
    "get_capabilities",
    { description: "Read the host timezone, meeting length, and whether Google Calendar is connected." },
    async () => toolResult(await getAvailability())
  );

  server.registerTool(
    "list_open_slots",
    { description: "List open meeting times as UTC timestamps. Show these to the human before holding one." },
    async () => {
      const availability = await getAvailability();
      if ("code" in availability) return toolResult(availability, true);
      return toolResult({ slots: availability.slots, hostTimeZone: availability.hostTimeZone });
    }
  );

  server.registerTool(
    "hold_slot",
    {
      description: "Hold one slot for five minutes and return a confirm URL the human must open.",
      inputSchema: z.object({
        startsAt: z.string().describe("UTC timestamp from list_open_slots"),
        agentName: z.string().optional(),
        agentUrl: z.string().optional(),
      }),
    },
    async ({ startsAt, agentName, agentUrl }) => {
      const result = await createHold({ startsAt, agentName, agentUrl, origin });
      return toolResult(result, !result.ok);
    }
  );

  server.registerTool(
    "book_meeting",
    {
      description: "Book immediately. Requires a book-scoped agent key and guestConfirmed true.",
      inputSchema: z.object({
        startsAt: z.string(),
        guestName: z.string(),
        guestEmail: z.string(),
        guestNote: z.string().optional(),
        guestConfirmed: z.boolean(),
        idempotencyKey: z.string(),
        agentName: z.string().optional(),
        agentUrl: z.string().optional(),
      }),
    },
    async (args) => {
      const agent = await authenticateAgent(authorization);
      if (!agent || !hasScope(agent.scopes, "book")) {
        return toolResult({ ok: false, code: "unauthorized", error: "A book-scoped agent key is required." }, true);
      }
      if (args.guestConfirmed !== true) {
        return toolResult({ ok: false, code: "invalid_input", error: "guestConfirmed must be true." }, true);
      }
      const result = await bookMeeting({
        startsAt: args.startsAt,
        guestName: args.guestName,
        guestEmail: args.guestEmail,
        guestNote: args.guestNote,
        source: "agent",
        agentName: args.agentName,
        agentUrl: args.agentUrl,
        idempotencyKey: args.idempotencyKey,
        origin,
      });
      return toolResult(result, !result.ok);
    }
  );

  server.registerTool(
    "get_booking",
    {
      description: "Read one booking. Pass the cancel signature, or call with a manage key.",
      inputSchema: z.object({
        bookingId: z.string(),
        sig: z.string().optional(),
      }),
    },
    async ({ bookingId, sig }) => {
      const agent = await authenticateAgent(authorization);
      const allowed = (agent && hasScope(agent.scopes, "manage")) || (sig ? signedMatch(`cancel:${bookingId}`, sig) : false);
      if (!allowed) return toolResult({ ok: false, code: "unauthorized" }, true);
      return toolResult(await getBookingRecord(bookingId));
    }
  );

  server.registerTool(
    "cancel_meeting",
    {
      description: "Cancel a booking with its signature or a manage key.",
      inputSchema: z.object({
        bookingId: z.string(),
        sig: z.string().optional(),
      }),
    },
    async ({ bookingId, sig }) => {
      const agent = await authenticateAgent(authorization);
      if (agent && hasScope(agent.scopes, "manage")) {
        const result = await cancelAsAdmin(bookingId);
        return toolResult(result, !result.ok);
      }
      if (!sig) return toolResult({ ok: false, code: "unauthorized" }, true);
      const result = await cancelWithSignature(bookingId, sig);
      return toolResult(result, !result.ok);
    }
  );

  server.registerTool(
    "list_bookings",
    { description: "List upcoming bookings. Requires a manage-scoped agent key." },
    async () => {
      const agent = await authenticateAgent(authorization);
      if (!agent || !hasScope(agent.scopes, "manage")) {
        return toolResult({ ok: false, code: "unauthorized", error: "A manage-scoped agent key is required." }, true);
      }
      return toolResult(await listUpcomingBookings());
    }
  );

  server.registerResource(
    "capabilities",
    "scheduler://capabilities",
    { description: "Host scheduling constraints and open slots.", mimeType: "application/json" },
    async (uri) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(await getAvailability()),
        },
      ],
    })
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const GET = handleMcp;
export const POST = handleMcp;
export const DELETE = handleMcp;
