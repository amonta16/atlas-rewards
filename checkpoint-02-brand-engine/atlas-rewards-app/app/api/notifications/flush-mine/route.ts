/**
 * POST /api/notifications/flush-mine — CP-43
 *
 * Customer-safe instant push. Pushes the SIGNED-IN customer's own pending
 * notifications (push_sent_at IS NULL) to their own devices via the proven
 * sendPushToUsers path, then marks them sent — so a reward-unlocked row the
 * DB trigger just created fires to the phone immediately instead of waiting
 * up to a minute for the process-pending cron.
 *
 * This is the cron-independent path for SELF-EARNED points (check-in, spin,
 * referral, review): the client calls it right after an action that could
 * have crossed a reward threshold. Safe because it only ever pushes the
 * caller's own notifications to the caller's own subscriptions.
 *
 * Body: {} (none needed — scoped to the authed user)
 * Returns: { ok, pushed, push_sent, push_failed }
 */
import { NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/notifications/push-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const server = createServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const admin = createAdminClient();
  // Only recent, unpushed rows for THIS user — avoids re-pushing a backlog.
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: rows } = await admin
    .from("notifications")
    .select("id, kind, title, body, link_path")
    .eq("user_id", user.id)
    .is("push_sent_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(20);

  const pending = (rows ?? []) as Array<{ id: string; kind: string; title: string; body: string | null; link_path: string | null }>;
  if (pending.length === 0) {
    return NextResponse.json({ ok: true, pushed: 0, push_sent: 0, push_failed: 0 });
  }

  let sent = 0, failed = 0;
  const doneIds: string[] = [];
  for (const n of pending) {
    try {
      const r = await sendPushToUsers([user.id], {
        title: n.title,
        body: n.body ?? null,
        link_path: n.link_path ?? "/app",
        kind: n.kind,
      });
      sent += r.sent; failed += r.failed;
      doneIds.push(n.id);
    } catch (e) {
      console.warn(`[flush-mine] notif=${n.id} push failed:`, (e as any)?.message);
    }
  }

  if (doneIds.length > 0) {
    try { await admin.rpc("mark_pushed", { p_ids: doneIds }); }
    catch (e) { console.warn("[flush-mine] mark_pushed failed:", (e as any)?.message); }
  }

  return NextResponse.json({ ok: true, pushed: doneIds.length, push_sent: sent, push_failed: failed });
}
