"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { confirmPublicHold, previewHold } from "@/app/actions/scheduling-actions";
import { useTimeZone } from "@/hooks/use-time-zone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ConfirmHoldForm({ holdId, sig }: { holdId: string; sig: string }) {
  const timeZone = useTimeZone();
  const [preview, setPreview] = useState<
    | { ok: true; startsAt: string; meetingTitle: string; expired: boolean }
    | { ok: false; error: string }
    | null
  >(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ meetUrl: string | null; cancelPath: string } | null>(null);

  useEffect(() => {
    if (!holdId || !sig) return;
    let ignore = false;
    previewHold(holdId, sig).then((result) => {
      if (!ignore) setPreview(result.ok ? result : { ok: false, error: result.error });
    });
    return () => {
      ignore = true;
    };
  }, [holdId, sig]);

  if (!preview || !timeZone) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading this hold...
        </CardContent>
      </Card>
    );
  }

  if (!preview.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Confirm link</CardTitle>
          <CardDescription>{preview.error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>You are booked</CardTitle>
          <CardDescription>The calendar invite is on its way.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {done.meetUrl ? (
            <Button asChild>
              <a href={done.meetUrl} target="_blank" rel="noreferrer">
                Join Google Meet
              </a>
            </Button>
          ) : null}
          <p className="text-sm">
            <Link href={done.cancelPath} className="text-primary underline-offset-4 hover:underline">
              Cancel this meeting
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  const when = new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(preview.startsAt));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{preview.meetingTitle}</CardTitle>
        <CardDescription>
          {when}. {preview.expired ? "This hold has expired." : "Confirm your name and email to book it."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setSubmitting(true);
            setError(null);
            const result = await confirmPublicHold({
              holdId,
              sig,
              guestName: name,
              guestEmail: email,
              guestNote: note,
            });
            setSubmitting(false);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setDone({ meetUrl: result.meetUrl, cancelPath: result.cancelPath });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Note</Label>
            <Textarea id="note" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          {error ? (
            <p className="text-sm text-red-500" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={submitting || preview.expired}>
            {submitting ? "Booking..." : "Confirm meeting"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
