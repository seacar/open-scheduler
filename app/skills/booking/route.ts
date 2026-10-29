import { bookingSkill } from "@/lib/booking-skill";

export function GET() {
  return new Response(bookingSkill, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
