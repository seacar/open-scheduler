import { registryManifest } from "@/lib/server-card";

export function GET(request: Request) {
  return Response.json(registryManifest(new URL(request.url).origin));
}
