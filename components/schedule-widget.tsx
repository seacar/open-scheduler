"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, CalendarClock, Loader2 } from "lucide-react";
import { bookPublicSlot, getPublicSchedule } from "@/app/actions/scheduling-actions";
import { useTimeZone } from "@/hooks/use-time-zone";
import type { ScheduleView, ScheduleViewFailure } from "@/lib/scheduling-types";
import { SchedulingStatusCard } from "@/components/scheduling-status-card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ViewState = ScheduleView | ScheduleViewFailure | null;

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function keyToDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function zonedDateKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function zonedTimeLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function zonedBookingLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function zonedDateTimeLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(iso));
}

const swapEase = [0.22, 1, 0.36, 1] as const;

const fieldFocus =
  "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:shadow-[0_14px_22px_-14px_hsl(var(--primary))]";

const swapVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 28 : -28,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({
    x: direction > 0 ? -28 : 28,
    opacity: 0,
  }),
};

function safeMeetUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function ScheduleWidget({
  initial = null,
}: {
  initial?: ViewState;
}) {
  const timeZone = useTimeZone();
  const [view, setView] = useState<ViewState>(initial);
  const [pickedDate, setPickedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [swapDirection, setSwapDirection] = useState(1);
  const reduceMotion = useReducedMotion();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    startsAt: string;
    meetUrl: string | null;
    cancelPath: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicSchedule().then((result) => {
      if (!cancelled) setView(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const slotsByDay = useMemo(() => {
    const grouped = new Map<string, string[]>();
    if (!timeZone || !view?.ok) return grouped;
    for (const slot of view.slots) {
      const key = zonedDateKey(slot, timeZone);
      const current = grouped.get(key) ?? [];
      current.push(slot);
      grouped.set(key, current);
    }
    return grouped;
  }, [timeZone, view]);

  const firstSlotDate = useMemo(() => {
    const firstKey = [...slotsByDay.keys()].sort()[0];
    return firstKey ? keyToDate(firstKey) : undefined;
  }, [slotsByDay]);
  const selectedDate = pickedDate ?? firstSlotDate;
  const selectedKey = selectedDate ? dateKey(selectedDate) : null;
  const daySlots = selectedKey ? (slotsByDay.get(selectedKey) ?? []) : [];

  if (!view) {
    return (
      <Card className="rounded-lg border border-border bg-card/30">
        <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading open times...
        </CardContent>
      </Card>
    );
  }

  if (!view.ok) {
    if (view.reason === "not_ready") {
      return (
        <SchedulingStatusCard
          icon={CalendarClock}
          tone="warning"
          title="Scheduling is not open yet"
          description={view.error}
        />
      );
    }
    return (
      <SchedulingStatusCard
        icon={AlertCircle}
        tone="error"
        title="Scheduling is temporarily unavailable"
        description={view.error}
      />
    );
  }

  if (!timeZone) {
    return (
      <Card className="rounded-lg border border-border bg-card/30">
        <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading open times...
        </CardContent>
      </Card>
    );
  }

  if (confirmation) {
    const meetUrl = safeMeetUrl(confirmation.meetUrl);
    return (
      <Card className="rounded-lg border border-border bg-card/30">
        <CardHeader>
          <CardTitle>You are booked</CardTitle>
          <CardDescription>
            {zonedDateTimeLabel(confirmation.startsAt, timeZone)}. A calendar
            invite is on its way.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {meetUrl ? (
            <Button asChild>
              <a href={meetUrl} target="_blank" rel="noreferrer">
                Join Google Meet
              </a>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              The invite does not include a video link yet. Check the calendar
              email for the meeting details.
            </p>
          )}
          {confirmation.cancelPath.startsWith("/schedule/cancel?") ? (
            <p className="text-sm">
              <Link
                href={confirmation.cancelPath}
                className="text-primary underline-offset-4 hover:underline"
              >
                Cancel this meeting
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const title = view.meetingTitle;
  const duration = view.durationMinutes;
  const hostTimeZone = view.hostTimeZone;

  return (
    <Card className="rounded-lg border border-border bg-card/30">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {duration} minutes. Hours are set in {hostTimeZone}. Times are shown
          in {timeZone}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {view.slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No open times right now.
          </p>
        ) : (
          <div className="relative overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false} custom={swapDirection}>
              {selectedSlot ? (
          <motion.form
            key="details"
            className="space-y-4"
            custom={swapDirection}
            variants={reduceMotion ? undefined : swapVariants}
            initial={reduceMotion ? false : "enter"}
            animate="center"
            exit={reduceMotion ? { opacity: 0 } : "exit"}
            transition={
              reduceMotion ? { duration: 0 } : { duration: 0.28, ease: swapEase }
            }
            onSubmit={async (event) => {
              event.preventDefault();
              setSubmitting(true);
              setFormError(null);
              const result = await bookPublicSlot({
                startsAt: selectedSlot,
                guestName: name,
                guestEmail: email,
                guestNote: note,
              });
              setSubmitting(false);
              if (!result.ok) {
                setFormError(result.error);
                return;
              }
              setConfirmation({
                startsAt: result.startsAt,
                meetUrl: result.meetUrl,
                cancelPath: result.cancelPath,
              });
            }}
          >
            <div className="space-y-1">
              <button
                type="button"
                className="text-sm text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSwapDirection(-1);
                  setSelectedSlot(null);
                  setFormError(null);
                }}
              >
                Choose a different time
              </button>
              <p className="text-sm font-medium">
                {zonedDateTimeLabel(selectedSlot, timeZone)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-name">Name</Label>
              <Input
                id="guest-name"
                name="name"
                autoComplete="name"
                className={fieldFocus}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-email">Email</Label>
              <Input
                id="guest-email"
                name="email"
                type="email"
                autoComplete="email"
                className={fieldFocus}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-note">Note</Label>
              <Textarea
                id="guest-note"
                name="note"
                className={fieldFocus}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional"
              />
            </div>
            {formError ? (
              <p className="text-sm text-red-500" role="alert">
                {formError}
              </p>
            ) : null}
            <Button type="submit" className="h-auto whitespace-normal" disabled={submitting}>
              {submitting
                ? "Booking..."
                : `Book ${zonedBookingLabel(selectedSlot, timeZone)}`}
            </Button>
          </motion.form>
              ) : (
          <motion.div
            key="times"
            className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)]"
            custom={swapDirection}
            variants={reduceMotion ? undefined : swapVariants}
            initial={reduceMotion ? false : "enter"}
            animate="center"
            exit={reduceMotion ? { opacity: 0 } : "exit"}
            transition={
              reduceMotion ? { duration: 0 } : { duration: 0.28, ease: swapEase }
            }
          >
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (!date) return;
                setPickedDate(date);
                setSelectedSlot(null);
                setFormError(null);
              }}
              disabled={(date) => !slotsByDay.has(dateKey(date))}
              classNames={{
                cell: "relative h-9 w-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
                day_today:
                  "!bg-transparent !text-foreground ring-1 ring-inset ring-primary hover:!bg-transparent hover:!text-foreground focus:!bg-transparent focus:!text-foreground aria-selected:!bg-transparent aria-selected:!text-foreground",
              }}
            />
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {selectedDate
                  ? selectedDate.toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                    })
                  : "Choose a day"}
              </p>
              {daySlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No open times on this day.
                </p>
              ) : (
                <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                  {daySlots.map((slot) => (
                    <Button
                      key={slot}
                      type="button"
                      className="w-full"
                      variant="outline"
                      onClick={() => {
                        setSwapDirection(1);
                        setSelectedSlot(slot);
                        setFormError(null);
                      }}
                    >
                      {zonedTimeLabel(slot, timeZone)}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <p className="text-sm">
          <Link href="/" className="text-primary underline-offset-4 hover:underline">
            Back to site
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
