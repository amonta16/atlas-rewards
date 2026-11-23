/**
 * lib/outreach/time.ts — CP-250 · send windows in the LEAD's time zone.
 * A spa in Phoenix gets email at 9am Phoenix time, not 9am in Morro Bay.
 */

const PACIFIC = ["CA", "WA", "OR", "NV"];
const MOUNTAIN = ["CO", "UT", "NM", "WY", "MT", "ID"];
const CENTRAL = ["TX", "IL", "MN", "WI", "IA", "MO", "AR", "LA", "MS", "AL", "OK", "KS", "NE", "SD", "ND", "TN"];
const STATE_NAMES: Record<string, string> = {
  california: "CA", washington: "WA", oregon: "OR", nevada: "NV", arizona: "AZ", colorado: "CO", utah: "UT", "new mexico": "NM",
  wyoming: "WY", montana: "MT", idaho: "ID", texas: "TX", illinois: "IL", minnesota: "MN", wisconsin: "WI", iowa: "IA",
  missouri: "MO", arkansas: "AR", louisiana: "LA", mississippi: "MS", alabama: "AL", oklahoma: "OK", kansas: "KS",
  nebraska: "NE", "south dakota": "SD", "north dakota": "ND", tennessee: "TN", hawaii: "HI", alaska: "AK",
};

/** Two-letter state → IANA time zone (US only; anything unknown stays Pacific, Atlas's home). */
export function timezoneFor(state: string | null | undefined): string {
  const raw = (state ?? "").trim();
  const s = raw.length === 2 ? raw.toUpperCase() : STATE_NAMES[raw.toLowerCase()] ?? "";
  if (!s) return "America/Los_Angeles";
  if (PACIFIC.includes(s)) return "America/Los_Angeles";
  if (s === "AZ") return "America/Phoenix";
  if (MOUNTAIN.includes(s)) return "America/Denver";
  if (CENTRAL.includes(s)) return "America/Chicago";
  if (s === "HI") return "Pacific/Honolulu";
  if (s === "AK") return "America/Anchorage";
  return "America/New_York";
}

/** Local weekday (0 = Sunday) and hour in a time zone. */
export function localParts(at: number, tz: string): { day: number; hour: number; date: string } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", hour12: false, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(f.formatToParts(new Date(at)).map((p) => [p.type, p.value]));
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { day, hour: Number(parts.hour) % 24, date: `${parts.year}-${parts.month}-${parts.day}` };
}

export function inWindow(at: number, tz: string, s: { send_days: number[]; window_start: number; window_end: number }): boolean {
  const { day, hour } = localParts(at, tz);
  return s.send_days.includes(day) && hour >= s.window_start && hour < s.window_end;
}

/** Midnight Pacific today, as an ISO string: the daily cap counts sends since then. */
export function startOfPacificDay(at: number): string {
  const { date } = localParts(at, "America/Los_Angeles");
  // Find the UTC instant of local midnight by trying both possible offsets (PST −8, PDT −7).
  for (const off of [7, 8]) {
    const t = Date.parse(`${date}T00:00:00Z`) + off * 3600_000;
    if (localParts(t, "America/Los_Angeles").hour === 0 && localParts(t, "America/Los_Angeles").date === date) return new Date(t).toISOString();
  }
  return new Date(Date.parse(`${date}T08:00:00Z`)).toISOString();
}

export function randomGapMs(min: number, max: number): number {
  const lo = Math.max(1, min), hi = Math.max(lo, max);
  return Math.round((lo + Math.random() * (hi - lo)) * 60_000);
}
