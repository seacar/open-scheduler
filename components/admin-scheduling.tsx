"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cancelAdminBooking,
  createAdminAgentKey,
  disconnectAdminCalendar,
  getAdminScheduling,
  revokeAdminAgentKey,
  saveAdminScheduling,
  signOutAdmin,
} from "@/app/actions/scheduling-actions";
import { GoogleSetupPanel } from "@/components/google-setup-panel";
import { SchedulingStatusCard } from "@/components/scheduling-status-card";
import type { AgentKeySummary, SchedulingSettings, WeekWindow } from "@/lib/scheduling-types";
import { siteBase } from "@/lib/site";
import { AlertCircle, CalendarOff, ShieldAlert } from "lucide-react";

const TIME_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "UTC",
  "Europe/London",
  "Europe/Paris",
];

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DEFAULT_SETTINGS: SchedulingSettings = {
  timezone: "America/Chicago",
  durationMinutes: 30,
  bufferMinutes: 0,
  minNoticeMinutes: 240,
  horizonDays: 21,
  meetingTitle: "Meeting",
};

type DayDraft = {
  enabled: boolean;
  startTime: string;
  endTime: string;
};

function defaultDays(): DayDraft[] {
  return DAY_LABELS.map((_, day) => ({
    enabled: day >= 1 && day <= 5,
    startTime: "09:00",
    endTime: "17:00",
  }));
}

function embedSnippet(origin: string): string {
  return `<div data-open-scheduler></div>\n<script src="${origin}/embed.js" async></script>`;
}

function daysFromWindows(windows: WeekWindow[]): DayDraft[] {
  return DAY_LABELS.map((_, day) => {
    const match = windows.find((window) => window.dayOfWeek === day);
    if (!match) {
      return { enabled: false, startTime: "09:00", endTime: "17:00" };
    }
    return {
      enabled: true,
      startTime: match.startTime.slice(0, 5),
      endTime: match.endTime.slice(0, 5),
    };
  });
}

