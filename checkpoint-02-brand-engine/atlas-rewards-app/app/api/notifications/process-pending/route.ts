/**
 * GET /api/notifications/process-pending — CP-37.12
 *
 * Vercel cron target. Reads notifications.push_sent_at IS NULL,
 * fires web-push for each via sendPushToUsers (the proven path the
 * Send-to-all broadcast uses), and marks the rows as sent.
 *
 * Replaces the CP-42 pg_net + universal trigger pipe, which was
 * silently failing for Andrew. The cron runs once a minute so trigger-
 * fired notifications (reward_unlocked, daily_check, review_request,
 * etc.) ring phones within ~60s of the in-app row landing.
 *
 * Auth: protected by `CRON_SECRET` env var. Vercel passes a header
 * the cron runtime sets automatically. Manual calls require the
 * same secret in the Authorization header.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/notifications/push-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Vercel Cron sets the Authorization header with `Bearer ${CRON_SECRET}`.
  const auth = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  // If a secret is configured, require it. If not configured, allow
  // (dev environments often skip it). Production should always set it.
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin.rpc("list_pending_pushes", { p_limit: 100 });
  if (error) {
    console.error("[process-pending] list failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const pending = (rows ?? []) as Array<{
    id: string; user_id: string; business_id: string | null;
    kind: string; title: string; body: string | null; link_path: string | null;
  }>;

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  // Push per-row so each notification carries its own title/body.
  // Most trigger-fired batches are one row each anyway (one user
  // crossing one threshold), so this isn't a hot path.
  let sent = 0;
  let failed = 0;
  const doneIds: string[] = [];

  for (const n of pending) {
    try {
      const result = await sendPushToUsers([n.user_id], {
        title: n.title,
        body: n.body ?? null,
        link_path: n.link_path ?? "/app",
        kind: n.kind,
      }, n.business_id ?? null);  // CP-51: scope push to the row's business
      sent += result.sent;
      failed += result.failed;
      doneIds.push(n.id);
    } catch (e: any) {
      console.warn(`[process-pending] notif=${n.id} push failed:`, e?.message);
      // Don't mark as sent so the next tick retries. If sendPushToUsers
      // throws for VAPID-missing it'll keep failing — that's still
      // surfaced by the diagnostics panel.
      failed += 1;
    }
  }

  if (doneIds.length > 0) {
    await admin.rpc("mark_pushed", { p_ids: doneIds });
  }

  console.log(`[process-pending] processed=${pending.length} sent=${sent} failed=${failed}`);
  return NextResponse.json({
    ok: true,
    processed: pending.length,
    push_sent: sent,
    push_failed: failed,
  });
}
