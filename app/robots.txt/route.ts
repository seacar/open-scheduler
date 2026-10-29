export function GET() {
  return new Response(
    ["User-agent: *", "Allow: /", "Disallow: /admin", "Disallow: /api/google/", ""].join("\n"),
    { headers: { "Content-Type": "text/plain; charset=utf-8" } }
  );
}
