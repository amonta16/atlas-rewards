/**
 * GET /api/notifications/debug?business_id=<uuid> — CP-37.10
 *
 * Reports the state of every link in the push-notification pipe so
 * Andrew can stop guessing why test notifications "succeeded" but
 * didn't land on a device. Returns:
 *
 *   {
 *     vapid_configured:   boolean,   // VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY set
 *     vapid_subject:      string|null,
 *     member_count:       number,    // total members of this business
 *     push_subscribed_members: number, // members with at least one push_subscription
 *     subscriptions_total: number,   // total push_subscription rows for those members
 *     recent_notifications_24h: number,
 *     atlas_base_url_setting: string|null,  // Postgres custom setting used by push fanout
 *     warnings: string[],            // human-readable failures
 *   }
 *
 * Manager / agency-admin only. Run from the agency settings panel
 * before assuming the wire is broken; it tells you exactly which
 * dependency is missing.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const businessId = req.nextUrl.searchParams.get("business_id");
  if (!businessId) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 });
  }

  // Permission gate — manager or agency admin of this business.
  const server = createServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const { data: gateOk } = await server.rpc("is_business_manager_or_admin", {
    p_business_id: businessId,
  });
  if (!gateOk) {
    return NextResponse.json({ error: "permission denied" }, { status: 403 });
  }

  const admin = createAdminClient();
  const warnings: string[] = [];

  // (1) VAPID env vars.
  const vapidPub = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPriv = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || null;
  const vapidConfigured = !!(vapidPub && vapidPriv);
  if (!vapidConfigured) {
    warnings.push(
      "VAPID keys missing — push notifications cannot be delivered. Set VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY in Vercel env vars (Production + Preview).",
    );
  }
  if (vapidConfigured && !vapidSubject) {
    warnings.push(
      "VAPID_SUBJECT not set — defaults to mailto:hello@atlas-engine.org. Set this to your real contact email for Apple Push.",
    );
  }

  // (2) Member count.
  const { count: memberCount } = await admin
    .from("business_memberships")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);

  if ((memberCount ?? 0) === 0) {
    warnings.push(
      "This business has no enrolled members. Test notifications fan out to members — no members = nothing visible. Join the business as a customer (open /<slug> in another browser) before testing.",
    );
  }

  // (3) Members with push subscriptions.
  // Defensive: tolerate either schema (user_id-keyed or membership_id-keyed).
  let pushSubscribedMembers = 0;
  let subscriptionsTotal = 0;
  try {
    // Newer schema: push_subscriptions.user_id.
    const { data: subRows, error: subErr } = await admin
      .from("push_subscriptions")
      .select("user_id");
    if (subErr) throw subErr;
    if (subRows && subRows.length > 0) {
      const userIds = new Set(subRows.map(r => (r as any).user_id).filter(Boolean));
      subscriptionsTotal = subRows.length;
      // Intersect with members of this business.
      const { data: memberRows } = await admin
        .from("business_memberships")
        .select("user_id")
        .eq("business_id", businessId);
      const memberUserIds = new Set(
        (memberRows ?? []).map(r => (r as any).user_id).filter(Boolean),
      );
      let count = 0;
      for (const uid of userIds) if (memberUserIds.has(uid)) count++;
      pushSubscribedMembers = count;
    }
  } catch (e) {
    warnings.push(
      "Couldn't read push_subscriptions table — check the CP-42 push_subs schema migration was applied.",
    );
  }

  if ((memberCount ?? 0) > 0 && pushSubscribedMembers === 0) {
    warnings.push(
      "0 members have a push subscription. On a customer device, open /<slug>/app and tap the bell icon to grant push permission. Until at least one customer subscribes, push delivery will silently no-op.",
    );
  }

  // (4) Recent notifications activity.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: recentNotifs } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .gte("created_at", since24h);

  // (5) Postgres custom setting `atlas.base_url` (used by the CP-42
  // universal push fanout trigger to call back into /api/notifications/
  // push-fanout via pg_net). If unset, it falls back to a hardcoded URL.
  let atlasBaseUrl: string | null = null;
  try {
    const { data, error } = await admin.rpc("debug_atlas_base_url");
    if (!error) {
      atlasBaseUrl = typeof data === "string" ? data : (data as any)?.value ?? null;
    }
  } catch {
    // RPC may not be deployed; that's fine — fanout uses the hardcoded fallback.
  }

  return NextResponse.json({
    vapid_configured: vapidConfigured,
    vapid_subject: vapidSubject,
    member_count: memberCount ?? 0,
    push_subscribed_members: pushSubscribedMembers,
    subscriptions_total: subscriptionsTotal,
    recent_notifications_24h: recentNotifs ?? 0,
    atlas_base_url_setting: atlasBaseUrl,
    warnings,
  });
}
