"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import {
  cancelPublicBooking,
  previewCancellation,
} from "@/app/actions/scheduling-actions";
import { useTimeZone } from "@/hooks/use-time-zone";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function CancelBookingForm({
  bookingId,
  sig,
}: {
  bookingId: string;
  sig: string;
}) {
  const timeZone = useTimeZone();
  const [preview, setPreview] = useState<
    | { ok: true; startsAt: string; status: string; meetingTitle: string }
    | { ok: false; error: string }
    | null
  >(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookingId || !sig) return;
    let ignore = false;
    previewCancellation(bookingId, sig).then((result) => {
      if (!ignore) setPreview(result);
    });
    return () => {
      ignore = true;
    };
  }, [bookingId, sig]);

  if (!bookingId || !sig) {
    return (
      <Card className="rounded-lg border border-border bg-card/30">
        <CardHeader>
          <CardTitle>Cancel meeting</CardTitle>
          <CardDescription>This cancel link is not valid.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!preview || !timeZone) {
    return (
      <Card className="rounded-lg border border-border bg-card/30">
        <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking this meeting...
        </CardContent>
      </Card>
    );
  }

  if (!preview.ok) {
    return (
      <Card className="rounded-lg border border-border bg-card/30">
        <CardHeader>
          <CardTitle>Cancel meeting</CardTitle>
          <CardDescription>{preview.error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const when = new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(preview.startsAt));
  const alreadyCancelled = cancelled || preview.status === "cancelled";

  return (
    <Card className="rounded-lg border border-border bg-card/30">
      <CardHeader>
        <CardTitle>{preview.meetingTitle}</CardTitle>
        <CardDescription>{when}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {alreadyCancelled ? (
          <p className="text-sm">This meeting is cancelled.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Cancelling removes it from the calendar and frees the time.
            </p>
            {error ? (
              <p className="text-sm text-red-500" role="alert">
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              disabled={cancelling}
              onClick={async () => {
                setCancelling(true);
                setError(null);
                const result = await cancelPublicBooking(bookingId, sig);
                setCancelling(false);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setCancelled(true);
              }}
            >
              {cancelling ? "Cancelling..." : "Cancel meeting"}
            </Button>
          </>
        )}
        <p className="text-sm">
          <Link href="/schedule" className="text-primary underline-offset-4 hover:underline">
            Back to scheduling
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
