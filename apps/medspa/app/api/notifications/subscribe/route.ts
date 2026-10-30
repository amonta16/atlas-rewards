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
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCachedUser().catch(() => null);
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { business_id?: string; subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } } | null;
  const sub = body?.subscription;
  const businessId = body?.business_id ?? null;
  if (!businessId || !sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth || sub.endpoint.length > 2048) {
    return NextResponse.json({ error: "invalid subscription" }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: mem } = await admin.from("business_memberships").select("id").eq("user_id", user.id).eq("business_id", businessId).limit(1);
  if (!mem?.length) return NextResponse.json({ error: "not a member of this clinic" }, { status: 403 });

  const { error } = await admin.from("push_subscriptions").upsert({
    user_id: user.id, business_id: businessId, endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh, auth: sub.keys.auth, last_seen_at: new Date().toISOString(),
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
