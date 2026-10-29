import { randomUUID } from "crypto";
import { Resend } from "resend";
import { isAllowlisted } from "@/lib/admin-session";
import { listAgentKeys } from "@/lib/agent-keys";
import {
  deleteCalendarEvent,
  exchangeGoogleCode,
  GoogleApiError,
  googleOAuthConfigured,
  googleRedirectUri,
  googleSetupHint,
  googleSetupMissing,
  insertCalendarEvent,
  listPrimaryEvents,
  refreshGoogleToken,
  verifyGoogleIdToken,
} from "@/lib/google-calendar";
import {
  readStore,
  updateStore,
  type SchedulerData,
  type StoredBooking,
  type StoredToken,
} from "@/lib/local-store";
import { buildOpenSlots, busyIntervalsFromEvents } from "@/lib/scheduling-slots";
import { siteBase } from "@/lib/site";
import type {
  AdminSchedulingState,
  AvailabilityView,
  BookingSummary,
  ConfirmedBooking,
  ScheduleView,
  ScheduleViewFailure,
  SchedulingSettings,
  StoreFailure,
  WeekWindow,
} from "@/lib/scheduling-types";
import {
  addCalendarDays,
  isValidTimeZone,
  normalizeHm,
  todayInTimeZone,
  zonedDateTimeToUtc,
} from "@/lib/scheduling-time";
import { signValue, signedMatch } from "@/lib/signatures";
import { emitWebhook } from "@/lib/webhooks";

const HOLD_MS = 5 * 60 * 1000;
const PUBLIC_UNAVAILABLE = "Scheduling is temporarily unavailable.";
const SLOT_TAKEN = "That time was just taken. Choose another one.";

type GuestInput = {
  startsAt: string;
  guestName: string;
  guestEmail: string;
  guestNote?: string;
  source: "web" | "agent";
  agentName?: string | null;
  agentUrl?: string | null;
  idempotencyKey?: string | null;
  origin?: string;
};

function fail(code: StoreFailure["code"], error: string, nextSlots?: string[]): StoreFailure {
  return nextSlots ? { ok: false, code, error, nextSlots } : { ok: false, code, error };
}

function mapBooking(row: StoredBooking): BookingSummary {
  return {
    id: row.id,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    guestName: row.guestName,
    guestEmail: row.guestEmail,
    meetUrl: row.meetUrl,
    status: row.status,
    source: row.source === "agent" ? "agent" : "web",
    agentName: row.agentName,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function absoluteUrl(path: string, origin?: string): string {
  const base = siteBase(origin);
  return base ? `${base}${path}` : path;
}

export function cancelPath(bookingId: string): string {
  const params = new URLSearchParams({
    booking: bookingId,
    sig: signValue(`cancel:${bookingId}`),
  });
  return `/schedule/cancel?${params.toString()}`;
}

export function confirmPath(holdId: string): string {
  const params = new URLSearchParams({
    hold: holdId,
    sig: signValue(`hold:${holdId}`),
  });
  return `/schedule/confirm?${params.toString()}`;
}

function cancelSigOk(bookingId: string, sig: string): boolean {
  return signedMatch(`cancel:${bookingId}`, sig);
}

function holdSigOk(holdId: string, sig: string): boolean {
  return signedMatch(`hold:${holdId}`, sig);
}

function sweepExpired(data: SchedulerData, now = Date.now()) {
  const cutoff = new Date(now - HOLD_MS).toISOString();
  const nowIso = new Date(now).toISOString();
  data.bookings = data.bookings.filter((booking) => {
    if (booking.status !== "pending") return true;
    if (booking.holdExpiresAt) return booking.holdExpiresAt >= nowIso;
    return booking.createdAt >= cutoff;
  });
}

async function releaseStalePending() {
  await updateStore((data) => {
    sweepExpired(data);
  });
}

async function loadToken(): Promise<StoredToken | null> {
  const data = await readStore();
  return data.token;
}

async function saveToken(token: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  googleSub?: string | null;
  email?: string | null;
}) {
  await updateStore((data) => {
    const existing = data.token;
    data.token = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      googleSub: token.googleSub ? token.googleSub : (existing?.googleSub ?? null),
      email: token.email ? token.email.toLowerCase() : (existing?.email ?? null),
    };
  });
}

