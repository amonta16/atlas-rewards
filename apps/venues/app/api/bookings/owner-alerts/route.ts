/**
 * GET /api/bookings/owner-alerts — CP-247 · email the owner about new bookings
 *
 * Vercel cron target (every minute, vercel.json). Same fail-closed auth as the
 * other crons: `Authorization: Bearer $CRON_SECRET` via requireMachineSecret.
 *
 *  1. claim_booking_owner_alerts() stamps owner_notified_at BEFORE sending, so
 *     overlapping runs never double-send. It only returns bookings made from
 *     the app or website (never the desk), under 2 days old, for businesses
 *     with recipients in business_booking_alerts (Builder → Bookings).
 *  2. Send one email per booking through Resend (Idempotency-Key = booking id).
 *  3. On failure, release_booking_owner_alert() un-stamps it and counts the
 *     attempt; after 5 the queue stops picking it up.
 *     With RESEND_API_KEY unset, nothing is claimed — bookings wait in the
 *     queue (up to 2 days) instead of burning their attempts.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMachineSecret } from "@/lib/api-auth";
import { ownerAlertEmail, type OwnerAlertRow } from "@/lib/booking-alerts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FROM = process.env.BOOKING_FROM_EMAIL
  ?? process.env.LANDING_FROM_EMAIL
  ?? "Atlas Engine <hello@atlas-engine.app>";

export async function GET(req: NextRequest) {
  const gate = requireMachineSecret(req);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[owner-alerts] RESEND_API_KEY not set — booking emails are waiting in the queue");
    return NextResponse.json({ ok: false, reason: "not_configured" });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("claim_booking_owner_alerts", { p_limit: 25 });
  if (error) {
    console.error("[owner-alerts] claim failed", error.message);
    return NextResponse.json({ error: "claim failed" }, { status: 500 });
  }

  const rows = (data ?? []) as OwnerAlertRow[];
  let sent = 0, failed = 0;
  for (const row of rows) {
    const mail = ownerAlertEmail(row);
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `booking-owner-alert-${row.booking_id}`,
        },
        body: JSON.stringify({
          from: FROM,
          to: row.emails,
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        }),
      });
      if (!r.ok) throw new Error(`resend ${r.status}: ${await r.text().catch(() => "")}`);
      sent++;
    } catch (e) {
      failed++;
      console.error(`[owner-alerts] booking ${row.booking_id} not sent`, e instanceof Error ? e.message : e);
      await admin.rpc("release_booking_owner_alert", { p_booking_id: row.booking_id });
    }
  }

  return NextResponse.json({ ok: true, claimed: rows.length, sent, failed });
}
