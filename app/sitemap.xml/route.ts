import { siteBase } from "@/lib/site";

export function GET(request: Request) {
  const origin = siteBase(new URL(request.url).origin);
  const urls = ["/", "/llms.txt", "/openapi.json", "/skills/booking"]
    .map((path) => `<url><loc>${origin}${path}</loc></url>`)
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
