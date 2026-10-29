import { siteBase } from "@/lib/site";

export function GET(request: Request) {
  const origin = siteBase(new URL(request.url).origin);
  return Response.json(
    {
      linkset: [
        {
          anchor: `${origin}/`,
          "service-desc": [
            {
              href: `${origin}/openapi.json`,
              type: "application/openapi+json",
            },
          ],
        },
      ],
    },
    { headers: { "Content-Type": "application/linkset+json" } }
  );
}
