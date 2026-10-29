"use server";

import { clearAdminSession, readAdminSession } from "@/lib/admin-session";
import { createAgentKey, revokeAgentKey } from "@/lib/agent-keys";
import {
  bookSlot,
  cancelAsAdmin,
  cancelWithSignature,
  confirmHold,
  disconnectCalendar,
  getAdminState,
  getCancelPreview,
  getHoldPreview,
  getScheduleView,
  saveAdminState,
} from "@/lib/scheduling-store";
import type { SchedulingSettings, WeekWindow } from "@/lib/scheduling-types";

async function requireAdmin() {
  const session = await readAdminSession();
  if (!session) return null;
  return session;
}

export async function getPublicSchedule() {
  return getScheduleView();
}

export async function bookPublicSlot(input: {
  startsAt: string;
  guestName: string;
  guestEmail: string;
  guestNote?: string;
}) {
  return bookSlot(input);
}

export async function previewCancellation(bookingId: string, sig: string) {
  return getCancelPreview(bookingId, sig);
}

export async function cancelPublicBooking(bookingId: string, sig: string) {
  return cancelWithSignature(bookingId, sig);
}

export async function previewHold(holdId: string, sig: string) {
  const result = await getHoldPreview(holdId, sig);
  if (!result.ok) return { ok: false as const, error: result.error };
  return result;
}

export async function confirmPublicHold(input: {
  holdId: string;
  sig: string;
  guestName: string;
  guestEmail: string;
  guestNote?: string;
}) {
  const result = await confirmHold(input);
  if (!result.ok) return { ok: false as const, error: result.error };
  const cancelUrl = result.booking.cancelPath.startsWith("/")
    ? result.booking.cancelPath
    : `${new URL(result.booking.cancelPath).pathname}${new URL(result.booking.cancelPath).search}`;
  return {
    ok: true as const,
    meetUrl: result.booking.meetUrl,
    cancelPath: cancelUrl,
    startsAt: result.booking.startsAt,
  };
}

export async function getAdminScheduling(): Promise<
  { ok: true; state: Awaited<ReturnType<typeof getAdminState>> } | { ok: false; error: string }
> {
  if (!(await requireAdmin())) return { ok: false, error: "Unauthorized" };
  try {
    return { ok: true, state: await getAdminState() };
  } catch (error) {
    console.error("Failed to load scheduling admin", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("unreadable")) {
      return { ok: false, error: "The scheduler data file could not be read." };
    }
    return { ok: false, error: "Scheduling settings could not be loaded." };
  }
}

export async function saveAdminScheduling(input: {
  settings: SchedulingSettings;
  windows: WeekWindow[];
  blockedDates: string[];
}) {
  if (!(await requireAdmin())) return { ok: false as const, error: "Unauthorized" };
  try {
    return await saveAdminState(input);
  } catch (error) {
    console.error("Failed to save scheduling admin", error);
    return { ok: false as const, error: "Scheduling settings could not be saved." };
  }
}

export async function cancelAdminBooking(bookingId: string) {
  if (!(await requireAdmin())) return { ok: false as const, error: "Unauthorized" };
  const result = await cancelAsAdmin(bookingId);
  if (!result.ok) return { ok: false as const, error: result.error };
  return { ok: true as const };
}

export async function signOutAdmin() {
  await clearAdminSession();
}

export async function disconnectAdminCalendar() {
  if (!(await requireAdmin())) return { ok: false as const, error: "Unauthorized" };
  try {
    await disconnectCalendar();
    return { ok: true as const };
  } catch (error) {
    console.error("Failed to disconnect calendar", error);
    return { ok: false as const, error: "Google Calendar could not be disconnected." };
  }
}

export async function createAdminAgentKey(name: string, scopes: string[]) {
  if (!(await requireAdmin())) return { ok: false as const, error: "Unauthorized" };
  try {
    const created = await createAgentKey(name, scopes);
    return { ok: true as const, token: created.token, key: created.key };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The key could not be created.";
    return { ok: false as const, error: message };
  }
}

export async function revokeAdminAgentKey(id: string) {
  if (!(await requireAdmin())) return { ok: false as const, error: "Unauthorized" };
  try {
    await revokeAgentKey(id);
    return { ok: true as const };
  } catch (error) {
    console.error("Failed to revoke agent key", error);
    return { ok: false as const, error: "The key could not be revoked." };
  }
}