async function forceRefresh(): Promise<string | null> {
  const current = await loadToken();
  if (!current?.refreshToken) return null;
  const refreshed = await refreshGoogleToken(current.refreshToken);
  await saveToken({
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? current.refreshToken,
    expiresAt: refreshed.expiresAt,
  });
  return refreshed.accessToken;
}

async function getAccessToken(): Promise<string | null> {
  const current = await loadToken();
  if (!current) return null;
  const freshEnough = current.expiresAt > Math.floor(Date.now() / 1000) + 60;
  if (freshEnough) return current.accessToken;
  return forceRefresh();
}

async function withGoogle<T>(fn: (accessToken: string) => Promise<T>): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("not_connected");
  try {
    return await fn(token);
  } catch (error) {
    if (!(error instanceof GoogleApiError) || error.status !== 401) throw error;
    const refreshed = await forceRefresh();
    if (!refreshed) throw error;
    return fn(refreshed);
  }
}

export async function completeGoogleSignIn(code: string): Promise<
  | { ok: true; sub: string; email: string; calendarConnected: boolean }
  | { ok: false; reason: "denied" | "error" }
> {
  try {
    const tokens = await exchangeGoogleCode(code);
    if (!tokens.idToken) return { ok: false, reason: "error" };
    const identity = await verifyGoogleIdToken(tokens.idToken);
    if (!identity.emailVerified || !isAllowlisted(identity.email)) {
      return { ok: false, reason: "denied" };
    }

    const existing = await loadToken();
    const sameAccount = Boolean(existing?.googleSub) && existing?.googleSub === identity.sub;
    const canStore = !existing || sameAccount || !existing.googleSub;
    let calendarConnected = Boolean(existing);
    if (canStore) {
      const refreshToken = tokens.refreshToken ?? existing?.refreshToken ?? null;
      if (refreshToken) {
        await saveToken({
          accessToken: tokens.accessToken,
          refreshToken,
          expiresAt: tokens.expiresAt,
          googleSub: identity.sub,
          email: identity.email,
        });
        calendarConnected = true;
      }
    }
    return {
      ok: true,
      sub: identity.sub,
      email: identity.email.toLowerCase(),
      calendarConnected,
    };
  } catch (error) {
    console.error("Google sign-in failed", error);
    return { ok: false, reason: "error" };
  }
}

export async function disconnectCalendar(): Promise<void> {
  await updateStore((data) => {
    data.token = null;
  });
}

async function busyIntervals(settings: SchedulingSettings, now: Date) {
  const today = todayInTimeZone(settings.timezone, now);
  const lastDate = addCalendarDays(today, settings.horizonDays - 1);
  const rangeEnd = zonedDateTimeToUtc(lastDate, "23:59", settings.timezone);
  const timeMin = now.toISOString();
  const timeMax = rangeEnd.toISOString();
  const events = await withGoogle((token) => listPrimaryEvents(token, timeMin, timeMax));
  const data = await readStore();
  return [
    ...busyIntervalsFromEvents(events, settings.timezone),
    ...data.bookings
      .filter(
        (booking) =>
          (booking.status === "pending" || booking.status === "confirmed") && booking.endsAt >= timeMin
      )
      .map((booking) => ({
        start: new Date(booking.startsAt),
        end: new Date(booking.endsAt),
      })),
  ];
}

function orderedWindows(windows: WeekWindow[]): WeekWindow[] {
  return windows
    .slice()
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
}

