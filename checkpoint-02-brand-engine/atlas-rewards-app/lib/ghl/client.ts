/**
 * Thin wrapper around the GHL (HighLevel) v2 Calendar API.
 *
 * Each business has its own per-location private integration token stored in
 * `businesses.ghl_api_key` plus `ghl_location_id` + `ghl_calendar_id`. We
 * keep this file dumb on purpose — no caching, no retries, just typed wrappers
 * the API routes can call.
 *
 * Docs: https://highlevel.stoplight.io/docs/integrations/  (Calendar v2)
 */

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-04-15";

export type GhlConfig = {
  apiKey: string;
  locationId: string;
  calendarId: string;
};

type FreeSlotsResponse = {
  // GHL returns one object per date: { "2026-05-19": { slots: [iso, iso, ...] } }
  [date: string]: { slots: string[] };
};

/** Fetch open slots for a single day. Returns array of ISO timestamps. */
export async function getFreeSlots(
  cfg: GhlConfig,
  dayYmd: string,        // "2026-05-19"
  durationMinutes: number,
): Promise<string[]> {
  // GHL expects ms-epoch range covering the local day.
  const start = new Date(dayYmd + "T00:00:00").getTime();
  const end   = new Date(dayYmd + "T23:59:59").getTime();

  const url = new URL(`${GHL_BASE}/calendars/${cfg.calendarId}/free-slots`);
  url.searchParams.set("startDate", String(start));
  url.searchParams.set("endDate",   String(end));
  // Duration affects slot windowing on GHL's side.
  url.searchParams.set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);

  const r = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      Version: GHL_VERSION,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!r.ok) {
    throw new Error(`GHL free-slots ${r.status}: ${await r.text()}`);
  }
  const json = await r.json() as FreeSlotsResponse;
  // Flatten across any keys returned (usually just the one date).
  const out: string[] = [];
  for (const k of Object.keys(json)) {
    if (k === "traceId") continue;
    const slots = json[k]?.slots ?? [];
    out.push(...slots);
  }
  return out;
}

/** Fetch already-booked appointments for a single day. */
export async function getBookedAppointments(
  cfg: GhlConfig,
  dayYmd: string,
): Promise<{ startTime: string; endTime: string; id: string }[]> {
  const start = new Date(dayYmd + "T00:00:00").getTime();
  const end   = new Date(dayYmd + "T23:59:59").getTime();

  const url = new URL(`${GHL_BASE}/calendars/events`);
  url.searchParams.set("locationId",  cfg.locationId);
  url.searchParams.set("calendarId",  cfg.calendarId);
  url.searchParams.set("startTime",   String(start));
  url.searchParams.set("endTime",     String(end));

  const r = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      Version: GHL_VERSION,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!r.ok) {
    // Don't blow up the whole slot fetch if this fails — return [].
    console.error(`GHL events ${r.status}: ${await r.text()}`);
    return [];
  }
  const json = await r.json() as { events?: { id: string; startTime: string; endTime: string }[] };
  return (json.events ?? []).map(e => ({ id: e.id, startTime: e.startTime, endTime: e.endTime }));
}

export type CreateAppointmentInput = {
  startTimeIso: string;
  durationMinutes: number;
  title: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

export type CreateAppointmentResult = {
  id: string;
  startTime: string;
  endTime: string;
};

/** Create an appointment in GHL — caller mirrors into bookings table afterwards. */
export async function createAppointment(
  cfg: GhlConfig,
  input: CreateAppointmentInput,
): Promise<CreateAppointmentResult> {
  const startMs = new Date(input.startTimeIso).getTime();
  const endMs   = startMs + input.durationMinutes * 60_000;

  const body = {
    calendarId: cfg.calendarId,
    locationId: cfg.locationId,
    startTime:  new Date(startMs).toISOString(),
    endTime:    new Date(endMs).toISOString(),
    title:      input.title,
    appointmentStatus: "confirmed",
    address:    "Booked via Atlas Engine",
    // Contact info — GHL will create/link a contact for us.
    contact: {
      firstName: (input.name ?? "").split(" ")[0] || "Guest",
      lastName:  (input.name ?? "").split(" ").slice(1).join(" ") || "",
      phone:     input.phone ?? undefined,
      email:     input.email ?? undefined,
    },
    notes:      input.notes ?? undefined,
  };

  const r = await fetch(`${GHL_BASE}/calendars/events/appointments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      Version: GHL_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new Error(`GHL create-appt ${r.status}: ${await r.text()}`);
  }
  const json = await r.json() as any;
  return {
    id: json.id ?? json.appointmentId ?? json.event?.id ?? "",
    startTime: json.startTime ?? body.startTime,
    endTime:   json.endTime ?? body.endTime,
  };
}