export function AdminScheduling({
  email,
  connectStatus,
}: {
  email: string;
  connectStatus: "connected" | "denied" | "error" | "setup" | "session" | null;
}) {
  const [embedOrigin, setEmbedOrigin] = useState(() => siteBase());
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [connected, setConnected] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [setupMissing, setSetupMissing] = useState<string[]>([]);
  const [googleRedirectUri, setGoogleRedirectUri] = useState<string | null>(null);
  const [settings, setSettings] = useState<SchedulingSettings>(DEFAULT_SETTINGS);
  const [days, setDays] = useState<DayDraft[]>(defaultDays);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [blockDraft, setBlockDraft] = useState("");
  const [bookings, setBookings] = useState<
    {
      id: string;
      startsAt: string;
      guestName: string;
      guestEmail: string;
      meetUrl: string | null;
      status: string;
    }[]
  >([]);
  const [calendarEmail, setCalendarEmail] = useState<string | null>(null);
  const [webhookConfigured, setWebhookConfigured] = useState(false);
  const [agentKeys, setAgentKeys] = useState<AgentKeySummary[]>([]);
  const [keyName, setKeyName] = useState("");
  const [keyBook, setKeyBook] = useState(true);
  const [keyManage, setKeyManage] = useState(false);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAdminScheduling().then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      const state = result.state;
      setSaved(state.saved);
      setConnected(state.connected);
      setCalendarEmail(state.calendarEmail);
      setWebhookConfigured(state.webhookConfigured);
      setAgentKeys(state.agentKeys);
      setOauthConfigured(state.oauthConfigured);
      setSetupMissing(state.setupMissing);
      setGoogleRedirectUri(state.googleRedirectUri);
      setSettings(state.settings ?? DEFAULT_SETTINGS);
      setDays(state.saved ? daysFromWindows(state.windows) : defaultDays());
      setBlockedDates(state.blockedDates);
      setBookings(state.bookings);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    if (embedOrigin) return;
    setEmbedOrigin(window.location.origin);
  }, [embedOrigin]);

  const timeZones = TIME_ZONES.includes(settings.timezone)
    ? TIME_ZONES
    : [settings.timezone, ...TIME_ZONES];
  const noticeHours = Math.round(settings.minNoticeMinutes / 60);

  function formatWhen(iso: string) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: settings.timezone,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  }

  return (
    <Card className="rounded-lg border border-border bg-card/30">
      <CardHeader>
        <CardTitle>Scheduling</CardTitle>
        <CardDescription>
          Signed in as {email}. Weekly hours are not stored until you save.
          {saved ? "" : " These hours are the starting suggestion."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {connectStatus === "connected" ? (
          <p className="text-sm" role="status">
            Google Calendar connected.
          </p>
        ) : null}
        {connectStatus === "denied" ? (
          <SchedulingStatusCard
            icon={ShieldAlert}
            tone="error"
            title="Account not allowed"
            description="That Google account is not on the admin allowlist."
            className="shadow-none"
          />
        ) : null}
        {connectStatus === "error" ? (
          <SchedulingStatusCard
            icon={AlertCircle}
            tone="error"
            title="Sign-in failed"
            description="Google sign-in could not be completed."
            className="shadow-none"
          />
        ) : null}
        {connectStatus === "session" ? (
          <p className="rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground" role="status">
            Signed in. Google Calendar was not updated on this visit.
          </p>
        ) : null}
        {connectStatus === "setup" ? (
          <SchedulingStatusCard
            icon={AlertCircle}
            tone="warning"
            title="Google sign-in is not ready"
            description="Finish environment setup and restart the server before connecting Calendar."
            className="shadow-none"
          />
        ) : null}
        {!oauthConfigured && setupMissing.length > 0 ? (
          <GoogleSetupPanel missing={setupMissing} redirectUri={googleRedirectUri} />
        ) : null}
        {error ? (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="text-sm" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading availability...</p>
        ) : (
        <>
        <div className="space-y-2">
          {!connected ? (
            <SchedulingStatusCard
              icon={CalendarOff}
              tone="warning"
              title="Google Calendar is not connected"
              description="Visitors cannot see open times until you connect Calendar and save weekly hours below."
              className="mb-2 shadow-none"
            />
          ) : (
            <p className="text-sm font-medium">
              Google Calendar connected
              {calendarEmail ? ` as ${calendarEmail}` : ""}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Signing in with an allowlisted Google account connects that calendar when it is not already connected.
            Visitors never sign in. If the consent screen is still in Testing, sign in again after 7 days.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!oauthConfigured} asChild>
              <a href="/api/google/calendar/start">
                {connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
              </a>
            </Button>
            {connected ? (
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  const result = await disconnectAdminCalendar();
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setMessage("Google Calendar disconnected.");
                  setReloadKey((current) => current + 1);
                }}
              >
                Disconnect calendar
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                await signOutAdmin();
                window.location.href = "/admin";
              }}
            >
              Sign out
            </Button>
          </div>
        </div>

        <form
          className="space-y-6"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError(null);
            setMessage(null);
            const windows = days.flatMap((day, index) =>
              day.enabled
                ? [
                    {
                      dayOfWeek: index,
                      startTime: day.startTime,
                      endTime: day.endTime,
                    },
                  ]
                : []
            );
            const result = await saveAdminScheduling({
              settings,
              windows,
              blockedDates,
            });
            setSaving(false);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setSaved(true);
            setMessage("Availability saved.");
            setReloadKey((current) => current + 1);
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="meeting-title">Meeting title</Label>
              <Input
                id="meeting-title"
                value={settings.meetingTitle}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    meetingTitle: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={settings.timezone}
                onValueChange={(timezone) =>
                  setSettings((current) => ({ ...current, timezone }))
                }
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timeZones.map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">Duration</Label>
              <Select
                value={String(settings.durationMinutes)}
                onValueChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    durationMinutes: Number(value),
                  }))
                }
              >
                <SelectTrigger id="duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[15, 30, 45, 60].map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {minutes} minutes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="buffer">Buffer between meetings</Label>
              <Select
                value={String(settings.bufferMinutes)}
                onValueChange={(value) =>
                  setSettings((current) => ({
                    ...current,
                    bufferMinutes: Number(value),
                  }))
                }
              >
                <SelectTrigger id="buffer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 5, 10, 15, 30].map((minutes) => (
                    <SelectItem key={minutes} value={String(minutes)}>
                      {minutes} minutes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notice">Minimum notice (hours)</Label>
              <Input
                id="notice"
                type="number"
                min={0}
                max={168}
                step={1}
                value={noticeHours}
                onChange={(event) => {
                  const hours = Number(event.target.value);
                  if (!Number.isFinite(hours)) return;
                  setSettings((current) => ({
                    ...current,
                    minNoticeMinutes: Math.max(0, Math.round(hours)) * 60,
                  }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="horizon">How many days ahead</Label>
              <Input
                id="horizon"
                type="number"
                min={1}
                max={365}
                step={1}
                value={settings.horizonDays}
                onChange={(event) => {
                  const daysAhead = Number(event.target.value);
                  if (!Number.isFinite(daysAhead)) return;
                  setSettings((current) => ({
                    ...current,
                    horizonDays: daysAhead,
                  }));
                }}
              />
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Weekly hours</legend>
            {DISPLAY_ORDER.map((day) => {
              const draft = days[day];
              return (
                <div key={day} className="flex flex-wrap items-center gap-3">
                  <Checkbox
                    id={`day-${day}`}
                    checked={draft.enabled}
                    onCheckedChange={(checked) => {
                      setDays((current) =>
                        current.map((item, index) =>
                          index === day
                            ? { ...item, enabled: checked === true }
                            : item
                        )
                      );
                    }}
                  />
                  <Label htmlFor={`day-${day}`} className="w-28">
                    {DAY_LABELS[day]}
                  </Label>
                  <Input
                    type="time"
                    aria-label={`${DAY_LABELS[day]} start`}
                    className="w-36"
                    disabled={!draft.enabled}
                    value={draft.startTime}
                    onChange={(event) => {
                      const startTime = event.target.value;
                      setDays((current) =>
                        current.map((item, index) =>
                          index === day ? { ...item, startTime } : item
                        )
                      );
                    }}
                  />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input
                    type="time"
                    aria-label={`${DAY_LABELS[day]} end`}
                    className="w-36"
                    disabled={!draft.enabled}
                    value={draft.endTime}
                    onChange={(event) => {
                      const endTime = event.target.value;
                      setDays((current) =>
                        current.map((item, index) =>
                          index === day ? { ...item, endTime } : item
                        )
                      );
                    }}
                  />
                </div>
              );
            })}
          </fieldset>

          <div className="space-y-3">
            <Label htmlFor="block-date">Blocked dates</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="block-date"
                type="date"
                className="w-44"
                value={blockDraft}
                onChange={(event) => setBlockDraft(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (!blockDraft || blockedDates.includes(blockDraft)) return;
                  setBlockedDates((current) =>
                    [...current, blockDraft].sort()
                  );
                  setBlockDraft("");
                }}
              >
                Block date
              </Button>
            </div>
            {blockedDates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No blocked dates.</p>
            ) : (
              <ul className="space-y-2">
                {blockedDates.map((date) => (
                  <li key={date} className="flex items-center gap-3 text-sm">
                    <span>{date}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        setBlockedDates((current) =>
                          current.filter((item) => item !== date)
                        )
                      }
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Button type="submit" disabled={saving || loading}>
            {saving ? "Saving..." : "Save availability"}
          </Button>
        </form>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">Upcoming bookings</h3>
          {bookings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">When</th>
                    <th className="px-4 py-2 font-medium">Guest</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Meet</th>
                    <th className="px-4 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="border-t border-border">
                      <td className="px-4 py-2 whitespace-nowrap">
                        {formatWhen(booking.startsAt)}
                      </td>
                      <td className="px-4 py-2">
                        <div>{booking.guestName}</div>
                        <div className="text-muted-foreground">
                          {booking.guestEmail}
                        </div>
                      </td>
                      <td className="px-4 py-2">{booking.status}</td>
                      <td className="px-4 py-2">
                        {booking.meetUrl ? (
                          <a
                            href={booking.meetUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            Join
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={async () => {
                            const result = await cancelAdminBooking(booking.id);
                            if (!result.ok) {
                              setError(result.error);
                              return;
                            }
                            setMessage("Meeting cancelled.");
                            setReloadKey((current) => current + 1);
                          }}
                        >
                          Cancel
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">Agent keys</h3>
          <p className="text-sm text-muted-foreground">
            A key with book scope can finish a meeting without the confirm page. A key with manage scope can list and cancel bookings. The secret is shown once.
            {webhookConfigured
              ? " A booking webhook is configured."
              : " No booking webhook is configured."}
          </p>
          {freshKey ? (
            <p className="break-all rounded-md border border-border bg-muted/40 p-3 text-sm" role="status">
              {freshKey}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="key-name">Key name</Label>
              <Input
                id="key-name"
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
                className="w-56"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={keyBook} onCheckedChange={(checked) => setKeyBook(checked === true)} />
              book
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={keyManage}
                onCheckedChange={(checked) => setKeyManage(checked === true)}
              />
              manage
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                setError(null);
                setFreshKey(null);
                const scopes = [keyBook ? "book" : "", keyManage ? "manage" : ""].filter(Boolean);
                const result = await createAdminAgentKey(keyName, scopes);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setFreshKey(result.token);
                setKeyName("");
                setMessage("Agent key created. Copy it now.");
                setReloadKey((current) => current + 1);
              }}
            >
              Create key
            </Button>
          </div>
          {agentKeys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agent keys.</p>
          ) : (
            <ul className="space-y-2">
              {agentKeys.map((key) => (
                <li key={key.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <span>{key.name}</span>
                  <span className="text-muted-foreground">{key.keyPrefix}…</span>
                  <span className="text-muted-foreground">{key.scopes.join(", ")}</span>
                  {key.revokedAt ? (
                    <span className="text-muted-foreground">Revoked</span>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={async () => {
                        const result = await revokeAdminAgentKey(key.id);
                        if (!result.ok) {
                          setError(result.error);
                          return;
                        }
                        setMessage("Agent key revoked.");
                        setReloadKey((current) => current + 1);
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {embedOrigin ? (
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Embed on your site</h3>
            <p className="text-sm text-muted-foreground">
              Add this to a page you already have. It shows the same booking widget and uses the hours saved here. The page at / stays available.
            </p>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
              <code>{embedSnippet(embedOrigin)}</code>
            </pre>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(embedSnippet(embedOrigin));
                  setCopiedEmbed(true);
                } catch {
                  setError("Could not copy the embed code.");
                }
              }}
            >
              {copiedEmbed ? "Copied" : "Copy embed code"}
            </Button>
          </div>
        ) : null}
        </>
        )}
      </CardContent>
    </Card>
  );
}