async function openSlots(now = new Date()) {
  await releaseStalePending();
  const data = await readStore();
  const settings = data.settings;
  const token = data.token;
  if (!settings) return { settings: null, windows: [] as WeekWindow[], slots: [] as Date[], token };
  const windows = orderedWindows(data.windows);
  if (!token || windows.length === 0) {
    return { settings, windows, slots: [] as Date[], token };
  }
  const busy = await busyIntervals(settings, now);
  const slots = buildOpenSlots({
    now,
    settings,
    windows,
    blockedDates: data.blockedDates,
    busy,
  });
  return { settings, windows, slots, token };
}

function nextOpen(slots: Date[], excludeMs?: number): string[] {
  return slots
    .filter((slot) => slot.getTime() !== excludeMs)
    .slice(0, 5)
    .map((slot) => slot.toISOString());
}

export async function getAvailability(): Promise<AvailabilityView | StoreFailure> {
  try {
    const { settings, slots, token } = await openSlots();
    if (!settings) {
      return {
        slots: [],
        hostTimeZone: "UTC",
        durationMinutes: 30,
        meetingTitle: "Meeting",
        minNoticeMinutes: 0,
        horizonDays: 14,
        bufferMinutes: 0,
        calendarConnected: Boolean(token),
      };
    }
    return {
      slots: slots.map((slot) => slot.toISOString()),
      hostTimeZone: settings.timezone,
      durationMinutes: settings.durationMinutes,
      meetingTitle: settings.meetingTitle,
      minNoticeMinutes: settings.minNoticeMinutes,
      horizonDays: settings.horizonDays,
      bufferMinutes: settings.bufferMinutes,
      calendarConnected: Boolean(token),
    };
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "not_connected") {
      console.error("Failed to load schedule", error);
    }
    return fail("unavailable", PUBLIC_UNAVAILABLE);
  }
}

const PUBLIC_NOT_READY =
  "Open times are not published yet. The host still needs to connect Google Calendar and save weekly hours on the admin page.";

export async function getScheduleView(): Promise<ScheduleView | ScheduleViewFailure> {
  const availability = await getAvailability();
  if ("code" in availability) {
    return { ok: false, reason: "unavailable", error: availability.error };
  }
  if (!availability.calendarConnected) {
    return { ok: false, reason: "not_ready", error: PUBLIC_NOT_READY };
  }
  return {
    ok: true,
    slots: availability.slots,
    hostTimeZone: availability.hostTimeZone,
    durationMinutes: availability.durationMinutes,
    meetingTitle: availability.meetingTitle,
  };
}

function toConfirmed(row: StoredBooking, origin?: string): ConfirmedBooking {
  return {
    id: row.id,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    guestName: row.guestName,
    guestEmail: row.guestEmail,
    guestNote: row.guestNote,
    meetUrl: row.meetUrl,
    status: row.status,
    source: row.source === "agent" ? "agent" : "web",
    agentName: row.agentName,
    cancelPath: absoluteUrl(cancelPath(row.id), origin),
  };
}

async function loadBooking(id: string): Promise<StoredBooking | null> {
  const data = await readStore();
  return data.bookings.find((booking) => booking.id === id) ?? null;
}

async function notifyHost(input: {
  settings: SchedulingSettings;
  guestName: string;
  guestEmail: string;
  guestNote: string;
  startsAt: Date;
  meetUrl: string | null;
  cancelUrl: string;
  source: "web" | "agent";
  agentName: string | null;
}) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.SCHEDULER_FROM_EMAIL;
  const to = process.env.SCHEDULER_HOST_EMAIL;
  if (!key || !from || !to) {
    console.error("Skipping scheduling notice: email is not configured");
    return;
  }
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: input.settings.timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(input.startsAt);
  const agentLine =
    input.source === "agent" && input.agentName
      ? `<p>Booked by ${escapeHtml(input.agentName)}</p>`
      : "";
  try {
    const resend = new Resend(key);
    await resend.emails.send({
      from,
      to: [to],
      replyTo: input.guestEmail,
      subject: `Meeting booked: ${input.guestName}`,
      html: `
        <p><strong>${escapeHtml(input.settings.meetingTitle)}</strong> with ${escapeHtml(input.guestName)}</p>
        <p>${escapeHtml(when)} (${escapeHtml(input.settings.timezone)})</p>
        <p>Email: ${escapeHtml(input.guestEmail)}</p>
        ${agentLine}
        ${input.guestNote ? `<p>Note: ${escapeHtml(input.guestNote)}</p>` : ""}
        ${input.meetUrl ? `<p><a href="${escapeHtml(input.meetUrl)}">Google Meet</a></p>` : ""}
        <p><a href="${escapeHtml(input.cancelUrl)}">Cancel this meeting</a></p>
      `,
    });
  } catch (error) {
    console.error("Failed to send scheduling notice", error);
  }
}

