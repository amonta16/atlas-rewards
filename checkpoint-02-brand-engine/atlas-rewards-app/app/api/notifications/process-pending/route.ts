/**
 * GET /api/notifications/process-pending — CP-37.12, secured in CP-88
 *
 * Vercel cron target. Reads notifications.push_sent_at IS NULL,
 * fires web-push for each via sendPushToUsers (the proven path the
 * Send-to-all broadcast uses), and marks the rows as sent.
 *
 * Replaces the CP-42 pg_net + universal trigger pipe, which was
 * silently failing for Andrew.
 *
 * ── CP-88 SECURITY ───────────────────────────────────────────────
 * The old check was:
 *
 *     if (cronSecret && auth !== `Bearer ${cronSecret}`) return 401;
 *
 * That fails OPEN — with `CRON_SECRET` unset the check is skipped and
 * anyone can GET this route and drain the pending-push queue. `CRON_SECRET`
 * was not set locally. Now it fails CLOSED via `requireMachineSecret`, and
 * returns a distinguishable 503 if the deployment has no secret configured.
 *
 * ── CP-88 NOTE ON DELIVERY LATENCY (this is a live functional bug) ─
 * The docblock used to claim "the cron runs once a minute so trigger-fired
 * notifications ring phones within ~60s." It does not. `vercel.json`
 * schedules this at `0 12 * * *` — once a day — because **Vercel's Hobby
 * plan caps cron jobs at once per day**, with ±59 minutes of scheduling
 * slop. Any more frequent expression fails at deploy time.
 *
 * So today, a customer who unlocks a reward can wait up to 24 hours for the
 * push. On Vercel Pro the minimum interval drops to once per minute; after
 * upgrading, change the schedule in `vercel.json` to:
 *
 *     { "path": "/api/notifications/process-pending", "schedule": "* * * * *" }
 *
 * That is deliberately NOT changed in this checkpoint — committing a
 * per-minute cron while still on Hobby fails the deployment outright.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/notifications/push-server";
import { requireMachineSecret } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // CP-88: fail CLOSED. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
  const gate = requireMachineSecret(req);
  if (!gate.ok) {
    console.warn(`[process-pending] rejected: ${gate.error}`);
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const admin = createAdminClient();

  // CP-116: drain the reminder QUEUE into `notifications` BEFORE listing, so
  // any row that just came due goes out in this same per-minute tick. Nothing
  // else schedules fire_due_notifications() — without this line every queued
  // reminder (the 12h "check in again / keep your streak going / spin's ready"
  // nudge from cp42/cp109) sits in notification_queue forever, which is why
  // streak/check-in reminders were never received. The service-role admin
  // client is exactly who cp109 granted this function to. Best-effort: a
  // drain error never blocks the immediate-notification push below.
  const { error: drainErr } = await admin.rpc("fire_due_notifications");
  if (drainErr) console.warn("[process-pending] queue drain failed:", drainErr.message);

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
