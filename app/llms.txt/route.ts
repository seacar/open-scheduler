import { llmsText } from "@/lib/booking-skill";

export function GET() {
  return new Response(llmsText, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