async function publishBooking(
  bookingId: string,
  origin?: string
): Promise<{ ok: true; booking: ConfirmedBooking } | StoreFailure> {
  const row = await loadBooking(bookingId);
  if (!row) return fail("not_found", "This meeting could not be found.");
  const data = await readStore();
  const settings = data.settings;
  if (!settings) return fail("unavailable", PUBLIC_UNAVAILABLE);
  const cancel = cancelPath(row.id);
  const absoluteCancel = absoluteUrl(cancel, origin);
  if (row.status === "confirmed" && row.googleEventId) {
    return { ok: true, booking: { ...toConfirmed(row, origin), cancelPath: absoluteCancel } };
  }

  const description = [row.guestNote ?? "", `Cancel this meeting: ${absoluteCancel}`]
    .filter(Boolean)
    .join("\n\n");
  let eventId: string | null = null;
  try {
    const event = await withGoogle((token) =>
      insertCalendarEvent(token, {
        requestId: row.id,
        summary: `${settings.meetingTitle} with ${row.guestName}`,
        description,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        timeZone: settings.timezone,
        guestEmail: row.guestEmail,
      })
    );
    eventId = event.id;
    await updateStore((draft) => {
      const current = draft.bookings.find((booking) => booking.id === row.id);
      if (!current) throw new Error("Booking disappeared");
      current.status = "confirmed";
      current.googleEventId = event.id;
      current.meetUrl = event.meetUrl;
    });
    const confirmed = await loadBooking(row.id);
    if (!confirmed) throw new Error("Booking disappeared");
    await notifyHost({
      settings,
      guestName: confirmed.guestName,
      guestEmail: confirmed.guestEmail,
      guestNote: confirmed.guestNote ?? "",
      startsAt: new Date(confirmed.startsAt),
      meetUrl: event.meetUrl,
      cancelUrl: absoluteCancel,
      source: confirmed.source === "agent" ? "agent" : "web",
      agentName: confirmed.agentName,
    });
    await emitWebhook({
      id: `booking.confirmed:${confirmed.id}`,
      type: "booking.confirmed",
      booking: {
        id: confirmed.id,
        startsAt: confirmed.startsAt,
        endsAt: confirmed.endsAt,
        guestName: confirmed.guestName,
        guestEmail: confirmed.guestEmail,
        meetUrl: event.meetUrl,
        cancelUrl: absoluteCancel,
        source: confirmed.source === "agent" ? "agent" : "web",
        agentName: confirmed.agentName,
      },
    });
    return { ok: true, booking: { ...toConfirmed(confirmed, origin), cancelPath: absoluteCancel } };
  } catch (error) {
    console.error("Failed to publish meeting", error);
    if (eventId) {
      try {
        const token = await getAccessToken();
        if (token) await deleteCalendarEvent(token, eventId);
      } catch (cleanupError) {
        console.error("Failed to roll back calendar event", cleanupError);
      }
    }
    return fail("unavailable", PUBLIC_UNAVAILABLE);
  }
}

