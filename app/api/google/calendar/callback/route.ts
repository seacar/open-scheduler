import { timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { encodeSession, sessionCookie } from "@/lib/admin-session";
import { completeGoogleSignIn } from "@/lib/scheduling-store";

export const dynamic = "force-dynamic";

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function redirectAdmin(request: Request, status: "connected" | "denied" | "error" | "session") {
  const base = (process.env.NEXT_PUBLIC_BASE_URL ?? new URL(request.url).origin).replace(/\/$/, "");
  const url = new URL("/admin", base);
  url.searchParams.set("google", status);
  const response = NextResponse.redirect(url);
  response.cookies.set("gcal_oauth_state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const expected = (await cookies()).get("gcal_oauth_state")?.value;

  if (oauthError || !code || !state || !expected || !safeEqual(state, expected)) {
    return redirectAdmin(request, "error");
  }

  const result = await completeGoogleSignIn(code);
  if (!result.ok) return redirectAdmin(request, result.reason);

  const response = redirectAdmin(request, result.calendarConnected ? "connected" : "session");
  response.cookies.set(sessionCookie.name, encodeSession(result.sub, result.email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionCookie.maxAge,
  });
  return response;
}
