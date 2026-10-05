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

/** Slot grid (minutes). */
const SLOT_MINUTES = 30;
/** How far out people can book. */
export const BOOKING_WINDOW_DAYS = 21;
/** Minimum lead time before a slot can be booked. */
const LEAD_TIME_HOURS = 4;
// CP-189: SLOT_MINUTES is the grid; CALL_MINUTES + BUFFER_MINUTES must fit in it.

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
/**
 * CP-189: weekly hours Andrew takes demo calls, in HOST_TZ. Google Calendar
 * free/busy is subtracted from these, so classes, practice visits and
 * anything else on his calendar block slots automatically. Edit here.
 * Day numbers: 0 Sun … 6 Sat. Each range is [startHour, endHour) — halves ok (9.5 = 9:30).
 */
export const WEEKLY_HOURS: Record<number, Array<[number, number]>> = {
  1: [[9, 18]],
  2: [[9, 18]],
  3: [[9, 18]],
  4: [[9, 18]],
  5: [[9, 17]],
};
/** Call length shown to the prospect, and the gap kept free after it. */
export const CALL_MINUTES = 20;
export const BUFFER_MINUTES = 10;

/** Candidate slot starts for one HOST_TZ day from WEEKLY_HOURS (no busy check). */
export function candidateSlots(y: number, m: number, d: number, now = new Date()): Slot[] {
  const noon = zonedToUtc(y, m, d, 12, 0, HOST_TZ);
  const wdName = new Intl.DateTimeFormat("en-US", { timeZone: HOST_TZ, weekday: "short" }).format(noon);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wdName);
  const diffDays = (noon.getTime() - now.getTime()) / 86400000;
  if (diffDays < -0.5 || diffDays > BOOKING_WINDOW_DAYS) return [];
  const cutoff = now.getTime() + LEAD_TIME_HOURS * 3600000;
  const out: Slot[] = [];
  for (const [a, b] of WEEKLY_HOURS[wd] ?? []) {
    for (let t = a * 60; t + CALL_MINUTES <= b * 60; t += SLOT_MINUTES) {
      const h = Math.floor(t / 60), mi = t % 60;
      const start = zonedToUtc(y, m, d, h, mi, HOST_TZ);
      if (start.getTime() < cutoff) continue;
      out.push({ startsAt: start, label: `${h}:${String(mi).padStart(2, "0")}` });
    }
  }
  return out;
}

/** True if [start, start+call+buffer) overlaps any busy block. */
export function overlapsBusy(start: Date, busy: Array<{ start: number; end: number }>): boolean {
  const s = start.getTime() - BUFFER_MINUTES * 60_000;
  const e = start.getTime() + (CALL_MINUTES + BUFFER_MINUTES) * 60_000;
  return busy.some((b) => b.start < e && b.end > s);
}

/** All open slot starts in the booking window, given busy blocks. Server + mock both use this. */
export function openSlots(busy: Array<{ start: number; end: number }>, now = new Date()): Date[] {
  const out: Date[] = [];
  for (let i = 0; i <= BOOKING_WINDOW_DAYS; i++) {
    const k = dayKey(new Date(now.getTime() + i * 86400000));
    const [y, m, d] = [+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)];
    for (const s of candidateSlots(y, m, d, now)) if (!overlapsBusy(s.startsAt, busy)) out.push(s.startsAt);
  }
  return out;
}

/** Legacy (mock) helpers — used only when the calendar isn't configured. */
export function isDayAvailable(y: number, m: number, d: number, now = new Date()): boolean {
  return getAvailableSlots(y, m, d, now).length > 0;
}
export function getAvailableSlots(y: number, m: number, d: number, now = new Date()): Slot[] {
  return candidateSlots(y, m, d, now).filter((s) => hash(`${y}-${m}-${d}-${s.label}`) >= 0.3);
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