function cleanGuest(input: GuestInput): { guestName: string; guestEmail: string; guestNote: string } | StoreFailure {
  const guestName = input.guestName.trim();
  const guestEmail = input.guestEmail.trim().toLowerCase();
  const guestNote = input.guestNote?.trim() ?? "";
  if (guestName.length < 1 || guestName.length > 200) {
    return fail("invalid_input", "Enter your name.");
  }
  if (!validEmail(guestEmail) || guestEmail.length > 320) {
    return fail("invalid_input", "Enter a valid email address.");
  }
  if (guestNote.length > 2000) return fail("invalid_input", "Keep the note under 2000 characters.");
  return { guestName, guestEmail, guestNote };
}

async function findIdempotent(key: string): Promise<StoredBooking | null> {
  const data = await readStore();
  return data.bookings.find((booking) => booking.idempotencyKey === key) ?? null;
}

function sameIdempotentBooking(existing: StoredBooking, guestEmail: string, startsAtMs: number): boolean {
  return existing.guestEmail === guestEmail && new Date(existing.startsAt).getTime() === startsAtMs;
}

export async function bookMeeting(
  input: GuestInput
): Promise<{ ok: true; booking: ConfirmedBooking } | StoreFailure> {
  const guest = cleanGuest(input);
  if ("code" in guest) return guest;
  const requested = new Date(input.startsAt);
  if (Number.isNaN(requested.getTime())) return fail("invalid_input", "That time is not available.");

  try {
    if (input.idempotencyKey) {
      const existing = await findIdempotent(input.idempotencyKey);
      if (existing) {
        if (!sameIdempotentBooking(existing, guest.guestEmail, requested.getTime())) {
          return fail("conflict", "That idempotency key was already used for a different booking.");
        }
        if (existing.status === "cancelled") {
          return fail("conflict", "That idempotency key belongs to a cancelled booking.");
        }
        return publishBooking(existing.id, input.origin);
      }
    }

    const { settings, slots } = await openSlots();
    if (!settings) return fail("unavailable", PUBLIC_UNAVAILABLE);
    const match = slots.find((slot) => slot.getTime() === requested.getTime());
    if (!match) return fail("slot_taken", "That time is not available.", nextOpen(slots, requested.getTime()));

    const endsAt = new Date(match.getTime() + settings.durationMinutes * 60 * 1000);
    const placed = await updateStore((data) => {
      sweepExpired(data);
      if (input.idempotencyKey) {
        const existing = data.bookings.find((booking) => booking.idempotencyKey === input.idempotencyKey);
        if (existing) {
          if (!sameIdempotentBooking(existing, guest.guestEmail, requested.getTime())) {
            return { kind: "conflict" as const };
          }
          if (existing.status === "cancelled") return { kind: "cancelled" as const };
          return { kind: "existing" as const, id: existing.id };
        }
      }
      const startsAt = match.toISOString();
      const taken = data.bookings.some(
        (booking) =>
          (booking.status === "pending" || booking.status === "confirmed") && booking.startsAt === startsAt
      );
      if (taken) return { kind: "taken" as const };
      const id = randomUUID();
      data.bookings.push({
        id,
        startsAt,
        endsAt: endsAt.toISOString(),
        guestName: guest.guestName,
        guestEmail: guest.guestEmail,
        guestNote: guest.guestNote || null,
        meetUrl: null,
        status: "pending",
        googleEventId: null,
        source: input.source,
        agentName: input.agentName ?? null,
        agentUrl: input.agentUrl ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        holdExpiresAt: new Date(Date.now() + HOLD_MS).toISOString(),
        createdAt: new Date().toISOString(),
      });
      return { kind: "created" as const, id };
    });

    if (placed.kind === "conflict") {
      return fail("conflict", "That idempotency key was already used for a different booking.");
    }
    if (placed.kind === "cancelled") {
      return fail("conflict", "That idempotency key belongs to a cancelled booking.");
    }
    if (placed.kind === "taken") {
      return fail("slot_taken", SLOT_TAKEN, nextOpen(slots, match.getTime()));
    }
    return publishBooking(placed.id, input.origin);
  } catch (error) {
    console.error("Failed to book meeting", error);
    return fail("unavailable", PUBLIC_UNAVAILABLE);
  }
}

