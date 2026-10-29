import { createHash } from "crypto";
import { bookingSkill } from "@/lib/booking-skill";
import { siteBase } from "@/lib/site";

export function GET(request: Request) {
  const origin = siteBase(new URL(request.url).origin);
  const digest = createHash("sha256").update(bookingSkill).digest("hex");
  return Response.json({
    skills: [
      {
        name: "book-a-meeting",
        description: "Hold a slot and send the human the confirm link.",
        url: `${origin}/skills/booking`,
        digest: `sha256:${digest}`,
      },
    ],
  });
}
