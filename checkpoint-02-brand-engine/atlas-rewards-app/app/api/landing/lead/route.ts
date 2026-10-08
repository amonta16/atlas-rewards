import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { notifyLead, emailProspect, hashIp, EMAIL_RE, clean } from "@/lib/landing/notify";
import { qualify, ROLES, STAGES, SITE_ORIGIN } from "@/lib/landing/medspa-funnel";
import { sendCapiEvent, requestIp, splitName } from "@/lib/landing/meta-capi";
import { newEventId } from "@/lib/landing/funnel-sign";

/**
 * POST /api/landing/lead — CP-201 · step 1 of the /medspa funnel (the gate).
 *
 * Saves every submission to landing_leads, then decides on the SERVER whether
 * the calendar unlocks (lib/landing/medspa-funnel.ts `qualify`):
 *   qualified     → { qualified: true, lead_id, event_id }. Sends Meta "Lead"
 *                   via the Conversions API with the same event_id the browser
 *                   Pixel uses, so Meta counts it once.
 *   not a fit     → { qualified: false }. No calendar, NO Meta signal (so ads
 *                   never learn to find more of them). One nurture email with
 *                   their estimate and the demo app.
 * Andrew gets an email either way. Public, rate-limited, honeypot-guarded.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const arr = (v: unknown, max = 12) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, max).map((x) => (x as string).slice(0, 60)) : []);

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "lead"), 6, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (b.website_url_hp) return NextResponse.json({ qualified: false }); // honeypot

  const name = clean(b.name, 120);
  const business = clean(b.business, 160);
  const email = clean(b.email, 200).toLowerCase();
  const phone = clean(b.phone, 40);
  const role = clean(b.role, 20);
  const stage = clean(b.stage, 20);
  const phoneDigits = phone.replace(/\D/g, "");
  if (!name || !business || !EMAIL_RE.test(email) || phoneDigits.length < 10) {
    return NextResponse.json({ error: "Please fill in your name, practice, email and a mobile number." }, { status: 400 });
  }
  if (!ROLES.some((r) => r.id === role) || !STAGES.some((s) => s.id === stage)) {
    return NextResponse.json({ error: "Please answer the two questions about your role and your practice." }, { status: 400 });
  }

  const visitBand = clean(b.visit_band, 8) || null;
  const verdict = qualify({ role, stage, visitBand });
  const eventId = verdict.qualified ? newEventId("lead") : null;
  const source = clean(b.source, 120) || null;

  const row = {
    niche: "medspa",
    name, role, business, email, phone,
    website: clean(b.website, 200) || null,
    booking_system: clean(b.booking_system, 60) || null,
    stage,
    practice_type: clean(b.practice_type, 40) || null,
    treatments: arr(b.treatments),
    worth_it: clean(b.worth_it, 600) || null,
    visit_band: visitBand,
    value_band: clean(b.value_band, 8) || null,
    rebook: clean(b.rebook, 12) || null,
    recall: clean(b.recall, 12) || null,
    estimate_likely: Number.isFinite(Number(b.estimate_likely)) ? Math.round(Number(b.estimate_likely)) : null,
    app_color: clean(b.app_color, 9) || null,
    qualified: verdict.qualified,
    disqualify_reasons: verdict.reasons,
    status: verdict.qualified ? "new" : "nurture",
    source,
    variant: clean(b.variant, 40) || null, // CP-202: A/B arm
    path: clean(b.path, 200) || null,
    utm_source: clean(b.utm_source, 80) || null,
    utm_campaign: clean(b.utm_campaign, 120) || null,
    utm_content: clean(b.utm_content, 120) || null,
    fbp: clean(b.fbp, 120) || null,
    fbc: clean(b.fbc, 200) || null,
    lead_event_id: eventId,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    ip_hash: await hashIp(req),
  };

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("landing_leads").insert(row).select("id").single();
  if (error || !data) {
    console.error("[lead] insert failed", error);
    return NextResponse.json({ error: "Couldn't save that. Please try again, or email andrew@atlas-engine.app." }, { status: 500 });
  }

  const roleLabel = ROLES.find((r) => r.id === role)?.label ?? role;
  const stageLabel = STAGES.find((s) => s.id === stage)?.label ?? stage;
  const sent = await notifyLead(`${verdict.qualified ? "Qualified lead" : "Not a fit (nurture)"}: ${business}`, [
    ["Name", `${name} (${roleLabel})`],
    ["Practice", `${business} · ${stageLabel}`],
    ["Email", email],
    ["Mobile", phone],
    ["Website / IG", row.website],
    ["Booking system", row.booking_system],
    ["Treatments", row.treatments.join(", ") || null],
    ["Worth it if", row.worth_it],
    ["Estimate", row.estimate_likely ? `$${row.estimate_likely.toLocaleString()}/yr likely` : null],
    ["Why not a fit", verdict.qualified ? null : verdict.reasons.join(", ")],
    ["Source", source],
    ["A/B arm", row.variant],
    ["Next", verdict.qualified ? "Calendar unlocked. If they don't book, they get one follow-up in a few hours." : "No calendar. They got the nurture email."],
  ]);
  if (sent) await supabase.from("landing_leads").update({ notified_at: new Date().toISOString() }).eq("id", data.id);

  if (verdict.qualified && eventId) {
    const n = splitName(name);
    await sendCapiEvent({
      name: "Lead", eventId, sourceUrl: `${SITE_ORIGIN}${row.path ?? "/medspa"}`,
      user: { email, phone, firstName: n.first, lastName: n.last, fbp: row.fbp, fbc: row.fbc, ip: requestIp(req), userAgent: row.user_agent, externalId: data.id },
      customData: { content_name: "medspa_qualified", lead_type: "qualified" },
    });
  } else {
    const first = name.split(" ")[0];
    const ok = await emailProspect(email, `${business}: your app preview and recall estimate`, [
      `Hi ${first},`,
      "",
      "Thanks for building your app with us. A live call isn't the right next step yet, so here's everything in one place instead:",
      "",
      row.estimate_likely ? `Your recall estimate: about $${row.estimate_likely.toLocaleString()} a year in visits that slip today (a planning estimate from your answers, not a promise).` : "",
      `Tap around the demo practice app like a patient would: ${SITE_ORIGIN}/medspa#demo`,
      "",
      "If things change (you're open, or the owner wants to see it), reply to this email and I'll set up a time.",
      "",
      "Andrew Montano",
      "Atlas Engine · atlas-engine.app",
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"));
    if (ok) await supabase.from("landing_leads").update({ nurture_sent_at: new Date().toISOString() }).eq("id", data.id);
  }

  return NextResponse.json(verdict.qualified ? { qualified: true, lead_id: data.id, event_id: eventId } : { qualified: false });
}