export async function bookSlot(input: {
  startsAt: string;
  guestName: string;
  guestEmail: string;
  guestNote?: string;
}): Promise<
  | { ok: true; meetUrl: string | null; cancelPath: string; startsAt: string }
  | { ok: false; error: string }
> {
  const result = await bookMeeting({ ...input, source: "web" });
  if (!result.ok) {
    if (result.code === "invalid_input" || result.code === "slot_taken") {
      return { ok: false, error: result.error };
    }
    return { ok: false, error: PUBLIC_UNAVAILABLE };
  }
  return {
    ok: true,
    meetUrl: result.booking.meetUrl,
    cancelPath: result.booking.cancelPath.startsWith("http")
      ? cancelPath(result.booking.id)
      : result.booking.cancelPath,
    startsAt: result.booking.startsAt,
  };
}

export async function createHold(input: {
  startsAt: string;
  agentName?: string | null;
  agentUrl?: string | null;
  origin?: string;
}): Promise<
  | { ok: true; holdId: string; startsAt: string; endsAt: string; expiresAt: string; confirmUrl: string }
  | StoreFailure
> {
  const requested = new Date(input.startsAt);
  if (Number.isNaN(requested.getTime())) return fail("invalid_input", "That time is not available.");
  try {
    const { settings, slots } = await openSlots();
    if (!settings) return fail("unavailable", PUBLIC_UNAVAILABLE);
    const match = slots.find((slot) => slot.getTime() === requested.getTime());
    if (!match) return fail("slot_taken", "That time is not available.", nextOpen(slots, requested.getTime()));
    const endsAt = new Date(match.getTime() + settings.durationMinutes * 60 * 1000);
    const expiresAt = new Date(Date.now() + HOLD_MS).toISOString();
    const placed = await updateStore((data) => {
      sweepExpired(data);
      const startsAt = match.toISOString();
      const taken = data.bookings.some(
        (booking) =>
          (booking.status === "pending" || booking.status === "confirmed") && booking.startsAt === startsAt
      );
      if (taken) return null;
      const id = randomUUID();
      data.bookings.push({
        id,
        startsAt,
        endsAt: endsAt.toISOString(),
        guestName: "",
        guestEmail: "",
        guestNote: null,
        meetUrl: null,
        status: "pending",
        googleEventId: null,
        source: "agent",
        agentName: input.agentName ?? null,
        agentUrl: input.agentUrl ?? null,
        idempotencyKey: null,
        holdExpiresAt: expiresAt,
        createdAt: new Date().toISOString(),
      });
      return id;
    });
    if (!placed) return fail("slot_taken", SLOT_TAKEN, nextOpen(slots, match.getTime()));
    return {
      ok: true,
      holdId: placed,
      startsAt: match.toISOString(),
      endsAt: endsAt.toISOString(),
      expiresAt,
      confirmUrl: absoluteUrl(confirmPath(placed), input.origin),
    };
  } catch (error) {
    console.error("Failed to hold slot", error);
    return fail("unavailable", PUBLIC_UNAVAILABLE);
  }
}

export async function getHoldPreview(
  holdId: string,
  sig: string
): Promise<
  | { ok: true; startsAt: string; expiresAt: string; meetingTitle: string; expired: boolean }
  | StoreFailure
> {
  if (!holdId || !holdSigOk(holdId, sig)) return fail("not_found", "This confirm link is not valid.");
  const data = await readStore();
  const row = data.bookings.find((booking) => booking.id === holdId) ?? null;
  if (!row || row.status === "cancelled") return fail("not_found", "This confirm link is not valid.");
  const expired =
    row.status === "pending" && Boolean(row.holdExpiresAt) && new Date(row.holdExpiresAt as string).getTime() < Date.now();
  return {
    ok: true,
    startsAt: row.startsAt,
    expiresAt: row.holdExpiresAt ?? row.startsAt,
    meetingTitle: data.settings?.meetingTitle ?? "Meeting",
    expired,
  };
}

