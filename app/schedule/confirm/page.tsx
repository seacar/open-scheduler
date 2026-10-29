import type { Metadata } from "next";
import { ConfirmHoldForm } from "@/components/confirm-hold-form";

export const metadata: Metadata = {
  title: "Confirm meeting",
  robots: { index: false, follow: false },
};

export default async function ConfirmMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ hold?: string; sig?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-xl">
        <ConfirmHoldForm holdId={params.hold ?? ""} sig={params.sig ?? ""} />
      </div>
    </main>
  );
}
