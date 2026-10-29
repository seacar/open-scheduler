import type { Metadata } from "next";
import { ScheduleWidget } from "@/components/schedule-widget";
import { getPublicSchedule } from "@/app/actions/scheduling-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a meeting",
  description: "Pick a time to meet.",
  other: {
    "is-agentic-site-type": "app",
  },
};

export default async function HomePage() {
  const initial = await getPublicSchedule();
  return (
    <main className="min-h-dvh bg-background px-4 py-12 text-foreground">
      <div className="mx-auto max-w-3xl">
        <ScheduleWidget initial={initial} />
      </div>
    </main>
  );
}
