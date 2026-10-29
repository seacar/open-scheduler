import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { buildGoogleAuthUrl, googleOAuthConfigured } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(new URL("/admin?google=setup", request.url));
  }
  const state = randomBytes(16).toString("base64url");
  const response = NextResponse.redirect(buildGoogleAuthUrl(state));
  response.cookies.set("gcal_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
