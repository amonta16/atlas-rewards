/**
 * POST /api/notifications/subscribe — CP-32
 *
 * Persists a browser PushSubscription on the signed-in user. Body:
 *   { business_id: uuid | null, subscription: { endpoint, keys: { p256dh, auth } } }
 *
 * Upserts on (user_id, endpoint) so re-subscribing the same device is a no-op.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.warn("[subscribe] no auth");
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  let payload: any;
  try { payload = await req.json(); }
  catch (e) {
    console.warn("[subscribe] bad json", e);
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const businessId = payload.business_id ?? null;
  const sub = payload.subscription;

  // CP-42 verbose logging — chase the 400s
  console.log("[subscribe] payload shape:", {
    has_subscription: !!sub,
    has_endpoint: !!sub?.endpoint,
    has_keys: !!sub?.keys,
    has_p256dh: !!sub?.keys?.p256dh,
    has_auth: !!sub?.keys?.auth,
    business_id: businessId,
    user_id: user.id,
  });

  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    console.warn("[subscribe] invalid subscription shape — missing required fields");
    return NextResponse.json({
      error: "invalid subscription",
      received_shape: {
        has_subscription: !!sub,
        has_endpoint: !!sub?.endpoint,
        has_keys: !!sub?.keys,
        has_p256dh: !!sub?.keys?.p256dh,
        has_auth: !!sub?.keys?.auth,
      },
    }, { status: 400 });
  }

  const { error } = await supabase.rpc("upsert_push_subscription", {
    p_business_id: businessId,
    p_endpoint:    sub.endpoint,
    p_p256dh:      sub.keys.p256dh,
    p_auth:        sub.keys.auth,
  });
  if (error) {
    console.error("[subscribe] upsert_push_subscription RPC failed:", error);
    return NextResponse.json({
      error: "rpc_failed: " + error.message,
      hint: "Make sure cp32_migration.sql is applied (creates upsert_push_subscription RPC + push_subscriptions table)",
    }, { status: 400 });
  }

  console.log("[subscribe] saved subscription for user", user.id, "business", businessId);
  return NextResponse.json({ ok: true });
}
