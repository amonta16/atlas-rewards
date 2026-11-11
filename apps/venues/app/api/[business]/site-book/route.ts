import { NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { EMAIL_RE, clean } from "@/lib/landing/notify";
import { bookingEnabled, dollars, type BookingPackage } from "@/lib/booking";
import { siteContentFor } from "@/lib/venue-site/content";
import type { Business } from "@/lib/types/database";

/**
 * POST /api/[business]/site-book — book from the venue's public website.
 *
 * The website books into the SAME bookings table, through the SAME capacity
 * check (booking_resource_reserve, under its advisory lock), as the customer
 * app and the front desk. So a cage booked on the site is gone from the app
 * the same second, and it shows on the desk's day sheet as a pending request
 * with source = 'web'.
 *
 * Guests don't need an account: name + mobile is enough. If the visitor is
 * signed in to the business's app in this browser (same-domain session
 * cookie) and is a member, the booking is attached to their membership and
 * shows under "Your bookings" in the app.
 *
 * Body: { resource_id, starts_at, duration, party, name, phone, email?, notes?, package?, company_hp? }
 * → { ok: true, id, member } | { error }
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Messages the reserve function raises that are safe and useful to show a guest. */
const FRIENDLY = [
  "that time just filled up",
  "that start time is too soon",
  "party size must be between",
  "that length is not offered",
  "this is not bookable right now",
];

export async function POST(req: Request, { params }: { params: { business: string } }) {
  const rl = await rateLimit(clientKey(req, "site-book"), 8, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (b.company_hp) return NextResponse.json({ ok: true, id: null, member: false }); // honeypot

  const resourceId = clean(b.resource_id, 40);
  const startsAt = clean(b.starts_at, 40);
  const duration = Number(b.duration);
  const party = Number(b.party);
  const name = clean(b.name, 80);
  const phone = clean(b.phone, 30);
  const email = clean(b.email, 200).toLowerCase();
  const notes = clean(b.notes, 200);
  const pkgName = clean(b.package, 60);

  if (!UUID.test(resourceId) || !Number.isFinite(duration) || !Number.isFinite(party) || Number.isNaN(Date.parse(startsAt))) {
    return NextResponse.json({ error: "Pick a time and try again." }, { status: 400 });
  }
  if (name.length < 2) return NextResponse.json({ error: "Add your name so we know who's coming." }, { status: 400 });
  if (phone.replace(/\D/g, "").length < 10) return NextResponse.json({ error: "Add a mobile number so we can confirm." }, { status: 400 });
  if (email && !EMAIL_RE.test(email)) return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });

  const admin = createAdminClient();
  const { data: bizRow } = await admin.from("businesses")
    .select("id, slug, name, widget_config").eq("slug", params.business).maybeSingle();
  const biz = bizRow as Pick<Business, "id" | "slug" | "name" | "widget_config"> | null;
  if (!biz || !siteContentFor(biz.slug)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!bookingEnabled(biz)) return NextResponse.json({ error: "Online booking is off right now. Please call us." }, { status: 409 });

  const { data: res } = await admin.from("booking_resources")
    .select("id, business_id, name, is_active, packages")
    .eq("id", resourceId).eq("business_id", biz.id).maybeSingle();
  if (!res || !res.is_active) return NextResponse.json({ error: "That isn't bookable right now." }, { status: 404 });

  // Package: one the app offers on this resource, or one on the website's price board.
  let pkgLine: string | null = null;
  if (pkgName) {
    const appPkg = ((res.packages ?? []) as BookingPackage[]).find(p => p.name.toLowerCase() === pkgName.toLowerCase());
    const sitePkg = siteContentFor(biz.slug)?.parties.packages.find(p => p.name.toLowerCase() === pkgName.toLowerCase());
    if (appPkg || sitePkg) {
      const price = appPkg?.price_cents ? dollars(appPkg.price_cents) : sitePkg ? `$${sitePkg.price}` : null;
      pkgLine = `Package: ${appPkg?.name ?? sitePkg!.name}${price ? ` (${price})` : ""}`;
    }
  }

  // Signed in to the app on this domain + a member here → attach to their membership.
  let userId: string | null = null;
  let membershipId: string | null = null;
  try {
    const { data: { user } } = await createServer().auth.getUser();
    if (user) {
      const { data: mem } = await admin.from("business_memberships")
        .select("id").eq("business_id", biz.id).eq("user_id", user.id).maybeSingle();
      if (mem) { userId = user.id; membershipId = mem.id as string; }
    }
  } catch { /* no session — guest booking */ }

  const { data: id, error } = await admin.rpc("booking_resource_reserve", {
    p_resource_id: resourceId,
    p_starts_at: new Date(startsAt).toISOString(),
    p_duration: Math.round(duration),
    p_party: Math.round(party),
    p_user: userId,
    p_membership: membershipId,
    p_name: name,
    p_phone: phone,
    p_email: email || null,
    p_notes: [pkgLine, notes || null].filter(Boolean).join(" — ") || null,
    p_source: "web",
  });

  if (error) {
    const msg = error.message ?? "";
    if (FRIENDLY.some(f => msg.includes(f))) return NextResponse.json({ error: msg.charAt(0).toUpperCase() + msg.slice(1) + "." }, { status: 409 });
    console.error("[site-book] reserve failed", msg);
    return NextResponse.json({ error: "We couldn't book that just now. Please try again or give us a call." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id, member: !!membershipId });
}
