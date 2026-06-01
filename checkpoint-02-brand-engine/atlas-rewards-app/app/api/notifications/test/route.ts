/**
 * POST /api/notifications/test — CP-37.11
 *
 * Test notification endpoint that mirrors the proven push delivery
 * path used by /api/notifications/broadcast — which Andrew confirmed
 * actually rings phones.
 *
 * The earlier send_test_notification SQL RPC relied on the universal
 * pg_net push-fanout trigger to deliver phone pushes. That fan-out
 * silently failed in production (most likely pg_net config drift),
 * so test notifications were inserting in-app rows fine but no push
 * was ever firing. The Send-to-all broadcast works because the route
 * handler DIRECTLY calls sendPushToBusiness on the Node runtime —
 * no Postgres → HTTP hop required.
 *
 * This endpoint does the same thing for tests:
 *   1. Insert a notification row per member (so the bell badge
 *      updates, same as before).
 *   2. Directly call sendPushToBusiness with a 🧪 Test payload so
 *      the phone push fires through the same web-push pipe as the
 *      working broadcast composer.
 *
 * Body:
 *   {
 *     business_id: string,
 *     kind?: "streak_reminders" | "gift_expiration_reminders" |
 *            "customer_offer_announcements" | "check_in_available" |
 *            "we_miss_you" | "reward_unlocked" | "birthday" | "review_request"
 *             | null   // null = one per enabled kind
 *   }
 *
 * Returns: { ok, kinds_fired, recipients, push_sent, push_failed }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToBusiness } from "@/lib/notifications/push-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type KindKey =
  | "streak_reminders"
  | "gift_expiration_reminders"
  | "customer_offer_announcements"
  | "check_in_available"
  | "we_miss_you"
  | "reward_unlocked"
  | "birthday"
  | "review_request";

const ALL_KINDS: KindKey[] = [
  "streak_reminders",
  "gift_expiration_reminders",
  "customer_offer_announcements",
  "check_in_available",
  "we_miss_you",
  "reward_unlocked",
  "birthday",
  "review_request",
];

const KIND_LABELS: Record<KindKey, { title: string; notifKind: string }> = {
  streak_reminders:             { title: "Streak reminder",             notifKind: "streak" },
  gift_expiration_reminders:    { title: "Gift expiring",               notifKind: "reward_expiration" },
  customer_offer_announcements: { title: "Customer offer announcement", notifKind: "customer_offer" },
  check_in_available:           { title: "Check-in available",          notifKind: "check_in_available" },
  we_miss_you:                  { title: "We miss you",                 notifKind: "we_miss_you" },
  reward_unlocked:              { title: "Reward unlocked",             notifKind: "reward_unlocked" },
  birthday:                     { title: "Birthday bonus",              notifKind: "birthday" },
  review_request:               { title: "Review request",              notifKind: "review_request" },
};

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  let body: { business_id?: string; kind?: KindKey | null };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const businessId = body.business_id;
  if (!businessId) return NextResponse.json({ error: "business_id required" }, { status: 400 });

  // Permission gate — reuse the same RPC the broadcast route relies on.
  const { data: gateOk } = await supabase.rpc("is_business_manager_or_admin", {
    p_business_id: businessId,
  });
  if (!gateOk) {
    return NextResponse.json({ error: "permission denied — must be manager or agency admin" }, { status: 403 });
  }

  // Decide which kinds to fire.
  let kinds: KindKey[];
  if (body.kind) {
    if (!ALL_KINDS.includes(body.kind)) {
      return NextResponse.json({ error: "unknown kind" }, { status: 400 });
    }
    kinds = [body.kind];
  } else {
    // Pull enabled toggles for this business; default everything-on
    // if the settings row doesn't exist yet.
    const admin = createAdminClient();
    const { data: s } = await admin
      .from("business_notification_settings")
      .select("*")
      .eq("business_id", businessId)
      .maybeSingle();
    kinds = ALL_KINDS.filter(k => (s as any)?.[k] !== false);
  }

  if (kinds.length === 0) {
    return NextResponse.json({ ok: true, kinds_fired: 0, recipients: 0, push_sent: 0, push_failed: 0 });
  }

  // Count recipients up front so the toast has something useful to say.
  const admin = createAdminClient();
  const { count: recipients } = await admin
    .from("business_memberships")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);

  // For each kind we're firing, (a) insert the in-app row per member
  // and (b) push to phones via the proven sendPushToBusiness path.
  let totalSent = 0;
  let totalFailed = 0;

  for (const k of kinds) {
    const meta = KIND_LABELS[k];
    const title = `🧪 Test · ${meta.title}`;
    const messageBody = "Test from agency settings — if you saw this, the wire works.";

    // (a) In-app rows. SELECT ... INSERT pattern via a single SQL
    //     statement keeps it O(1) network calls.
    await admin.rpc("insert_test_notification_rows", {
      p_business_id: businessId,
      p_kind: meta.notifKind,
      p_title: title,
      p_body: messageBody,
    });

    // (b) Web-push directly. Same path as /api/notifications/broadcast
    //     uses — and Andrew confirmed that path actually rings phones.
    try {
      const { sent, failed } = await sendPushToBusiness(businessId, {
        title,
        body: messageBody,
        link_path: "/app",
        kind: meta.notifKind,
      });
      totalSent += sent;
      totalFailed += failed;
    } catch (e) {
      console.warn(`[notifications/test] push failed for kind=${k}:`, (e as any)?.message);
      totalFailed += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    kinds_fired: kinds.length,
    recipients: recipients ?? 0,
    push_sent: totalSent,
    push_failed: totalFailed,
  });
}
