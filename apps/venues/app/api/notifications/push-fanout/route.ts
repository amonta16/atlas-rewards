/**
 * POST /api/notifications/push-fanout — CP-37.20, secured in CP-88
 *
 * Called by Supabase Database Webhooks (or by anything else that
 * wants to fan a notification out as a phone push). Accepts any of:
 *
 *   • { notification_id: "uuid" }
 *   • { record: { id, user_id, title, body, link_path, kind } }   ← Supabase webhook
 *   • { type, table, record, schema, old_record }                  ← Supabase verbose
 *   • { id, user_id, title, body, link_path, kind }                ← raw row
 *
 * Logs the incoming body so we can SEE what's actually arriving when
 * it errors. Andrew kept hitting 400s in production because the
 * earlier shape narrow didn't match Supabase's actual payload.
 *
 * ── CP-88 SECURITY ───────────────────────────────────────────────
 * This route had NO authentication. It takes a `user_id`, `title` and
 * `body` from the request and sends a push notification to that user with
 * the service-role client. Anyone who found the URL could send arbitrary
 * push notifications to any customer of any client, in that client's
 * branding, at unbounded cost — and pushes are the one surface that reaches
 * a customer's lock screen.
 *
 * It now requires the machine secret, and fails CLOSED if none is
 * configured.
 *
 * ⚠️  DEPLOY ORDER MATTERS. Before shipping this, set `CRON_SECRET` in
 * Vercel and add the matching header to the Supabase Database Webhook:
 *
 *     Supabase → Database → Webhooks → (the notifications webhook) → Edit
 *     HTTP Headers:  x-atlas-secret: <the same CRON_SECRET value>
 *
 * Ship this without doing that and phone pushes stop (401), silently from
 * the customer's point of view. Nothing else breaks, and it's reversible in
 * seconds by adding the header — but do it in the right order.
 *
 * ── CP-120 DOUBLE-PUSH FIX ───────────────────────────────────────
 * This route neither checked nor stamped `push_sent_at`, so the same
 * notification was pushed TWICE: once here (webhook, instantly) and again
 * ≤60s later by the process-pending cron — and rows that were already
 * pushed synchronously (announcements, broadcasts: stamped at insert per
 * CP-109 DUP1) were pushed a second time by this webhook. Invisible while
 * iOS delivery was down (CP-119's APNs credential outage); the moment
 * delivery came back, every phone buzzed twice. Now:
 *   1. a row that arrives already stamped is SKIPPED, and
 *   2. after a successful webhook send the row is stamped, so the cron
 *      won't send it again.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/notifications/push-server";
import { requireMachineSecret } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type NotifShape = {
  id?: string;
  user_id?: string;
  business_id?: string;
  kind?: string;
  title?: string;
  body?: string | null;
  link_path?: string | null;
  // CP-120: read the stamp so we can skip rows another path already pushed.
  push_sent_at?: string | null;
};

export async function POST(req: Request) {
  // CP-88: machine-only, fail closed. Must come before any work.
  const gate = requireMachineSecret(req);
  if (!gate.ok) {
    console.warn(`[push-fanout] rejected: ${gate.error}`);
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  // CP-37.20 — log the raw body so we can debug payload shape drift.
  // Truncated to avoid log spam.
  try {
    const sample = JSON.stringify(body);
    console.log(`[push-fanout] body=${sample.length > 800 ? sample.slice(0, 800) + "…(truncated)" : sample}`);
  } catch { /* ignore */ }

  // ─── Resolve a notification row from any payload shape ────────
  // Order of preference:
  //   1. body.record (Supabase webhook) — preferred, has the full row
  //   2. body itself if it looks like a row (id + user_id + title)
  //   3. body.notification_id + DB lookup (legacy + manual calls)
  let resolved: NotifShape | null = null;

  if (body?.record && typeof body.record === "object") {
    resolved = body.record as NotifShape;
  } else if (body?.id && body?.user_id && body?.title) {
    resolved = body as NotifShape;
  }

  // Fall back to DB lookup if we just have an id.
  const notificationId: string | undefined =
    body?.notification_id ?? body?.id ?? body?.record?.id;

  if ((!resolved || !resolved.user_id) && notificationId) {
    const admin = createAdminClient();
    const { data: notif, error } = await admin
      .from("notifications")
      .select("id, user_id, business_id, kind, title, body, link_path, push_sent_at")
      .eq("id", notificationId)
      .maybeSingle();
    if (error) {
      console.log(`[push-fanout] lookup failed: ${error.message}`);
      return NextResponse.json({ error: "lookup failed" }, { status: 500 });
    }
    if (notif) resolved = notif as NotifShape;
  }

  if (!resolved?.user_id || !resolved?.title) {
    console.log(`[push-fanout] could not resolve a notification from body`);
    return NextResponse.json(
      { error: "could not resolve a notification — need either { notification_id } or { record: { user_id, title } }" },
      { status: 400 },
    );
  }

  // CP-120: if another path already pushed this row (announcements and
  // broadcasts stamp at insert; the cron stamps after sending), do NOT
  // push it again — this was the double-notification bug.
  if (resolved.push_sent_at) {
    console.log(`[push-fanout] notif=${resolved.id ?? "(no id)"} already pushed — skipped`);
    return NextResponse.json({ ok: true, sent: 0, failed: 0, skipped: "already_pushed" });
  }

  const result = await sendPushToUsers([resolved.user_id], {
    title: resolved.title,
    body: resolved.body ?? null,
    link_path: resolved.link_path ?? "/app",
    kind: resolved.kind ?? "generic",
  }, resolved.business_id ?? null);  // CP-51: scope push to the row's business

  // CP-120: stamp the row so the per-minute cron doesn't send it AGAIN.
  // `.is("push_sent_at", null)` keeps this race-safe: if the cron got there
  // first in the same minute, we don't overwrite its stamp.
  if (resolved.id) {
    const admin = createAdminClient();
    const { error: stampErr } = await admin
      .from("notifications")
      .update({ push_sent_at: new Date().toISOString() })
      .eq("id", resolved.id)
      .is("push_sent_at", null);
    if (stampErr) console.warn(`[push-fanout] stamp failed: ${stampErr.message}`);
  }

  console.log(
    `[push-fanout] notif=${resolved.id ?? "(no id)"} user=${resolved.user_id} kind=${resolved.kind} sent=${result.sent} failed=${result.failed}`,
  );

  return NextResponse.json({ ok: true, sent: result.sent, failed: result.failed });
}
