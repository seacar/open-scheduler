import type { SchedulingSettings, WeekWindow } from "@/lib/scheduling-types";
import {
  addCalendarDays,
  formatZonedParts,
  normalizeHm,
  todayInTimeZone,
  weekdayIndex,
  zonedDateTimeToUtc,
} from "@/lib/scheduling-time";

export type BusyInterval = {
  start: Date;
  end: Date;
};

export type CalendarEventSpan = {
  status?: string;
  eventType?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

const NON_BLOCKING_EVENT_TYPES = new Set(["workingLocation", "birthday"]);

export function busyIntervalsFromEvents(
  events: CalendarEventSpan[],
  timeZone: string
): BusyInterval[] {
  const intervals: BusyInterval[] = [];

  for (const event of events) {
    if (event.status === "cancelled") continue;
    if (NON_BLOCKING_EVENT_TYPES.has(event.eventType ?? "")) continue;
    const self = event.attendees?.find((attendee) => attendee.self);
    if (self?.responseStatus === "declined") continue;

    const startDate = event.start?.date;
    const endDate = event.end?.date;
    if (startDate && endDate && endDate > startDate) {
      let date = startDate;
      while (date < endDate && intervals.length < 500) {
        const next = addCalendarDays(date, 1);
        intervals.push({
          start: zonedDateTimeToUtc(date, "00:00", timeZone),
          end: zonedDateTimeToUtc(next, "00:00", timeZone),
        });
        date = next;
      }
      continue;
    }

    const startTime = event.start?.dateTime;
    const endTime = event.end?.dateTime;
    if (!startTime || !endTime) continue;
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      continue;
    }
    intervals.push({ start, end });
  }

  return intervals;
}

function minutesFromHm(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function hmFromMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function conflicts(
  startMs: number,
  durationMs: number,
  bufferMs: number,
  busy: BusyInterval[]
): boolean {
  const endMs = startMs + durationMs;
  return busy.some((interval) => {
    const busyStart = interval.start.getTime();
    const busyEnd = interval.end.getTime();
    return startMs < busyEnd + bufferMs && endMs + bufferMs > busyStart;
  });
}

export function buildOpenSlots(input: {
  now: Date;
  settings: SchedulingSettings;
  windows: WeekWindow[];
  blockedDates: string[];
  busy: BusyInterval[];
}): Date[] {
  const { now, settings, windows, blockedDates, busy } = input;
  const durationMs = settings.durationMinutes * 60 * 1000;
  const bufferMs = settings.bufferMinutes * 60 * 1000;
  const step = settings.durationMinutes + settings.bufferMinutes;
  if (step <= 0 || durationMs <= 0) return [];

  const earliest = now.getTime() + settings.minNoticeMinutes * 60 * 1000;
  const blocked = new Set(blockedDates);
  const today = todayInTimeZone(settings.timezone, now);
  const slots: Date[] = [];

  for (let offset = 0; offset < settings.horizonDays; offset += 1) {
    const date = addCalendarDays(today, offset);
    if (blocked.has(date)) continue;
    const day = weekdayIndex(date, settings.timezone);
    const dayWindows = windows.filter((window) => window.dayOfWeek === day);

    for (const window of dayWindows) {
      const startTime = normalizeHm(window.startTime);
      const endTime = normalizeHm(window.endTime);
      if (!startTime || !endTime) continue;
      const startMinutes = minutesFromHm(startTime);
      const endMinutes = minutesFromHm(endTime);
      if (endMinutes <= startMinutes) continue;

      for (
        let cursor = startMinutes;
        cursor + settings.durationMinutes <= endMinutes;
        cursor += step
      ) {
        const time = hmFromMinutes(cursor);
        const start = zonedDateTimeToUtc(date, time, settings.timezone);
        const formatted = formatZonedParts(start, settings.timezone);
        if (formatted.date !== date || formatted.time !== time) continue;
        if (start.getTime() < earliest) continue;
        if (conflicts(start.getTime(), durationMs, bufferMs, busy)) continue;
        slots.push(start);
      }
    }
  }

  return slots;
}
