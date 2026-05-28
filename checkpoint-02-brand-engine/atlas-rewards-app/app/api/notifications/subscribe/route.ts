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
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  let payload: any;
  try { payload = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const businessId = payload.business_id ?? null;
  const sub = payload.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  const { error } = await supabase.rpc("upsert_push_subscription", {
    p_business_id: businessId,
    p_endpoint:    sub.endpoint,
    p_p256dh:      sub.keys.p256dh,
    p_auth:        sub.keys.auth,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
