/**
 * lib/google-calendar.ts — CP-189 · Atlas demo calendar on Google Workspace
 *
 * Server-only. A Google Cloud service account with DOMAIN-WIDE DELEGATION
 * acts as andrew@atlas-engine.app on his own calendar: it reads free/busy
 * and creates the demo event (with a Meet link and an invite to the
 * prospect). No SDK — one signed JWT, two REST calls. Nothing to pay for:
 * Calendar API is free on the Workspace account Atlas already has.
 *
 * Env (Vercel → Settings → Environment Variables):
 *   GOOGLE_SA_CLIENT_EMAIL   service account email (…@….iam.gserviceaccount.com)
 *   GOOGLE_SA_PRIVATE_KEY    the "private_key" from the JSON key (keep the \n's)
 *   GOOGLE_CALENDAR_USER     andrew@atlas-engine.app  (who the SA acts as)
 *   GOOGLE_CALENDAR_ID       optional, defaults to GOOGLE_CALENDAR_USER (primary)
 *   GOOGLE_BUSY_CALENDARS    optional, comma list of extra calendars to treat as
 *                            busy (e.g. a class-schedule calendar or a personal gmail
 *                            shared to andrew@ with free/busy visibility)
 * Setup steps: checkpoint-189-demo-google-calendar/README.md
 */
import { createSign } from "crypto";

const SCOPE = "https://www.googleapis.com/auth/calendar";
const API = "https://www.googleapis.com/calendar/v3";

export function calendarConfigured(): boolean {
  return !!(process.env.GOOGLE_SA_CLIENT_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY && process.env.GOOGLE_CALENDAR_USER);
}

function calendarId() {
  return process.env.GOOGLE_CALENDAR_ID || process.env.GOOGLE_CALENDAR_USER || "primary";
}

function b64url(s: string | Buffer) {
  return Buffer.from(s).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp - 60 > Date.now() / 1000) return cached.token;
  const iat = Math.floor(Date.now() / 1000);
  const claims = { iss: process.env.GOOGLE_SA_CLIENT_EMAIL, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3600, sub: process.env.GOOGLE_CALENDAR_USER };
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify(claims))}`;
  const key = (process.env.GOOGLE_SA_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const sig = createSign("RSA-SHA256").update(unsigned).sign(key);
  const assertion = `${unsigned}.${b64url(sig)}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`Google auth failed: ${j.error_description || j.error || r.status}`);
  cached = { token: j.access_token, exp: iat + (j.expires_in ?? 3600) };
  return cached.token;
}

async function gcal<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Google Calendar ${r.status}: ${j?.error?.message ?? "error"}`);
  return j as T;
}

export type Busy = { start: number; end: number };

/** Busy blocks (ms epoch) on the demo calendar and any extra "busy" calendars. */
export async function getBusy(from: Date, to: Date): Promise<Busy[]> {
  const ids = [calendarId(), ...(process.env.GOOGLE_BUSY_CALENDARS ?? "").split(",").map((s) => s.trim()).filter(Boolean)];
  const j = await gcal<{ calendars: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }> }>("POST", "/freeBusy", {
    timeMin: from.toISOString(), timeMax: to.toISOString(), items: ids.map((id) => ({ id })),
  });
  const out: Busy[] = [];
  for (const c of Object.values(j.calendars ?? {})) for (const b of c.busy ?? []) out.push({ start: Date.parse(b.start), end: Date.parse(b.end) });
  return out;
}

export type CreatedEvent = { id: string; htmlLink: string; meetUrl: string | null };

/** Create the demo on Andrew's calendar, invite the prospect, attach a Meet link. Google emails the invite. */
export async function createDemoEvent(i: { start: Date; minutes: number; summary: string; description: string; attendee: { email: string; name: string }; requestId: string }): Promise<CreatedEvent> {
  const end = new Date(i.start.getTime() + i.minutes * 60_000);
  const ev = await gcal<{ id: string; htmlLink: string; hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] } }>(
    "POST",
    `/calendars/${encodeURIComponent(calendarId())}/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      summary: i.summary,
      description: i.description,
      start: { dateTime: i.start.toISOString() },
      end: { dateTime: end.toISOString() },
      attendees: [{ email: i.attendee.email, displayName: i.attendee.name }],
      conferenceData: { createRequest: { requestId: i.requestId, conferenceSolutionKey: { type: "hangoutsMeet" } } },
      reminders: { useDefault: false, overrides: [{ method: "email", minutes: 24 * 60 }, { method: "popup", minutes: 30 }] },
      guestsCanModify: false,
      guestsCanSeeOtherGuests: false,
    },
  );
  const meet = ev.hangoutLink ?? ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ?? null;
  return { id: ev.id, htmlLink: ev.htmlLink, meetUrl: meet };
}
