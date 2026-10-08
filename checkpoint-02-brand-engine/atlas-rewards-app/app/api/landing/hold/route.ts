import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { notifyLead, emailProspect, hashIp, EMAIL_RE, clean } from "@/lib/landing/notify";
import { HOLD, SITE_ORIGIN } from "@/lib/landing/medspa-funnel";
import { checkArea } from "@/lib/landing/territory";

/**
 * /api/landing/hold — CP-205 · "Your area is open. Hold it for 48 hours."
 *
 * POST: right after an open zip check, the visitor gives name, practice, email and
 *   mobile. We save a landing_leads row (role/stage come later, on the qualify step),
 *   hold the area for HOLD.hours, and email Andrew a "call now" alert (speed to lead).
 *   If the area turned out to be taken or held, they go on the waitlist instead.
 *   → { ok, lead_id, open, hold_expires_at } | { ok, lead_id, open: false, held, held_until }
 *
 * GET ?lead=<id>: resume a funnel from a follow-up email link. Returns only what the
 *   page needs to pick up where they left off (no email or phone).
 *
 * No Meta Lead here: the standard Lead still fires only when the server qualifies them.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "hold"), 6, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (b.website_url_hp) return NextResponse.json({ ok: true, open: false }); // honeypot

  const name = clean(b.name, 120);
  const business = clean(b.business, 160);
  const email = clean(b.email, 200).toLowerCase();
  const phone = clean(b.phone, 40);
  const digits = phone.replace(/\D/g, "");
  if (!name || !business || !EMAIL_RE.test(email) || digits.length < 10) {
    return NextResponse.json({ error: "Please add your name, your practice, an email and a mobile number." }, { status: 400 });
  }

  let area: Awaited<ReturnType<typeof checkArea>>;
  try { area = await checkArea(clean(b.zip, 10)); } catch (e) {
    console.error("[hold] area check failed", e);
    return NextResponse.json({ error: "We couldn't check your area right now. Please try again." }, { status: 500 });
  }
  if (!area.ok) return NextResponse.json({ error: area.error }, { status: 400 });

  const now = Date.now();
  const holdUntil = area.open ? new Date(now + HOLD.hours * 3600_000).toISOString() : null;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("landing_leads").insert({
    niche: "medspa", name, business, email, phone, role: null, stage: null,
    practice_type: "Med spa", qualified: false, disqualify_reasons: [],
    status: area.open ? "held" : "waitlist",
    hold_expires_at: holdUntil,
    zip: area.zip, city: area.city, state: area.state, area_open: area.open,
    source: clean(b.source, 120) || null, variant: clean(b.variant, 40) || null, path: clean(b.path, 200) || null,
    utm_source: clean(b.utm_source, 80) || null, utm_campaign: clean(b.utm_campaign, 120) || null, utm_content: clean(b.utm_content, 120) || null,
    fbp: clean(b.fbp, 120) || null, fbc: clean(b.fbc, 200) || null,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300), ip_hash: await hashIp(req),
  }).select("id").single();
  if (error || !data) {
    console.error("[hold] insert failed", error);
    return NextResponse.json({ error: "Couldn't save that. Please try again, or email andrew@atlas-engine.app." }, { status: 500 });
  }

  const where = `${area.city}, ${area.state}`;
  const tel = `+1${digits.slice(-10)}`;
  const endsPT = holdUntil ? new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(holdUntil)) : null;
  const sent = await notifyLead(area.open ? `CALL NOW: ${business} is holding ${where}` : `Waitlist: ${business} (${where} is ${area.held ? "held" : "taken"})`, [
    ["Who", `${name} · ${business}`],
    ["Call", area.open ? `${phone} (tel:${tel}). Leads called within 5 minutes book far more often.` : phone],
    ["Email", email],
    ["Area", `${where} ${area.zip} · ${area.open ? `open, held until ${endsPT} PT` : area.held ? "held by another practice" : "TAKEN"} · ${area.founding.spotsLeft} founding spots left`],
    ["Next", area.open ? "They're answering the 3 number questions now, then role and practice. If they don't book: emails at 3 h, 24 h, and 4 h before the hold ends." : "Waitlist email sent."],
    ["Source", clean(b.source, 120) || null],
    ["A/B arm", clean(b.variant, 40) || null],
  ]);
  if (sent) await supabase.from("landing_leads").update({ notified_at: new Date().toISOString() }).eq("id", data.id);

  if (!area.open) {
    const first = name.split(" ")[0];
    const ok = await emailProspect(email, `${business}: you're on the waitlist for ${where}`, [
      `Hi ${first},`, "",
      area.held
        ? `Atlas works with one med spa per area, and another practice near ${where} is holding yours right now. If they don't claim it, you're next and you'll hear from me first.`
        : `Atlas works with one med spa per area, and a practice near ${where} already holds yours. You're on the waitlist: if the area opens up, you'll hear from me first.`,
      "", "If you have another location, you can check it here: " + `${SITE_ORIGIN}/medspa/start`, "",
      "Andrew Montano", "Atlas Engine · atlas-engine.app",
    ].join("\n"));
    if (ok) await supabase.from("landing_leads").update({ nurture_sent_at: new Date().toISOString() }).eq("id", data.id);
    return NextResponse.json({ ok: true, lead_id: data.id, open: false, held: area.held, held_until: area.heldUntil });
  }
  // The hold, in writing, with a link back in (the page says "we emailed your hold").
  const endsLocal = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(holdUntil!));
  await emailProspect(email, `${where} is held for ${business}`, [
    `Hi ${name.split(" ")[0]},`, "",
    `Good news: ${where} is open, and it's now held for ${business} until ${endsLocal}. While it's held, no other med spa within ${area.radiusMiles} miles can claim it.`, "",
    "To keep it, pick a 20-minute walkthrough time before the hold ends. Booking keeps your area held through the call:",
    `${SITE_ORIGIN}/medspa/start?lead=${data.id}`, "",
    `Before we talk, I'll build a preview of ${business}'s own patient app so you see yours on the call.`, "",
    "Andrew Montano", "Atlas Engine · atlas-engine.app",
  ].join("\n"));
  return NextResponse.json({ ok: true, lead_id: data.id, open: true, hold_expires_at: holdUntil });
}

export async function GET(req: Request) {
  const rl = await rateLimit(clientKey(req, "hold-get"), 30, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);
  const id = new URL(req.url).searchParams.get("lead") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  const { data: l } = await createAdminClient().from("landing_leads")
    .select("id, name, business, zip, city, state, hold_expires_at, qualified, demo_request_id, status, visit_band, value_band, rebook")
    .eq("id", id).maybeSingle();
  if (!l) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({
    ok: true, first: String(l.name ?? "").split(" ")[0], business: l.business, zip: l.zip, city: l.city, state: l.state,
    hold_expires_at: l.hold_expires_at, qualified: l.qualified, booked: !!l.demo_request_id, status: l.status,
    visit_band: l.visit_band, value_band: l.value_band, rebook: l.rebook,
  }, { headers: { "Cache-Control": "no-store" } });
}
