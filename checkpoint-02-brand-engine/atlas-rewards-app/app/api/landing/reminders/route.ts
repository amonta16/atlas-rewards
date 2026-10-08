import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailProspect, notifyLead } from "@/lib/landing/notify";
import { CALL_MINUTES } from "@/lib/landing/availability";
import { PRECALL_PREP, REMINDERS, SITE_ORIGIN } from "@/lib/landing/medspa-funnel";
import { sign } from "@/lib/landing/funnel-sign";

/**
 * GET /api/landing/reminders — CP-201 · Vercel Cron, every 15 minutes (vercel.json).
 * Auth: `Authorization: Bearer ${CRON_SECRET}` (Vercel adds it to cron calls).
 *
 * For /medspa funnel bookings only (rows with a confirm_token):
 *   1. Early reminder  ~24 h before: time, video link, the pre-call page if not confirmed yet.
 *   2. Late reminder   ~2 h before: short, with the video link.
 *   3. After the call  (end + 30 min): emails ANDREW three one-tap links,
 *      Showed / No-show / Paid. Paid sends Meta "Purchase" (see /api/landing/outcome).
 * For qualified leads who never picked a time: one "your times are still open" email.
 * Every step stamps a column first, so a retry can never double-send.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const H = 3600_000;
const when = (iso: string, tz: string | null) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz || "America/Los_Angeles", weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
const join = (lines: string[]) => lines.filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const now = Date.now();
  const out = { early: 0, late: 0, outcome: 0, followup: 0 };

  // Bookings from the last 3 days through the next 2 days that still need something.
  const { data: rows, error } = await db.from("landing_demo_requests")
    .select("id, created_at, name, business, email, phone, slot_start, timezone, meet_url, confirm_token, confirmed_at, video_pct, reminder_early_at, reminder_late_at, outcome_prompt_at, outcome, lead_id")
    .not("confirm_token", "is", null)
    .not("slot_start", "is", null)
    .is("outcome", null)
    .gte("slot_start", new Date(now - 3 * 24 * H).toISOString())
    .lte("slot_start", new Date(now + 2 * 24 * H).toISOString())
    .limit(200);
  if (error) { console.error("[reminders] query failed", error); return NextResponse.json({ error: "query failed" }, { status: 500 }); }

  for (const r of rows ?? []) {
    const start = Date.parse(r.slot_start as string);
    const precall = `${SITE_ORIGIN}/medspa/confirm/${r.confirm_token}`;
    const first = String(r.name).split(" ")[0];
    const video = r.meet_url ? `Video link: ${r.meet_url}` : "Andrew will send the video link before the call.";
    const bookedAgo = now - Date.parse(r.created_at as string);

    // 1) early reminder (skip if they booked within the last hour: the confirmation just went out)
    if (!r.reminder_early_at && now >= start - REMINDERS.earlyHours * H && now < start - REMINDERS.lateHours * H && bookedAgo > H) {
      await db.from("landing_demo_requests").update({ reminder_early_at: new Date().toISOString() }).eq("id", r.id);
      await emailProspect(r.email, `Tomorrow: your Atlas walkthrough for ${r.business}`, join([
        `Hi ${first},`, "",
        `Quick reminder: we're on for ${when(r.slot_start as string, r.timezone)} (${CALL_MINUTES} minutes).`,
        video, "",
        ...(r.confirmed_at ? [] : ["Your call isn't confirmed yet. Watch the short video and tap confirm here:", precall, ""]),
        "To get the most out of it, have these handy:", ...PRECALL_PREP.map((p) => `- ${p}`), "",
        "Can't make it? Reply to this email and I'll move it.", "",
        "Andrew Montano", "Atlas Engine · atlas-engine.app",
      ]));
      out.early++;
    }

    // 2) late reminder
    if (!r.reminder_late_at && now >= start - REMINDERS.lateHours * H && now < start && bookedAgo > 30 * 60_000) {
      await db.from("landing_demo_requests").update({ reminder_late_at: new Date().toISOString() }).eq("id", r.id);
      await emailProspect(r.email, `In ${REMINDERS.lateHours} hours: Atlas walkthrough`, join([
        `Hi ${first}, see you at ${when(r.slot_start as string, r.timezone)}.`,
        video,
        r.confirmed_at ? "" : `If you haven't yet, the 3-minute video is here: ${precall}`,
        "", "Andrew",
      ]));
      out.late++;
    }

    // 3) after the call: ask Andrew how it went (one tap each)
    if (!r.outcome_prompt_at && now >= start + (CALL_MINUTES + REMINDERS.outcomeAfterMinutes) * 60_000) {
      await db.from("landing_demo_requests").update({ outcome_prompt_at: new Date().toISOString() }).eq("id", r.id);
      const link = (o: string) => `${SITE_ORIGIN}/api/landing/outcome?id=${r.id}&o=${o}&s=${sign(String(r.id), o)}`;
      await notifyLead(`How did ${r.business} go? (one tap)`, [
        ["Call", `${when(r.slot_start as string, "America/Los_Angeles")} · ${r.name} · ${r.phone}`],
        ["Confirmed beforehand", r.confirmed_at ? "Yes" : "No"],
        ["Watched the video", `${r.video_pct ?? 0}%`],
        ["They showed, still deciding", link("showed")],
        ["No-show", link("no_show")],
        ["They paid (sends Meta Purchase)", link("paid")],
        ["Not a fit after all", link("lost")],
      ]);
      out.outcome++;
    }
  }

  // 4) qualified, never picked a time → one nudge
  const { data: unbooked } = await db.from("landing_leads")
    .select("id, name, business, email, created_at")
    .eq("qualified", true).is("demo_request_id", null).is("followup_sent_at", null)
    .lte("created_at", new Date(now - REMINDERS.unbookedFollowUpHours * H).toISOString())
    .gte("created_at", new Date(now - 4 * 24 * H).toISOString())
    .limit(100);
  for (const l of unbooked ?? []) {
    await db.from("landing_leads").update({ followup_sent_at: new Date().toISOString() }).eq("id", l.id);
    await emailProspect(l.email, `${l.business}: your walkthrough times are still open`, join([
      `Hi ${String(l.name).split(" ")[0]},`, "",
      "You built your app and qualified for a walkthrough but didn't pick a time. Your app and numbers are saved; it's 20 minutes on video.",
      `Pick a time here: ${SITE_ORIGIN}/medspa/start?lead=${l.id}`, "",
      "Or just reply with two times that work and I'll send the invite.", "",
      "Andrew Montano", "Atlas Engine · atlas-engine.app",
    ]));
    out.followup++;
  }

  return NextResponse.json({ ok: true, ...out });
}
