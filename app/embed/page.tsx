import type { Metadata } from "next";
import { getPublicSchedule } from "@/app/actions/scheduling-actions";
import { EmbedResize } from "@/components/embed-resize";
import { ScheduleWidget } from "@/components/schedule-widget";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a meeting",
  robots: { index: false, follow: false },
};

export default async function EmbedPage() {
  const initial = await getPublicSchedule();
  return (
    <main>
      <EmbedResize>
        <ScheduleWidget initial={initial} embedded />
      </EmbedResize>
    </main>
  );
}
