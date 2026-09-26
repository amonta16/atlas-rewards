/**
 * lib/booking.ts — CP-147 · Booking v2 (resources with capacity)
 *
 * Shared by the customer flow (components/customer/resource-booking.tsx),
 * the front-desk schedule (components/manager/bookings-desk.tsx) and the
 * Home "Book" card. Types mirror the cp147 SQL exactly.
 *
 * PAYMENTS ARE DELIBERATELY NOT WIRED. Every booking carries the money
 * fields (amount_cents / deposit_cents / payment_status / provider / ref) so
 * a Stripe or Square adapter can be dropped in later without touching the
 * schema or the UI: implement BookingPaymentProvider, register it in
 * paymentProviderFor(), and have its webhook route call the service-role
 * set_booking_payment() RPC. Until then `noPayment` is the provider — it
 * never charges and just tells the UI what to say ("pay at the counter").
 */
import type { Business } from "@/lib/types/database";

export type BookingResource = {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  image_url: string | null;
  units: number;
  unit_label: string;
  durations: number[];
  slot_minutes: number;
  buffer_minutes: number;
  max_party: number;
  price_cents: number | null;
  deposit_cents: number | null;
  /** {"1":[["10:00","22:00"]], …} keyed by isodow (1 = Mon … 7 = Sun). null → business booking_hours. */
  hours: Record<string, [string, string][]> | null;
  lead_minutes: number;
  horizon_days: number;
  is_active: boolean;
  sort_order: number;
  /** CP-155: section this resource sits in ("Batting cages", "Parties", "Pool"). null → "Other". */
  category?: string | null;
  /** CP-163: selectable packages (party rooms). Empty = plain booking. */
  packages?: BookingPackage[] | null;
};

/** CP-163: one package on a resource ("Birthday Blast · $249 · 2 hrs"). */
export type BookingPackage = {
  id: string;
  name: string;
  price_cents: number | null;
  blurb: string | null;
  includes: string[];
  /** Fixed length in minutes; null = customer picks from the resource's durations. */
  duration: number | null;
  image_url?: string | null;
};

/** CP-155: starter chips in the builder. Free text — any label becomes a section. */
export const BOOKING_CATEGORY_SUGGESTIONS = ["Batting cages", "Parties", "Pool", "Golf sims", "Paintball", "Lanes", "Rooms"];

/** CP-155: group resources into ordered sections (order = first appearance by sort_order). */
export function groupResources<T extends { category?: string | null; sort_order: number }>(resources: T[]): { category: string; items: T[] }[] {
  const out: { category: string; items: T[] }[] = [];
  for (const r of [...resources].sort((a, b) => a.sort_order - b.sort_order)) {
    const c = (r.category ?? "").trim() || "Other";
    let g = out.find(x => x.category === c);
    if (!g) { g = { category: c, items: [] }; out.push(g); }
    g.items.push(r);
  }
  // "Other" always last.
  return out.sort((a, b) => (a.category === "Other" ? 1 : 0) - (b.category === "Other" ? 1 : 0));
}

export type BookingSlot = { slot_start: string; slot_end: string; units_left: number };

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
export type PaymentStatus = "none" | "due" | "paid" | "refunded" | "failed";

export type DeskBooking = {
  id: string;
  resource_id: string | null;
  resource_name: string;
  unit_label: string;
  scheduled_at: string;
  scheduled_end: string;
  duration_minutes: number;
  party_size: number;
  status: BookingStatus;
  source: "app" | "desk" | "ghl" | "web";
  payment_status: PaymentStatus;
  amount_cents: number | null;
  deposit_cents: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  notes: string | null;
  membership_id: string | null;
  created_at: string;
};

export type MyBooking = {
  id: string;
  resource_name: string;
  emoji: string | null;
  scheduled_at: string;
  scheduled_end: string;
  duration_minutes: number;
  party_size: number;
  status: BookingStatus;
  payment_status: PaymentStatus;
  deposit_cents: number | null;
  notes: string | null;
};

/* ── formatting helpers ─────────────────────────────────────────────── */

export const dollars = (cents: number | null | undefined) =>
  cents == null ? null : `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function durationLabel(mins: number): string {
  if (mins % 60 === 0) return mins === 60 ? "1 hour" : `${mins / 60} hours`;
  if (mins > 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins} min`;
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function dayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** YYYY-MM-DD in the browser's local clock (the venue's tablet / the customer's phone). */
export function isoDay(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const STATUS_STYLE: Record<BookingStatus, { label: string; cls: string }> = {
  pending:   { label: "Requested", cls: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmed", cls: "bg-emerald-100 text-emerald-800" },
  completed: { label: "Done",      cls: "bg-zinc-100 text-zinc-700" },
  cancelled: { label: "Cancelled", cls: "bg-rose-100 text-rose-800" },
  no_show:   { label: "No-show",   cls: "bg-rose-100 text-rose-800" },
};

/** Is booking switched on for this business? (builder toggle, CP-16 flag reused) */
export function bookingEnabled(b: Pick<Business, "widget_config">): boolean {
  return !!b.widget_config?.booking;
}

/* ── payment provider abstraction (v2 = none) ───────────────────────── */

export type PaymentIntentRequest = {
  bookingId: string;
  businessId: string;
  amountCents: number;
  /** "deposit" holds the slot; "full" pays the whole booking up front. */
  kind: "deposit" | "full";
  customerEmail?: string | null;
};

export type PaymentIntentResult =
  | { mode: "none"; message: string }                       // nothing to collect online
  | { mode: "redirect"; url: string }                       // hosted checkout (Stripe Checkout, Square)
  | { mode: "client_secret"; clientSecret: string };        // embedded element flow

export interface BookingPaymentProvider {
  readonly id: "none" | "stripe" | "square";
  /** What the customer sees at confirm time. */
  describe(resource: Pick<BookingResource, "price_cents" | "deposit_cents">): string;
  /** Create whatever the provider needs to take money. The webhook route
   *  for the provider is what finally calls set_booking_payment(). */
  createIntent(req: PaymentIntentRequest): Promise<PaymentIntentResult>;
}

export const noPayment: BookingPaymentProvider = {
  id: "none",
  describe(r) {
    if (r.deposit_cents && r.deposit_cents > 0) return `${dollars(r.deposit_cents)} deposit due at the counter to hold your spot`;
    if (r.price_cents && r.price_cents > 0) return `${dollars(r.price_cents)} — pay when you arrive`;
    return "No payment needed to book";
  },
  async createIntent() {
    return { mode: "none", message: "Pay at the counter when you arrive." };
  },
};

/** Single switch for the future adapter. Reads a per-business setting once one exists. */
export function paymentProviderFor(_business: Pick<Business, "id">): BookingPaymentProvider {
  return noPayment;
}
