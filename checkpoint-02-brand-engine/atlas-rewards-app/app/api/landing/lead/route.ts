import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { notifyLead, emailProspect, hashIp, EMAIL_RE, clean } from "@/lib/landing/notify";
import { qualify, ROLES, STAGES, SITE_ORIGIN } from "@/lib/landing/medspa-funnel";
import { sendCapiEvent, requestIp, splitName } from "@/lib/landing/meta-capi";
import { newEventId } from "@/lib/landing/funnel-sign";
// CP-204: one med spa per area; the area is re-checked here, the browser check is only a preview.
import { checkArea } from "@/lib/landing/territory";

/**
 * POST /api/landing/lead — CP-201 · step 1 of the /medspa funnel (the gate).
 *
 * CP-205: usually updates the row the 48-hour hold created (lead_id), adding role,
 * stage and the numbers; a not-a-fit answer releases the hold.
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

const UUID = /^[0-9a-f-]{36}$/i;
const arr = (v: unknown, max = 12) => (Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, max).map((x) => (x as string).slice(0, 60)) : []);

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "lead"), 6, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (b.website_url_hp) return NextResponse.json({ qualified: false }); // honeypot

  // CP-205: most leads already exist (the 48-hour hold captured name, practice, email and
  // mobile). Then this call only adds role, stage and the numbers, and updates that row.
  const supabase = createAdminClient();
  const holdId = typeof b.lead_id === "string" && UUID.test(b.lead_id) ? b.lead_id : null;
  type Held = { id: string; name: string; business: string; email: string; phone: string; zip: string | null; demo_request_id: string | null };
  let held: Held | null = null;
  if (holdId) {
    const { data: h } = await supabase.from("landing_leads").select("id, name, business, email, phone, zip, demo_request_id").eq("id", holdId).maybeSingle();
    held = (h as Held | null) ?? null;
    if (!held) return NextResponse.json({ error: "We couldn't find your hold. Please check your area again." }, { status: 404 });
  }

  const name = clean(b.name, 120) || held?.name || "";
  const business = clean(b.business, 160) || held?.business || "";
  const email = (clean(b.email, 200) || held?.email || "").toLowerCase();
  const phone = clean(b.phone, 40) || held?.phone || "";
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
  // CP-204: a taken area can't book (but still gets a kind email and a spot on the waitlist).
  // CP-205: the visitor's own hold doesn't count against them.
  const zipIn = clean(b.zip, 10) || held?.zip || "";
  let area: Awaited<ReturnType<typeof checkArea>> | null = null;
  if (zipIn) { try { area = await checkArea(zipIn, { leadId: held?.id }); } catch (e) { console.error("[lead] area check failed", e); } }
  if (area?.ok && !area.open) { verdict.qualified = false; verdict.reasons.push("area_taken"); }
  const areaTaken = !!(area?.ok && !area.open);
  const eventId = verdict.qualified ? newEventId("lead") : null;
  const source = clean(b.source, 120) || null;
  const nowIso = new Date().toISOString();

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
    estimate_likely: Number.isFinite(Number(b.estimate_likely)) && b.estimate_likely !== null ? Math.round(Number(b.estimate_likely)) : null,
    app_color: clean(b.app_color, 9) || null,
    qualified: verdict.qualified,
    qualified_at: verdict.qualified ? nowIso : null,
    disqualify_reasons: verdict.reasons,
    status: verdict.qualified ? "new" : "nurture",
    source,
    variant: clean(b.variant, 40) || null, // CP-202: A/B arm
    zip: area?.ok ? area.zip : zipIn || null, // CP-204
    city: area?.ok ? area.city : null,
    state: area?.ok ? area.state : null,
    area_open: area?.ok ? area.open : null,
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

  let data: { id: string } | null = null;
  if (held) {
    if (held.demo_request_id) return NextResponse.json({ error: "You already have a call booked. Check your email for the details." }, { status: 409 });
    // Keep what the hold step stored when this step didn't send it (UTMs, click ids, source, variant).
    const patch: Record<string, unknown> = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== ""));
    patch.qualified = verdict.qualified; patch.disqualify_reasons = verdict.reasons; patch.status = row.status; patch.lead_event_id = eventId;
    // Not a fit: release the hold so the area opens for the next practice.
    if (!verdict.qualified) patch.hold_expires_at = nowIso;
    const { data: u, error } = await supabase.from("landing_leads").update(patch).eq("id", held.id).select("id").single();
    if (error || !u) { console.error("[lead] update failed", error); return NextResponse.json({ error: "Couldn't save that. Please try again, or email andrew@atlas-engine.app." }, { status: 500 }); }
    data = u;
  } else {
    const { data: ins, error } = await supabase.from("landing_leads").insert(row).select("id").single();
    if (error || !ins) {
      console.error("[lead] insert failed", error);
      return NextResponse.json({ error: "Couldn't save that. Please try again, or email andrew@atlas-engine.app." }, { status: 500 });
    }
    data = ins;
  }

  const roleLabel = ROLES.find((r) => r.id === role)?.label ?? role;
  const stageLabel = STAGES.find((s) => s.id === stage)?.label ?? stage;
  const sent = await notifyLead(`${verdict.qualified ? "QUALIFIED, call now" : "Not a fit (nurture)"}: ${business}`, [
    ["Name", `${name} (${roleLabel})`],
    ["Practice", `${business} · ${stageLabel}`],
    ["Area", area?.ok ? `${area.city}, ${area.state} ${area.zip} · ${area.open ? "open" : "TAKEN (waitlist)"} · ${area.founding.spotsLeft} founding spots left` : zipIn || null],
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
    ["Next", verdict.qualified ? `Calendar unlocked.${held ? " Their 48-hour area hold stays on." : ""} If they don't book: follow-up emails at 3 h, 24 h and before the hold ends.` : `No calendar. They got the nurture email.${held ? " Their hold was released." : ""}`],
    ["Call", verdict.qualified ? `tel:+1${phoneDigits.slice(-10)}` : null],
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
    const where = area?.ok ? `${area.city}, ${area.state}` : "your area";
    const ok = await emailProspect(email, areaTaken ? `${business}: ${where} is taken for now` : `${business}: your recall estimate`, [
      `Hi ${first},`,
      "",
      ...(areaTaken
        ? [`Atlas works with one med spa per area, and a practice near ${where} already holds yours. You're on the waitlist: if the area opens up, you'll hear from me first.`]
        : ["Thanks for checking your area. A live walkthrough isn't the right next step yet (walkthroughs are for owners and managers of practices that are open today), so here's your estimate to share with whoever makes the call."]),
      "",
      row.estimate_likely ? `Your recall estimate: about $${row.estimate_likely.toLocaleString()} a year in visits that slip today (a planning estimate from your answers, not a promise).` : "",
      "",
      "If anything changes, reply to this email and I'll set up a time.",
      "",
      "Andrew Montano",
      "Atlas Engine · atlas-engine.app",
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"));
    if (ok) await supabase.from("landing_leads").update({ nurture_sent_at: new Date().toISOString() }).eq("id", data.id);
  }

  return NextResponse.json(verdict.qualified ? { qualified: true, lead_id: data.id, event_id: eventId } : { qualified: false, reason: areaTaken ? "area_taken" : "not_a_fit" });
}
