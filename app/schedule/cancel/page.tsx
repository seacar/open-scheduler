import type { Metadata } from "next";
import { CancelBookingForm } from "@/components/cancel-booking-form";

export const metadata: Metadata = {
  title: "Cancel meeting",
  robots: { index: false, follow: false },
};

export default async function CancelMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string; sig?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-xl">
        <CancelBookingForm bookingId={params.booking ?? ""} sig={params.sig ?? ""} />
      </div>
    </main>
  );
}
