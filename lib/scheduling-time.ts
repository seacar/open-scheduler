type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function readParts(instant: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  let hour = value("hour");
  if (hour === 24) hour = 0;
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour,
    minute: value("minute"),
  };
}

function offsetMs(instant: Date, timeZone: string): number {
  const parts = readParts(instant, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    0
  );
  return asUtc - instant.getTime();
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function todayInTimeZone(timeZone: string, now = new Date()): string {
  const parts = readParts(now, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

export function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function normalizeHm(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function zonedDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string
): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = wallClockAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const next = wallClockAsUtc - offsetMs(new Date(utc), timeZone);
    if (next === utc) break;
    utc = next;
  }
  return new Date(utc);
}

export function formatZonedParts(
  instant: Date,
  timeZone: string
): { date: string; time: string } {
  const parts = readParts(instant, timeZone);
  return {
    date: `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`,
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  };
}

export function weekdayIndex(date: string, timeZone: string): number {
  const noon = zonedDateTimeToUtc(date, "12:00", timeZone);
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(noon);
  const index = WEEKDAY_INDEX[label];
  if (index === undefined) {
    throw new Error(`Unknown weekday ${label}`);
  }
  return index;
}
