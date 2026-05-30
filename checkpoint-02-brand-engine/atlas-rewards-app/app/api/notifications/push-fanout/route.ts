/**
 * POST /api/notifications/push-fanout — CP-42
 *
 * Called by the Postgres trigger `_notif_push_fanout` (via pg_net)
 * every time a row is inserted into public.notifications. Looks up
 * the notification row + every push subscription belonging to that
 * user and fires web-push to each.
 *
 * Body: { notification_id: uuid }
 *
 * This is what turns trigger-driven in-app notifications (review
 * verified, reward unlocked, daily check-in, etc.) into actual phone
 * push notifications that show up on the lock screen.
 *
 * Security: this route is called by the database, not by users.
 * It uses the admin client and is effectively a webhook target.
 * Anyone can call it, but they can only trigger pushes for
 * notifications that already exist — they can't forge content.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/notifications/push-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const notificationId = body.notification_id;
  if (!notificationId) {
    return NextResponse.json({ error: "notification_id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: notif, error } = await admin
    .from("notifications")
    .select("id, user_id, business_id, kind, title, body, link_path")
    .eq("id", notificationId)
    .maybeSingle();

  if (error) {
    console.log("[push-fanout] lookup failed:", error.message);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }
  if (!notif) {
    return NextResponse.json({ error: "notification not found" }, { status: 404 });
  }

  const result = await sendPushToUsers([notif.user_id], {
    title: notif.title,
    body: notif.body,
    link_path: notif.link_path ?? "/app",
    kind: notif.kind,
  });

  console.log(
    `[push-fanout] notif=${notificationId} kind=${notif.kind} sent=${result.sent} failed=${result.failed}`,
  );

  return NextResponse.json({ ok: true, sent: result.sent, failed: result.failed });
}