export async function confirmHold(input: {
  holdId: string;
  sig: string;
  guestName: string;
  guestEmail: string;
  guestNote?: string;
  origin?: string;
}): Promise<{ ok: true; booking: ConfirmedBooking } | StoreFailure> {
  if (!holdSigOk(input.holdId, input.sig)) return fail("not_found", "This confirm link is not valid.");
  const guest = cleanGuest({ ...input, startsAt: new Date().toISOString(), source: "web" });
  if ("code" in guest) return guest;
  const outcome = await updateStore((data) => {
    const row = data.bookings.find((booking) => booking.id === input.holdId);
    if (!row) return { kind: "missing" as const };
    if (row.status === "confirmed") return { kind: "confirmed" as const };
    if (row.status !== "pending") return { kind: "missing" as const };
    if (row.holdExpiresAt && new Date(row.holdExpiresAt).getTime() < Date.now()) {
      return { kind: "expired" as const };
    }
    row.guestName = guest.guestName;
    row.guestEmail = guest.guestEmail;
    row.guestNote = guest.guestNote || null;
    return { kind: "ready" as const };
  });
  if (outcome.kind === "expired") return fail("hold_expired", "That hold expired. Choose another time.");
  if (outcome.kind === "missing") return fail("not_found", "This confirm link is not valid.");
  return publishBooking(input.holdId, input.origin);
}

export async function getBookingRecord(bookingId: string): Promise<
  | { ok: true; booking: ConfirmedBooking; meetingTitle: string }
  | StoreFailure
> {
  const data = await readStore();
  const row = data.bookings.find((booking) => booking.id === bookingId) ?? null;
  if (!row) return fail("not_found", "This meeting could not be found.");
  return {
    ok: true,
    booking: toConfirmed(row),
    meetingTitle: data.settings?.meetingTitle ?? "Meeting",
  };
}

export async function getCancelPreview(
  bookingId: string,
  sig: string
): Promise<
  | { ok: true; startsAt: string; status: string; meetingTitle: string }
  | { ok: false; error: string }
> {
  if (!cancelSigOk(bookingId, sig)) return { ok: false, error: "This cancel link is not valid." };
  const data = await readStore();
  const row = data.bookings.find((booking) => booking.id === bookingId) ?? null;
  if (!row) return { ok: false, error: "This cancel link is not valid." };
  return {
    ok: true,
    startsAt: row.startsAt,
    status: row.status,
    meetingTitle: data.settings?.meetingTitle ?? "Meeting",
  };
}

async function cancelById(bookingId: string): Promise<{ ok: true } | StoreFailure> {
  const row = await loadBooking(bookingId);
  if (!row) return fail("not_found", "This meeting could not be found.");
  if (row.status === "cancelled") return { ok: true };
  if (row.googleEventId) {
    try {
      await withGoogle((token) => deleteCalendarEvent(token, row.googleEventId as string));
    } catch (error) {
      console.error("Failed to delete calendar event", error);
      return fail("unavailable", "The meeting could not be cancelled. Try again.");
    }
  }
  const wasConfirmed = await updateStore((data) => {
    const current = data.bookings.find((booking) => booking.id === bookingId);
    if (!current) return "missing" as const;
    if (current.status === "cancelled") return "already" as const;
    const confirmed = current.status === "confirmed";
    current.status = "cancelled";
    return confirmed ? ("confirmed" as const) : ("other" as const);
  });
  if (wasConfirmed === "missing") return fail("not_found", "This meeting could not be found.");
  if (wasConfirmed === "confirmed") {
    await emitWebhook({
      id: `booking.cancelled:${row.id}`,
      type: "booking.cancelled",
      booking: {
        id: row.id,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        guestName: row.guestName,
        guestEmail: row.guestEmail,
        source: row.source === "agent" ? "agent" : "web",
        agentName: row.agentName,
      },
    });
  }
  return { ok: true };
}

export async function cancelWithSignature(
  bookingId: string,
  sig: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!cancelSigOk(bookingId, sig)) return { ok: false, error: "This cancel link is not valid." };
  const result = await cancelById(bookingId);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
}

