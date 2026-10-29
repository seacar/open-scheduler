import { createRemoteJWKSet, jwtVerify } from "jose";
import { adminEmails } from "@/lib/admin-session";
import { siteBase } from "@/lib/site";

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
].join(" ");

const googleCerts = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
};

export type GoogleTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  idToken: string | null;
};

export class GoogleApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function googleRedirectUri(): string {
  return `${siteBase()}/api/google/calendar/callback`;
}

export function googleSetupMissing(): string[] {
  const missing: string[] = [];
  if (!process.env.GOOGLE_OAUTH_CLIENT_ID) missing.push("GOOGLE_OAUTH_CLIENT_ID");
  if (!process.env.GOOGLE_OAUTH_CLIENT_SECRET) missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!siteBase()) missing.push("NEXT_PUBLIC_BASE_URL");
  if (adminEmails().length === 0) missing.push("SCHEDULER_ADMIN_EMAILS");
  if (!process.env.SCHEDULER_SECRET) missing.push("SCHEDULER_SECRET");
  return missing;
}

export function googleSetupHint(): string | null {
  const missing = googleSetupMissing();
  if (missing.length === 0) return null;
  return `Add ${missing.join(", ")} before signing in. The redirect URI is {NEXT_PUBLIC_BASE_URL}/api/google/calendar/callback.`;
}

export function googleOAuthConfigured(): boolean {
  return googleSetupHint() === null;
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function readGoogleError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } | string };
    if (typeof body.error === "string") return body.error;
    if (body.error?.message) return body.error.message;
  } catch {
    return response.statusText;
  }
  return response.statusText;
}

async function postToken(body: URLSearchParams): Promise<GoogleTokenResponse> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new GoogleApiError(response.status, await readGoogleError(response));
  }
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
  };
  if (!data.access_token || !data.expires_in) {
    throw new Error("Google did not return an access token");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    idToken: data.id_token ?? null,
  };
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
  return postToken(
    new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    })
  );
}

export async function refreshGoogleToken(refreshToken: string): Promise<GoogleTokenResponse> {
  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    })
  );
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("Google OAuth is not configured");
  const { payload } = await jwtVerify(idToken, googleCerts, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });
  const email = typeof payload.email === "string" ? payload.email : "";
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub || !email) throw new Error("Google did not return an email");
  return {
    sub,
    email,
    emailVerified: payload.email_verified === true,
  };
}

async function googleFetch(accessToken: string, path: string, init: RequestInit): Promise<Response> {
  return fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export type GoogleCalendarEvent = {
  status?: string;
  eventType?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

export async function listPrimaryEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleCalendarEvent[]> {
  const events: GoogleCalendarEvent[] = [];
  let pageToken = "";

  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      showDeleted: "false",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await googleFetch(
      accessToken,
      `/calendars/primary/events?${params.toString()}`,
      { method: "GET" }
    );
    if (!response.ok) {
      throw new GoogleApiError(response.status, await readGoogleError(response));
    }
    const data = (await response.json()) as {
      items?: GoogleCalendarEvent[];
      nextPageToken?: string;
    };
    events.push(...(data.items ?? []));
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return events;
}

export async function insertCalendarEvent(
  accessToken: string,
  event: {
    requestId: string;
    summary: string;
    description: string;
    startsAt: string;
    endsAt: string;
    timeZone: string;
    guestEmail: string;
  }
): Promise<{ id: string; meetUrl: string | null }> {
  const params = new URLSearchParams({
    conferenceDataVersion: "1",
    sendUpdates: "all",
  });
  const response = await googleFetch(
    accessToken,
    `/calendars/primary/events?${params.toString()}`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startsAt, timeZone: event.timeZone },
        end: { dateTime: event.endsAt, timeZone: event.timeZone },
        attendees: [{ email: event.guestEmail }],
        conferenceData: {
          createRequest: {
            requestId: event.requestId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    }
  );
  if (!response.ok) {
    throw new GoogleApiError(response.status, await readGoogleError(response));
  }
  const data = (await response.json()) as {
    id?: string;
    hangoutLink?: string;
    conferenceData?: {
      entryPoints?: { entryPointType?: string; uri?: string }[];
    };
  };
  if (!data.id) throw new Error("Google did not return an event id");
  const meetUrl =
    data.hangoutLink ??
    data.conferenceData?.entryPoints?.find(
      (entry) => entry.entryPointType === "video" && entry.uri
    )?.uri ??
    null;
  return { id: data.id, meetUrl };
}

export async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
  const params = new URLSearchParams({ sendUpdates: "all" });
  const response = await googleFetch(
    accessToken,
    `/calendars/primary/events/${encodeURIComponent(eventId)}?${params.toString()}`,
    { method: "DELETE" }
  );
  if (response.status === 404 || response.status === 410) return;
  if (!response.ok) {
    throw new GoogleApiError(response.status, await readGoogleError(response));
  }
}
