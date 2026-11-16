/**
 * lib/booking-alerts.ts — CP-247 · "you have a new booking" email to the owner
 *
 * Built by /api/bookings/owner-alerts from a row claimed out of the
 * claim_booking_owner_alerts() queue. Plain text on purpose (like the waiver
 * mail): it reads well in any inbox and on a phone lock screen. Reply-To is
 * the customer when they gave an email, so the owner can just hit Reply.
 */

export type OwnerAlertRow = {
  booking_id: string;
  business_id: string;
  business_name: string;
  business_slug: string;
  timezone: string | null;
  emails: string[];
  resource_name: string;
  scheduled_at: string;
  duration_minutes: number | null;
  party_size: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  notes: string | null;
  source: string | null;
  status: string | null;
};

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.atlas-engine.app").replace(/\/$/, "");

function when(iso: string, tz: string | null): { day: string; time: string } {
  const d = new Date(iso);
  const zone = tz || "America/Los_Angeles";
  try {
    return {
      day: d.toLocaleDateString("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric" }),
      time: d.toLocaleTimeString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }),
    };
  } catch {
    return { day: d.toDateString(), time: d.toTimeString().slice(0, 5) };
  }
}

function length(min: number | null): string | null {
  if (!min) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return `${h} hr${h > 1 ? "s" : ""}${m ? ` ${m} min` : ""}`;
}

const SOURCE_LABEL: Record<string, string> = { app: "the app", web: "the website" };

export function ownerAlertEmail(r: OwnerAlertRow): { subject: string; text: string; replyTo: string | null } {
  const { day, time } = when(r.scheduled_at, r.timezone);
  const who = r.customer_name?.trim() || "A customer";
  const from = SOURCE_LABEL[r.source ?? ""] ?? "online";
  const lines = [
    `${who} just booked through ${from}.`,
    "",
    `What:   ${r.resource_name}`,
    `When:   ${day} at ${time}`,
    length(r.duration_minutes) ? `Length: ${length(r.duration_minutes)}` : null,
    r.party_size && r.party_size > 1 ? `Party:  ${r.party_size} people` : null,
    "",
    `Name:   ${r.customer_name ?? "—"}`,
    `Phone:  ${r.customer_phone ?? "—"}`,
    r.customer_email ? `Email:  ${r.customer_email}` : null,
    r.notes ? `Notes:  ${r.notes}` : null,
    "",
    r.status === "pending"
      ? "It's waiting for you to confirm on the front desk:"
      : "See it on the front desk:",
    `${SITE}/${r.business_slug}/frontdesk`,
    "",
    `— Atlas Engine, for ${r.business_name}`,
  ].filter((l): l is string => l !== null);

  return {
    subject: `New booking: ${r.resource_name}, ${day} at ${time} (${who})`,
    text: lines.join("\n"),
    replyTo: r.customer_email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.customer_email) ? r.customer_email : null,
  };
}
