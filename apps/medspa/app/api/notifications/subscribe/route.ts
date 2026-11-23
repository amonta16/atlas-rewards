import { NextResponse } from "next/server";
import { getCachedUser } from "@atlas/core/supabase/server";
import { createAdminClient } from "@atlas/core/supabase/admin";

/**
 * POST /api/notifications/subscribe  { business_id, subscription: { endpoint, keys: { p256dh, auth } } }
 * DELETE same body (endpoint only) → turn off on this device.
 *
 * Saves the browser's push subscription into the SAME push_subscriptions
 * table the venue app uses, tagged with the clinic. Everything the venue
 * app already sends (automations, offers, broadcasts, reward alerts)
 * then reaches this device. Same rules as the venue route (CP-42/109):
 * signed-in user from the session, and they must be a member of the clinic.
 *
 * MedSpa App (Google Play, native/medspa-shell): { platform: "android" | "ios", token, business_id }
 * saves the FCM device token as endpoint "fcm-medspa:<token>" with no keys.
 * The shared sender hands those rows to /api/push/deliver, which sends them
 * through the MedSpa App's own Firebase project.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCachedUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    business_id?: string; subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    platform?: string; token?: string;
  } | null;
  const businessId = body?.business_id ?? null;
  const native = body?.platform === "android" || body?.platform === "ios";
  const token = native && typeof body?.token === "string" ? body.token.trim() : "";
  const sub = body?.subscription;
  if (native ? (!businessId || token.length < 20 || token.length > 4096)
    : (!businessId || !sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth || sub.endpoint.length > 2048)) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: mem } = await admin.from("business_memberships").select("id").eq("user_id", user.id).eq("business_id", businessId!).limit(1);
  if (!mem?.length) return NextResponse.json({ error: "not a member of this clinic" }, { status: 403 });

  const row = native
    ? { endpoint: `fcm-medspa:${token}`, p256dh: null, auth: null, platform: body!.platform }
    : { endpoint: sub!.endpoint!, p256dh: sub!.keys!.p256dh!, auth: sub!.keys!.auth! };
  const { error } = await admin.from("push_subscriptions").upsert({
    user_id: user.id, business_id: businessId, ...row, last_seen_at: new Date().toISOString(),
  }, { onConflict: "user_id,endpoint" });
  if (error) {
    console.error("[medspa subscribe] upsert failed:", error.message);
    return NextResponse.json({ error: "upsert_failed" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCachedUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  await createAdminClient().from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", body.endpoint);
  return NextResponse.json({ ok: true });
}
