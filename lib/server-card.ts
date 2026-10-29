import { siteBase } from "@/lib/site";

export function serverCard(origin: string) {
  const base = siteBase(origin);
  return {
    name: "open-scheduler",
    title: "Open Scheduler",
    version: "0.1.0",
    description: "List open meeting times, hold a slot, and book after a human or a host-issued key confirms.",
    transport: {
      type: "streamable-http",
      url: `${base}/mcp`,
    },
    tools: [
      { name: "get_capabilities", description: "Read duration, timezone, and whether the calendar is connected." },
      { name: "list_open_slots", description: "List open UTC slot timestamps." },
      { name: "hold_slot", description: "Hold one slot and return a confirm URL for the human." },
      { name: "book_meeting", description: "Book with a book-scoped agent key after the human confirms." },
      { name: "get_booking", description: "Read a booking with its cancel signature or a manage key." },
      { name: "cancel_meeting", description: "Cancel a booking with its signature or a manage key." },
      { name: "list_bookings", description: "List upcoming bookings with a manage key." },
    ],
  };
}

export function registryManifest(origin: string) {
  const base = siteBase(origin);
  return {
    name: "open-scheduler",
    description: "Single-host meeting scheduler with a public hold API and a Streamable HTTP MCP server.",
    version: "0.1.0",
    remotes: [{ type: "streamable-http", url: `${base}/mcp` }],
  };
}
