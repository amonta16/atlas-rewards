import { NextResponse } from "next/server";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { notifyLead } from "@/lib/landing/notify";
import { HOLD } from "@/lib/landing/medspa-funnel";
import { labelOf, validateAnswers } from "@/lib/preview/quiz";
import { getPreviewBySlug, isExpired, previewDb, previewUrl, SLUG_RE } from "@/lib/preview/store";

/**
 * POST /api/preview/answers — CP-234 · the quiz after the contact form.
 *
 * Body { slug, booking_system, offered[], challenges[2], priorities[2] } → { ok }
 *
 * Saves the answers on the preview, then creates (or updates) the lead in the
 * existing /medspa funnel (landing_leads) so "Book a 15-min walkthrough" opens
 * the same calendar with the same reminders and Meta "Schedule" event:
 *   · area open → qualified, and the area is held for HOLD.hours;
 *   · area taken → not qualified (reason area_taken): the page offers the waitlist.
 * Requires the contact step first (name, email, mobile are taken from the row).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "pv-answers"), 10, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const slug = typeof b.slug === "string" && SLUG_RE.test(b.slug) ? b.slug : null;
  if (!slug) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const v = validateAnswers(b);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const row = await getPreviewBySlug(slug).catch(() => null);
  if (!row || isExpired(row)) return NextResponse.json({ error: "This preview has expired. Please build a new one." }, { status: 404 });
  if (!row.contact_email || !row.contact_phone || !row.contact_name) return NextResponse.json({ error: "Please add your contact details first." }, { status: 400 });

  const db = previewDb();
  const now = new Date();
  const a = v.answers;
  const extra = row as unknown as { landing_lead_id?: string | null; area_zip?: string | null };

  // The funnel lead (one per preview).
  const open = row.area_open !== false;
  const lead = {
    niche: "medspa",
    name: row.contact_name,
    business: row.business_name,
    email: row.contact_email,
    phone: row.contact_phone,
    website: row.website,
    booking_system: a.booking_system,
    treatments: a.offered.map(labelOf).slice(0, 12),
    worth_it: `Holding back: ${a.challenges.map(labelOf).join("; ")}. Priorities: ${a.priorities.map(labelOf).join("; ")}.`.slice(0, 600),
    qualified: open,
    qualified_at: open ? now.toISOString() : null,
    disqualify_reasons: open ? [] : ["area_taken"],
    status: open ? "new" : "nurture",
    source: "app_preview",
    path: "/medspa/app",
    zip: extra.area_zip ?? null,
    area_open: row.area_open,
    hold_expires_at: open ? new Date(now.getTime() + HOLD.hours * 3_600_000).toISOString() : null,
    utm_source: row.utm_source,
    utm_campaign: row.utm_campaign,
    utm_content: row.utm_content,
    fbp: row.fbp,
    fbc: row.fbc,
  };
  let leadId = extra.landing_lead_id ?? null;
  if (leadId) {
    const { error } = await db.from("landing_leads").update(lead).eq("id", leadId).is("demo_request_id", null);
    if (error) console.error("[preview] lead update failed", error.message);
  } else {
    const { data, error } = await db.from("landing_leads").insert(lead).select("id").single();
    if (error) console.error("[preview] lead insert failed", error.message);
    leadId = (data as { id: string } | null)?.id ?? null;
  }

  const { error } = await db.from("app_previews").update({
    booking_system: a.booking_system, offered: a.offered, challenges: a.challenges, priorities: a.priorities,
    quiz_at: now.toISOString(), ...(leadId ? { landing_lead_id: leadId } : {}),
  }).eq("id", row.id);
  if (error) {
    console.error("[preview] answers save failed", error.message);
    return NextResponse.json({ error: "We couldn't save that. Please try again." }, { status: 500 });
  }

  await notifyLead(`App preview quiz done: ${row.business_name}`, [
    ["Name", row.contact_name],
    ["Mobile", row.contact_phone],
    ["Email", row.contact_email],
    ["Booking tool", a.booking_system],
    ["Offers", a.offered.map(labelOf).join(", ")],
    ["Holding back", a.challenges.map(labelOf).join("; ")],
    ["Priorities", a.priorities.map(labelOf).join("; ")],
    ["Area", row.area_open == null ? null : row.area_open ? "open (held 48 h)" : "TAKEN (waitlist)"],
    ["Preview", previewUrl(row.slug)],
  ]).catch(() => false);

  return NextResponse.json({ ok: true, qualified: open });
}
