import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function mediaTypes(accept: string): { type: string; q: number }[] {
  return accept
    .split(",")
    .map((part) => {
      const [type, ...params] = part.trim().split(";");
      const qParam = params.find((param) => param.trim().startsWith("q="));
      const q = qParam ? Number(qParam.trim().slice(2)) : 1;
      return { type: type.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((item) => item.type);
}

function wants(accept: string, target: string): boolean {
  const types = mediaTypes(accept);
  if (types.length === 0) return target === "text/html";
  return types.some((item) => item.q > 0 && (item.type === target || item.type === "*/*"));
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== "/") return NextResponse.next();
  const accept = request.headers.get("accept") ?? "*/*";
  const markdown = wants(accept, "text/markdown");
  const html = wants(accept, "text/html");
  const link = [
    '</llms.txt>; rel="describedby"',
    '</openapi.json>; rel="service-desc"; type="application/openapi+json"',
    '</mcp>; rel="mcp"',
  ].join(", ");

  if (!markdown && !html) {
    return new NextResponse("Not Acceptable", {
      status: 406,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        Vary: "Accept",
        Link: link,
      },
    });
  }

  if (markdown && !html) {
    const url = request.nextUrl.clone();
    url.pathname = "/agent-brief";
    const response = NextResponse.rewrite(url);
    response.headers.append("Vary", "Accept");
    response.headers.set("Link", link);
    return response;
  }

  const response = NextResponse.next();
  response.headers.append("Vary", "Accept");
  response.headers.set("Link", link);
  return response;
}

export const config = {
  matcher: ["/"],
};
