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
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  // CP-44: cap subscription churn per IP.
  const rl = await rateLimit(clientKey(req, "subscribe"), 20, 60);
  if (!rl.ok) return tooMany(rl.retryAfter);

  // 1. Verify the caller via session-bound client (reads cookies)
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.log("[subscribe] no auth — rejecting");
    return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  }

  // ── CP-109 tenant check ─────────────────────────────────────────────
  // The business tag on a push subscription decides WHICH tenant's
  // announcements/offers reach this device, and it used to be taken from
  // the client verbatim. Verify the caller actually belongs to the
  // claimed business (member, staff of it, or global agency staff)
  // before honoring it. Mirrors the DB guard trigger from
  // cp109_notifications_hardening.sql.
  async function mayTagBusiness(businessId: string | null): Promise<boolean> {
    if (!businessId) return true;
    const admin = createAdminClient();
    const { data: mem } = await admin
      .from("business_memberships")
      .select("id").eq("user_id", user!.id).eq("business_id", businessId).limit(1);
    if (mem && mem.length > 0) return true;
    const { data: staff } = await admin
      .from("business_users")
      .select("role, business_id")
      .eq("user_id", user!.id)
      .or(`business_id.eq.${businessId},business_id.is.null`);
    return (staff ?? []).some((r: any) =>
      r.business_id === businessId || (r.business_id === null && (r.role === "agency_admin" || r.role === "agency_va")));
  }

  // 2. Parse body
  let payload: any;
  try { payload = await req.json(); }
  catch (e) {
    console.log("[subscribe] bad json");
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // ---- CP-77: NATIVE branch — Capacitor app registering an FCM token.
  // Body: { platform: "android"|"ios", token, business_id? | business_slug? }
  // Stored with endpoint = "fcm:<token>" so unique(user_id, endpoint) and
  // the CP-51 business-scoped fan-out work unchanged.
  if (payload.platform === "android" || payload.platform === "ios") {
    const token = typeof payload.token === "string" ? payload.token.trim() : "";
    if (token.length < 20 || token.length > 4096) {
      return NextResponse.json({ error: "invalid token" }, { status: 400 });
    }
    const admin2 = createAdminClient();
    let nativeBusinessId: string | null = payload.business_id ?? null;
    if (!nativeBusinessId && typeof payload.business_slug === "string") {
      const { data: biz } = await admin2
        .from("businesses").select("id").eq("slug", payload.business_slug).maybeSingle();
      nativeBusinessId = biz?.id ?? null;
    }
    if (!(await mayTagBusiness(nativeBusinessId))) {
      console.log("[subscribe] rejected native tag: user", user.id, "is not in business", nativeBusinessId);
      return NextResponse.json({ error: "not a member of this business" }, { status: 403 });
    }
    const { error: nativeErr } = await admin2
      .from("push_subscriptions")
      .upsert(
        {
          user_id: user.id,
          business_id: nativeBusinessId,
          endpoint: `fcm:${token}`,
          p256dh: null,
          auth: null,
          platform: payload.platform,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,endpoint" },
      );
    if (nativeErr) {
      console.log("[subscribe] native upsert failed:", nativeErr.message, nativeErr.code);
      return NextResponse.json({ error: "upsert_failed", message: nativeErr.message }, { status: 400 });
    }
    console.log("[subscribe] saved native token for user", user.id, "business", nativeBusinessId, payload.platform);
    return NextResponse.json({ ok: true });
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
  if (!(await mayTagBusiness(businessId))) {
    console.log("[subscribe] rejected web tag: user", user.id, "is not in business", businessId);
    return NextResponse.json({ error: "not a member of this business" }, { status: 403 });
  }
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
