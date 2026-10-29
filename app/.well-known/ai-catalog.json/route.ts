import { siteBase } from "@/lib/site";

export function GET(request: Request) {
  const origin = siteBase(new URL(request.url).origin);
  return Response.json({
    mcp_servers: [
      {
        name: "open-scheduler",
        server_card: `${origin}/.well-known/mcp/server-card.json`,
        endpoint: `${origin}/mcp`,
      },
    ],
  });
}