export async function cancelAsAdmin(bookingId: string): Promise<{ ok: true } | StoreFailure> {
  return cancelById(bookingId);
}

function upcomingBookings(data: SchedulerData): StoredBooking[] {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  return data.bookings
    .filter((booking) => booking.status !== "cancelled" && booking.startsAt >= since)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 50);
}

export async function listUpcomingBookings(): Promise<BookingSummary[]> {
  await releaseStalePending();
  const data = await readStore();
  return upcomingBookings(data).map(mapBooking);
}

export async function getAdminState(): Promise<AdminSchedulingState> {
  await releaseStalePending();
  const [data, agentKeys] = await Promise.all([readStore(), listAgentKeys()]);
  return {
    saved: data.settings !== null,
    settings: data.settings,
    windows: orderedWindows(data.windows),
    blockedDates: data.blockedDates.slice().sort(),
    bookings: upcomingBookings(data).map(mapBooking),
    connected: Boolean(data.token),
    calendarEmail: data.token?.email ?? null,
    oauthConfigured: googleOAuthConfigured(),
    setupHint: googleSetupHint(),
    setupMissing: googleSetupMissing(),
    googleRedirectUri: siteBase() ? googleRedirectUri() : null,
    webhookConfigured: Boolean(process.env.SCHEDULER_WEBHOOK_URL && process.env.SCHEDULER_WEBHOOK_SECRET),
    agentKeys,
  };
}

function validateSettings(settings: SchedulingSettings): string | null {
  if (!isValidTimeZone(settings.timezone)) return "Choose a valid timezone.";
  if (!Number.isInteger(settings.durationMinutes) || settings.durationMinutes < 5 || settings.durationMinutes > 240) {
    return "Duration must be between 5 and 240 minutes.";
  }
  if (!Number.isInteger(settings.bufferMinutes) || settings.bufferMinutes < 0 || settings.bufferMinutes > 120) {
    return "Buffer must be between 0 and 120 minutes.";
  }
  if (!Number.isInteger(settings.minNoticeMinutes) || settings.minNoticeMinutes < 0 || settings.minNoticeMinutes > 10080) {
    return "Minimum notice is too large.";
  }
  if (!Number.isInteger(settings.horizonDays) || settings.horizonDays < 1 || settings.horizonDays > 365) {
    return "Booking window must be between 1 and 365 days.";
  }
  const title = settings.meetingTitle.trim();
  if (title.length < 1 || title.length > 140) return "Enter a meeting title.";
  return null;
}

export async function saveAdminState(input: {
  settings: SchedulingSettings;
  windows: WeekWindow[];
  blockedDates: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const settings = { ...input.settings, meetingTitle: input.settings.meetingTitle.trim() };
  const invalid = validateSettings(settings);
  if (invalid) return { ok: false, error: invalid };

  const windows: WeekWindow[] = [];
  for (const window of input.windows) {
    if (!Number.isInteger(window.dayOfWeek) || window.dayOfWeek < 0 || window.dayOfWeek > 6) {
      return { ok: false, error: "A weekday is invalid." };
    }
    const startTime = normalizeHm(window.startTime);
    const endTime = normalizeHm(window.endTime);
    if (!startTime || !endTime || endTime <= startTime) {
      return { ok: false, error: "Each open day needs an end time after the start time." };
    }
    windows.push({ dayOfWeek: window.dayOfWeek, startTime, endTime });
  }

  const blockedDates = [...new Set(input.blockedDates)].sort();
  if (blockedDates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return { ok: false, error: "A blocked date is invalid." };
  }

  try {
    await updateStore((data) => {
      data.settings = settings;
      data.windows = orderedWindows(windows);
      data.blockedDates = blockedDates;
    });
  } catch (error) {
    console.error("Failed to save scheduling settings", error);
    return { ok: false, error: "Scheduling settings could not be saved." };
  }

  return { ok: true };
}
