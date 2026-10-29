import { openApiDocument } from "@/lib/openapi";
import { siteBase } from "@/lib/site";

export function GET(request: Request) {
  const origin = siteBase(new URL(request.url).origin);
  return Response.json(openApiDocument(origin), {
    headers: { "Content-Type": "application/openapi+json" },
  });
}
