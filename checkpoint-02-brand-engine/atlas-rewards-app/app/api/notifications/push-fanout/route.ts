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
      .select("id, user_id, business_id, kind, title, body, link_path")
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

  const result = await sendPushToUsers([resolved.user_id], {
    title: resolved.title,
    body: resolved.body ?? null,
    link_path: resolved.link_path ?? "/app",
    kind: resolved.kind ?? "generic",
  }, resolved.business_id ?? null);  // CP-51: scope push to the row's business

  console.log(
    `[push-fanout] notif=${resolved.id ?? "(no id)"} user=${resolved.user_id} kind=${resolved.kind} sent=${result.sent} failed=${result.failed}`,
  );

  return NextResponse.json({ ok: true, sent: result.sent, failed: result.failed });
}
