/**
 * lib/raffles.ts — CP-85
 *
 * Shared types + time helpers for the Raffle Giveaway offer type.
 *
 * Storage is always UTC (timestamptz). Every raffle carries the IANA time
 * zone the OWNER picked; the manager UI edits wall-clock times in that
 * zone and the helpers here do the conversion both ways (two-pass Intl
 * offset trick — handles DST edges without a date library).
 */

export type RaffleState = "scheduled" | "open" | "ended" | "winner_selected" | "cancelled";
export type RaffleClaimStatus = "not_claimed" | "claimed" | "expired";
export type WinnerDisplay = "first_last_initial" | "full_name";

/** Row shape from list_active_raffles (customer feed). */
export type CustomerRaffle = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  prize: string;
  entry_cost_points: number;
  starts_at: string;
  ends_at: string;
  timezone: string;
  max_entries_per_customer: number;
  total_entry_limit: number | null;
  terms: string | null;
  claim_deadline_days: number | null;
  state: RaffleState;
  total_entries: number;
  drawn_at: string | null;
  winner_display_name: string | null;
  i_won: boolean;
  my_entry_count: number;
};

/** Row shape from list_raffles_for_business (staff list). */
export type AdminRaffle = CustomerRaffle & {
  status: string;
  winner_display: WinnerDisplay;
  prize_claim_status: RaffleClaimStatus;
  unique_participants: number;
  /** CP-85.1: featured raffles take over the sticky banner + Home featured card. */
  is_featured: boolean;
};

/** Row shape from featured_raffle (sticky banner + Home featured card). */
export type FeaturedRaffle = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  prize: string;
  entry_cost_points: number;
  starts_at: string;
  ends_at: string;
  timezone: string;
  state: "scheduled" | "open";
  total_entries: number;
};

/** Row shape from raffle_participants (staff detail). */
export type RaffleParticipant = {
  membership_id: string;
  full_name: string;
  entry_count: number;
  points_spent: number;
  first_entry_at: string;
  last_entry_at: string;
  is_winner: boolean;
};

/** Short curated zone list + whatever the browser reports, deduped. */
export const RAFFLE_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Denver",      label: "Mountain (Denver)" },
  { value: "America/Phoenix",     label: "Arizona (Phoenix)" },
  { value: "America/Chicago",     label: "Central (Chicago)" },
  { value: "America/New_York",    label: "Eastern (New York)" },
  { value: "America/Anchorage",   label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu",    label: "Hawaii (Honolulu)" },
];

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  } catch {
    return "America/Los_Angeles";
  }
}

/** Offset (ms) between a zone's wall clock and UTC at a given instant. */
function tzOffsetMs(at: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  return asUtc - at.getTime();
}

/** "YYYY-MM-DDTHH:mm" wall time in tz → UTC ISO string. */
export function zonedToUtcIso(local: string, tz: string): string {
  const [d, t] = local.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const [hh, mm] = (t ?? "00:00").split(":").map(Number);
  const guess = Date.UTC(y, m - 1, day, hh, mm);
  // Two passes converge across DST boundaries.
  let off = tzOffsetMs(new Date(guess), tz);
  let ts = guess - off;
  off = tzOffsetMs(new Date(ts), tz);
  ts = guess - off;
  return new Date(ts).toISOString();
}

/** UTC ISO → "YYYY-MM-DDTHH:mm" wall time in tz (for datetime-local inputs). */
export function utcToZonedLocal(iso: string, tz: string): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(iso))) p[part.type] = part.value;
  const hour = p.hour === "24" ? "00" : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`;
}

/** Human display in the raffle's zone, e.g. "Jul 30, 7:00 PM PDT". */
export function formatRaffleTime(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: tz, month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit", timeZoneName: "short",
    });
  } catch {
    return new Date(iso).toLocaleString();
  }
}

/** Countdown label with second-level precision under an hour. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const sec = Math.floor(ms / 1000);
  const day = Math.floor(sec / 86400);
  const hr = Math.floor((sec % 86400) / 3600);
  const min = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (day > 0) return `${day}d ${hr}h`;
  if (hr > 0) return `${hr}h ${min}m`;
  if (min > 0) return `${min}m ${s}s`;
  return `${s}s`;
}

/**
 * Fire-and-forget: draw any raffle that's past its end (lazy sweep).
 *
 * CP-88: STAFF SURFACES ONLY. This used to be called from the customer
 * Rewards tab on mount, which meant every customer triggered a global
 * service-role sweep — 1,000 customers, 1,000 concurrent sweeps serializing
 * on the same row lock, for work that only needs doing once. Those call
 * sites are gone (see components/customer/raffle-section.tsx); customers now
 * rely on the pg_cron backstop, and their UI picks up the finalized state
 * through the Realtime subscription on `raffles` that's already there.
 *
 * `/api/raffles/sweep` now requires either the machine secret or a signed-in
 * session, so this same-origin fetch keeps working from staff pages (cookies
 * ride along automatically) and is closed to anonymous callers.
 *
 * Do NOT reintroduce this into any per-customer render path.
 */
export function sweepDueRaffles(): void {
  try {
    fetch("/api/raffles/sweep", { method: "POST" }).catch(() => {});
  } catch {
    /* never blocks the UI */
  }
}

export const RAFFLE_STATE_META: Record<RaffleState, { label: string; chip: string }> = {
  scheduled:       { label: "Scheduled",       chip: "bg-sky-100 text-sky-700" },
  open:            { label: "Open",            chip: "bg-emerald-100 text-emerald-700" },
  ended:           { label: "Ended",           chip: "bg-zinc-200 text-zinc-700" },
  winner_selected: { label: "Winner Selected", chip: "bg-amber-100 text-amber-700" },
  cancelled:       { label: "Cancelled",       chip: "bg-rose-100 text-rose-700" },
};
