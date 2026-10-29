import { createHmac, timingSafeEqual } from "crypto";

export function schedulerSecret(): string {
  const secret = process.env.SCHEDULER_SECRET;
  if (!secret) throw new Error("Missing SCHEDULER_SECRET");
  return secret;
}

export function signValue(value: string): string {
  return createHmac("sha256", schedulerSecret()).update(value).digest("base64url");
}

export function valuesMatch(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function signedMatch(payload: string, signature: string): boolean {
  if (!process.env.SCHEDULER_SECRET || !signature) return false;
  return valuesMatch(signature, signValue(payload));
}
