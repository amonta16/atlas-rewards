/**
 * POST /api/notifications/subscribe — CP-32 / CP-42
 *
 * Persists a browser PushSubscription on the signed-in user. Body:
 *   { business_id: uuid | null, subscription: { endpoint, keys: { p256dh, auth } } }
 *
 * CP-42 rewrite: switched from `supabase.rpc("upsert_push_subscription")` to
 * a direct admin-client upsert. The RPC was failing silently because
 * `auth.uid()` inside the RPC came back null on customer subdomains —
 * the session cookie set on `dermis.atlas-engine.app` didn't always
 * reach the Postgres function context. The admin client bypasses RLS
 * entirely and we pass the user_id we already verified in this route.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  // 1. Verify the caller via session-bound client (reads cookies)
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log("[subscribe] no auth — rejecting");
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  // 2. Parse body
  let payload: any;
  try { payload = await req.json(); }
  catch (e) {
    console.log("[subscribe] bad json");
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const businessId = payload.business_id ?? null;
  const sub = payload.subscription;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    console.log("[subscribe] invalid subscription shape:", {
      has_subscription: !!sub,
      has_endpoint: !!sub?.endpoint,
      has_keys: !!sub?.keys,
      has_p256dh: !!sub?.keys?.p256dh,
      has_auth: !!sub?.keys?.auth,
    });
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }

  // 3. CP-42: use admin client to bypass any auth-context issues. We
  // already verified the caller is authenticated above, so passing
  // user.id explicitly is safe.
  const admin = createAdminClient();
  const { error } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        business_id: businessId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" },
    );

  if (error) {
    // CP-42: log + return the actual database error so we can see it
    // in both Vercel runtime logs AND the browser response.
    console.log("[subscribe] upsert failed:", error.message, error.details, error.hint, error.code);
    return NextResponse.json({
      error: "upsert_failed",
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    }, { status: 400 });
  }

  console.log("[subscribe] saved subscription for user", user.id, "business", businessId);
  return NextResponse.json({ ok: true });
}
