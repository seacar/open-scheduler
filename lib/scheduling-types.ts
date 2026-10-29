export type SchedulingSettings = {
  timezone: string;
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  horizonDays: number;
  meetingTitle: string;
};

export type WeekWindow = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

export type BookingSummary = {
  id: string;
  startsAt: string;
  endsAt: string;
  guestName: string;
  guestEmail: string;
  meetUrl: string | null;
  status: "pending" | "confirmed" | "cancelled";
  source: "web" | "agent";
  agentName: string | null;
};

export type AgentKeySummary = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  createdAt: string;
  revokedAt: string | null;
};

export type ScheduleView = {
  ok: true;
  slots: string[];
  hostTimeZone: string;
  durationMinutes: number;
  meetingTitle: string;
};

export type ScheduleViewFailure = {
  ok: false;
  reason: "not_ready" | "unavailable";
  error: string;
};

export type AvailabilityView = {
  slots: string[];
  hostTimeZone: string;
  durationMinutes: number;
  meetingTitle: string;
  minNoticeMinutes: number;
  horizonDays: number;
  bufferMinutes: number;
  calendarConnected: boolean;
};

export type AdminSchedulingState = {
  saved: boolean;
  settings: SchedulingSettings | null;
  windows: WeekWindow[];
  blockedDates: string[];
  bookings: BookingSummary[];
  connected: boolean;
  calendarEmail: string | null;
  oauthConfigured: boolean;
  setupHint: string | null;
  setupMissing: string[];
  googleRedirectUri: string | null;
  webhookConfigured: boolean;
  agentKeys: AgentKeySummary[];
};

export type StoreCode =
  | "invalid_input"
  | "unavailable"
  | "slot_taken"
  | "hold_expired"
  | "not_found"
  | "unauthorized"
  | "conflict"
  | "rate_limited";

export type StoreFailure = {
  ok: false;
  code: StoreCode;
  error: string;
  nextSlots?: string[];
};

export type ConfirmedBooking = {
  id: string;
  startsAt: string;
  endsAt: string;
  guestName: string;
  guestEmail: string;
  guestNote: string | null;
  meetUrl: string | null;
  status: "pending" | "confirmed" | "cancelled";
  source: "web" | "agent";
  agentName: string | null;
  cancelPath: string;
};
