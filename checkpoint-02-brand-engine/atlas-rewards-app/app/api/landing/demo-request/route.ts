import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";
import { notifyLead, emailProspect, hashIp, EMAIL_RE, clean } from "@/lib/landing/notify";
import { calendarConfigured, createDemoEvent, getBusy } from "@/lib/google-calendar";
import { CALL_MINUTES, HOST_TZ, candidateSlots, dayKey, overlapsBusy } from "@/lib/landing/availability";
// CP-201: the /medspa funnel gate, pre-call page token and Meta Schedule (server side).
import { newEventId, newToken } from "@/lib/landing/funnel-sign";
import { sendCapiEvent, requestIp, splitName } from "@/lib/landing/meta-capi";
import { PRECALL_PREP, SITE_ORIGIN } from "@/lib/landing/medspa-funnel";

/**
 * POST /api/landing/demo-request — CP-100, CP-189
 * Stores a demo request (landing_demo_requests) and emails CONTACT_EMAIL.
 * CP-189: when a slot is chosen and Google Calendar is configured, the slot
 * is re-checked against free/busy (409 if it was just taken) and the event
 * is created on Andrew's calendar with a Meet link; Google emails the
 * prospect the invite. We also send our own plain confirmation.
 * Public, rate-limited (5 / 10 min per IP), honeypot-guarded.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = await rateLimit(clientKey(req, "demo-request"), 5, 600);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (body.website) return NextResponse.json({ ok: true }); // honeypot → pretend success

  // CP-201: a funnel booking only sends lead_id + the slot; contact details come from the qualify step.
  if (typeof body.lead_id === "string" && /^[0-9a-f-]{36}$/i.test(body.lead_id)) {
    const { data: l } = await createAdminClient().from("landing_leads").select("name, business, email, phone, fbp, fbc").eq("id", body.lead_id).maybeSingle();
    if (l) body = { industry: "Med spa", ...body, name: body.name || l.name, business: body.business || l.business, email: body.email || l.email, phone: body.phone || l.phone, fbp: body.fbp || l.fbp, fbc: body.fbc || l.fbc };
  }

  const name = clean(body.name, 120);
  const business = clean(body.business, 160);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 40);
  if (!name || !business || !phone || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please fill in your name, business, email and phone." }, { status: 400 });
  }

  const row = {
    name,
    business,
    email,
    phone,
    industry: clean(body.industry, 80) || null,
    preferred_time: clean(body.preferred_time, 120) || null,
    notes: clean(body.notes, 1000) || null,
    source: clean(body.source, 60) || null,
    path: clean(body.path, 200) || null,
    slot_start: (() => { const v = clean(body.slot_start, 40); const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? new Date(t).toISOString() : null; })(),
    timezone: clean(body.timezone, 64) || null,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
    ip_hash: await hashIp(req),
    // CP-201
    lead_id: null as string | null,
    confirm_token: null as string | null,
    schedule_event_id: null as string | null,
    fbp: clean(body.fbp, 120) || null,
    fbc: clean(body.fbc, 200) || null,
  };

  // CP-201 GATE: a /medspa booking must come from a qualified lead that hasn't booked yet.
  // The browser only shows the calendar to qualified leads; this is the server-side lock.
  const leadId = clean(body.lead_id, 40) || null;
  const fromFunnel = !!leadId || (row.path ?? "").startsWith("/medspa");
  if (fromFunnel) {
    if (!leadId || !/^[0-9a-f-]{36}$/i.test(leadId)) return NextResponse.json({ error: "Please answer the few questions about your practice first." }, { status: 403 });
    const { data: lead } = await createAdminClient().from("landing_leads").select("id, qualified, demo_request_id").eq("id", leadId).maybeSingle();
    if (!lead || !lead.qualified) return NextResponse.json({ error: "Please answer the few questions about your practice first." }, { status: 403 });
    if (lead.demo_request_id) return NextResponse.json({ error: "You already have a call booked. Check your email for the details, or reply to it to change the time." }, { status: 409 });
    row.lead_id = leadId;
    row.confirm_token = newToken();
    row.schedule_event_id = newEventId("sched");
  }

  // CP-189: a chosen slot must be one we actually offer, and still free.
  let slotStart: Date | null = row.slot_start ? new Date(row.slot_start) : null;
  if (slotStart) {
    const k = dayKey(slotStart);
    const offered = candidateSlots(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10)).some((s) => s.startsAt.getTime() === slotStart!.getTime());
    if (!offered) return NextResponse.json({ error: "That time isn't available anymore. Please pick another." }, { status: 409 });
    if (calendarConfigured()) {
      try {
        const busy = await getBusy(new Date(slotStart.getTime() - 3600_000), new Date(slotStart.getTime() + 3600_000));
        if (overlapsBusy(slotStart, busy)) return NextResponse.json({ error: "Someone just booked that time. Please pick another.", code: "taken" }, { status: 409 });
      } catch (e) {
        console.error("[landing] freeBusy recheck failed", e);
      }
    }
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("landing_demo_requests").insert(row).select("id").single();
  if (error) {
    console.error("[landing] demo-request insert failed", error);
    return NextResponse.json({ error: "Couldn't save your request — please email us directly." }, { status: 500 });
  }

  const sent = await notifyLead(`Demo booked — ${business}`, [
    ["Name", name],
    ["Business", business],
    ["Email", email],
    ["Phone", phone],
    ["Industry", row.industry],
    ["Requested slot", row.slot_start ? `${row.slot_start} (${row.timezone ?? "UTC"})` : null],
    ["Best time", row.preferred_time],
    ["Notes", row.notes],
    ["Source", row.source],
  ]);
  if (sent) await supabase.from("landing_demo_requests").update({ notified_at: new Date().toISOString() }).eq("id", data.id);

  // CP-201: link the lead to its booking, and tell Meta a qualified call was scheduled.
  const confirmUrl = row.confirm_token ? `${SITE_ORIGIN}/medspa/confirm/${row.confirm_token}` : null;
  if (row.lead_id) {
    await supabase.from("landing_leads").update({ status: "booked", demo_request_id: data.id }).eq("id", row.lead_id);
    if (row.schedule_event_id) {
      const n = splitName(name);
      await sendCapiEvent({
        name: "Schedule", eventId: row.schedule_event_id, sourceUrl: `${SITE_ORIGIN}${row.path ?? "/medspa"}`,
        user: { email, phone, firstName: n.first, lastName: n.last, fbp: row.fbp, fbc: row.fbc, ip: requestIp(req), userAgent: row.user_agent, externalId: row.lead_id },
        customData: { content_name: "medspa_walkthrough" },
      });
    }
  }

  // CP-189: put it on the calendar and confirm to the prospect.
  let meetUrl: string | null = null;
  let calendarStatus: "created" | "not_configured" | "failed" | "no_slot" = slotStart ? "not_configured" : "no_slot";
  if (slotStart && calendarConfigured()) {
    try {
      const ev = await createDemoEvent({
        start: slotStart,
        minutes: CALL_MINUTES,
        summary: `Atlas × ${business} — app walkthrough`,
        description: [
          `${name} (${business})`, `${email} · ${phone}`, row.industry ? `Industry: ${row.industry}` : "",
          "", "We'll walk through the app we built for you, your numbers, and setup. 20 minutes, no pressure.",
          "", row.notes ? `Notes from the builder:\n${row.notes}` : "", row.source ? `Source: ${row.source}` : "",
        ].filter((l) => l !== undefined).join("\n").trim(),
        attendee: { email, name },
        requestId: `atlas-${data.id}`,
      });
      meetUrl = ev.meetUrl;
      calendarStatus = "created";
      await supabase.from("landing_demo_requests").update({ calendar_event_id: ev.id, meet_url: ev.meetUrl, calendar_status: "created" }).eq("id", data.id);
    } catch (e) {
      calendarStatus = "failed";
      console.error("[landing] calendar event failed", e);
      await supabase.from("landing_demo_requests").update({ calendar_status: "failed" }).eq("id", data.id);
      await notifyLead(`⚠ Calendar invite FAILED — ${business}`, [["Why", e instanceof Error ? e.message : String(e)], ["Slot", row.slot_start], ["Email", email], ["Phone", phone]]);
    }
  }
  if (slotStart) {
    const tz = row.timezone || HOST_TZ;
    const when = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(slotStart);
    await emailProspect(email, `You're booked: Atlas walkthrough, ${when}`, [
      `Hi ${name.split(" ")[0]},`,
      "",
      `You're booked for a ${CALL_MINUTES}-minute walkthrough of ${business}'s app on ${when}.`,
      meetUrl ? `Video link: ${meetUrl}` : "Andrew will send the video link before the call.",
      calendarStatus === "created" ? "A calendar invite is on its way from andrew@atlas-engine.app." : "",
      // CP-201: the pre-call page (short video + "confirm I'll be there").
      ...(confirmUrl ? ["", "One step left: your call isn't confirmed until you watch a short video and tap confirm:", confirmUrl, "", "To get the most out of 20 minutes, have these handy:", ...PRECALL_PREP.map((p) => `- ${p}`)] : []),
      "",
      "Need a different time? Just reply to this email.",
      "",
      "Andrew Montano",
      "Atlas Engine · atlas-engine.app",
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n"));
  }

  return NextResponse.json({ ok: true, calendar: calendarStatus, meet_url: meetUrl, confirm_url: confirmUrl, confirm_token: row.confirm_token, event_id: row.schedule_event_id });
}
