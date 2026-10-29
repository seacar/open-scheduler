import { cookies } from "next/headers";
import { schedulerSecret, signValue, valuesMatch } from "@/lib/signatures";

const COOKIE = "scheduler_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;

export type AdminSession = {
  sub: string;
  email: string;
  exp: number;
};

export function adminEmails(): string[] {
  return (process.env.SCHEDULER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowlisted(email: string): boolean {
  return adminEmails().includes(email.trim().toLowerCase());
}

export function encodeSession(sub: string, email: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      email: email.toLowerCase(),
      exp: Date.now() + MAX_AGE_SECONDS * 1000,
    })
  ).toString("base64url");
  return `${payload}.${signValue(payload)}`;
}

export function decodeSession(token: string | undefined): AdminSession | null {
  if (!token || !process.env.SCHEDULER_SECRET) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !valuesMatch(signature, signValue(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as AdminSession;
    if (!data.sub || !data.email || typeof data.exp !== "number") return null;
    if (data.exp < Date.now()) return null;
    if (!isAllowlisted(data.email)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function readAdminSession(): Promise<AdminSession | null> {
  const jar = await cookies();
  return decodeSession(jar.get(COOKIE)?.value);
}

export async function writeAdminSession(sub: string, email: string): Promise<void> {
  schedulerSecret();
  const jar = await cookies();
  jar.set(COOKIE, encodeSession(sub, email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export const sessionCookie = {
  name: COOKIE,
  maxAge: MAX_AGE_SECONDS,
};
