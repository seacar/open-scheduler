export function siteBase(fallback = ""): string {
  return (process.env.NEXT_PUBLIC_BASE_URL || fallback).replace(/\/$/, "");
}
