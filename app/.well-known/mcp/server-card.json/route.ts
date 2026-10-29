import { serverCard } from "@/lib/server-card";

export function GET(request: Request) {
  return Response.json(serverCard(new URL(request.url).origin));
}
