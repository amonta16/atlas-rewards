/**
 * Demo-call availability — CP-101.
 *
 * MOCK DATA for now. Every function here is the seam for a real provider:
 *   • Calendly  → replace getAvailableSlots() with a fetch to
 *                 /api/landing/availability that proxies Calendly's
 *                 "event type available times" endpoint.
 *   • Google Calendar → same route, backed by freebusy.query on the
 *                 Atlas calendar with a service account.
 *   • Custom     → store bookings in Supabase and subtract them here.
 * The UI (booking-calendar.tsx) only calls these three exports.
 */

/** Atlas's own timezone — slots are defined in this zone. */
export const HOST_TZ = "America/Los_Angeles";

/** Working hours in HOST_TZ and slot length. */
const START_HOUR = 9;
const END_HOUR = 17; // exclusive
const SLOT_MINUTES = 30;
/** How far out people can book. */
export const BOOKING_WINDOW_DAYS = 21;
/** Minimum lead time before a slot can be booked. */
const LEAD_TIME_HOURS = 4;

export type Slot = { startsAt: Date; label: string };

/** Offset (ms) between UTC and `tz` at the given UTC instant. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - utcMs;
}

/** Build a UTC Date for wall-clock y/m/d h:mm in `tz`. */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, m, d, h, mi);
  const off = tzOffsetMs(guess, tz);
  return new Date(guess - off);
}

/** Calendar-day key (YYYY-MM-DD) for a Date in HOST_TZ. */
export function dayKey(date: Date, tz = HOST_TZ): string {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(date);
}

/** Deterministic pseudo-random so the mock looks "real" but is stable across renders. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/** Is this calendar day (HOST_TZ) bookable at all? */
export function isDayAvailable(y: number, m: number, d: number, now = new Date()): boolean {
  const noon = zonedToUtc(y, m, d, 12, 0, HOST_TZ);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: HOST_TZ, weekday: "short" }).format(noon);
  if (wd === "Sat" || wd === "Sun") return false;
  const diffDays = (noon.getTime() - now.getTime()) / 86400000;
  if (diffDays < -0.5 || diffDays > BOOKING_WINDOW_DAYS) return false;
  // Mock: ~1 in 7 weekdays is "fully booked".
  if (hash(`${y}-${m}-${d}`) < 0.14) return false;
  return getAvailableSlots(y, m, d, now).length > 0;
}

/** Available slots for a HOST_TZ calendar day, as UTC instants. */
export function getAvailableSlots(y: number, m: number, d: number, now = new Date()): Slot[] {
  const out: Slot[] = [];
  const cutoff = now.getTime() + LEAD_TIME_HOURS * 3600000;
  for (let h = START_HOUR; h < END_HOUR; h++) {
    for (let mi = 0; mi < 60; mi += SLOT_MINUTES) {
      const start = zonedToUtc(y, m, d, h, mi, HOST_TZ);
      if (start.getTime() < cutoff) continue;
      // Mock: drop ~35% of slots so days look partially booked; keep lunch free-ish.
      const r = hash(`${y}-${m}-${d}-${h}-${mi}`);
      if (r < 0.35) continue;
      if (h === 12 && mi === 0) continue;
      out.push({ startsAt: start, label: `${h}:${String(mi).padStart(2, "0")}` });
    }
  }
  return out;
}

/** Common zones offered in the picker, plus whatever the browser reports. */
export const COMMON_TZS = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/New_York",
  "Pacific/Honolulu",
  "America/Anchorage",
];

export function tzLabel(tz: string, at = new Date()): string {
  try {
    const short = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value;
    return `${tz.replace(/_/g, " ").replace("America/", "").replace("Pacific/", "")} (${short})`;
  } catch {
    return tz;
  }
}
