/**
 * POST /api/notifications/announce-offer — CP-43
 *
 * Fires the "Customer offer announcement" automated notification the
 * instant an offer is featured, using the SAME proven path the old test
 * button used: insert an in-app row per member + a synchronous web-push
 * via sendPushToBusiness. No cron, no pg_net.
 *
 * Respects the business's master toggle: if customer_offer_announcements
 * is OFF in business_notification_settings, this no-ops.
 *
 * Body:
 *   { business_id: uuid, offer_id?: uuid, title: string, description?: string|null }
 *
 * Returns: { ok, skipped?, recipients, push_sent, push_failed }
 */
import { NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToBusiness } from "@/lib/notifications/push-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { business_id?: string; offer_id?: string; title?: string; description?: string | null };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const businessId = body.business_id;
  const offerTitle = (body.title ?? "").trim();
  if (!businessId || !offerTitle) {
    return NextResponse.json({ error: "business_id + title required" }, { status: 400 });
  }

  // Permission: caller must staff this business (agency admin / manager).
  const server = createServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const { data: isStaff } = await server.rpc("staffs_business", { b_id: businessId });
  if (!isStaff) return NextResponse.json({ error: "permission denied" }, { status: 403 });

  const admin = createAdminClient();

  // Respect the master toggle. Default to ON if the settings row is absent.
  const { data: settings } = await admin
    .from("business_notification_settings")
    .select("customer_offer_announcements")
    .eq("business_id", businessId)
    .maybeSingle();
  if (settings && settings.customer_offer_announcements === false) {
    return NextResponse.json({ ok: true, skipped: "toggle_off", recipients: 0, push_sent: 0 });
  }

  const title = "New offer just dropped 🎁";
  const messageBody = body.description?.trim()
    ? `${offerTitle} — ${body.description.trim()}`
    : offerTitle;

  // (a) In-app rows for every enrolled member, so the bell badge updates.
  const { data: members } = await admin
    .from("business_memberships")
    .select("user_id")
    .eq("business_id", businessId);
  const userIds = (members ?? []).map((m: any) => m.user_id).filter(Boolean) as string[];

  if (userIds.length > 0) {
    const rows = userIds.map(uid => ({
      user_id: uid,
      business_id: businessId,
      kind: "customer_offer",
      title,
      body: messageBody,
      link_path: "/app/rewards",
      // Mark as already pushed here so the cron doesn't double-send —
      // we push synchronously below.
      push_sent_at: new Date().toISOString(),
    }));
    try { await admin.from("notifications").insert(rows); }
    catch (e) { console.warn("[announce-offer] insert failed:", (e as any)?.message); }
  }

  // (b) Synchronous phone push — the proven path.
  let pushSent = 0, pushFailed = 0;
  try {
    const r = await sendPushToBusiness(businessId, {
      title,
      body: messageBody,
      link_path: "/app/rewards",
      kind: "customer_offer",
    });
    pushSent = r.sent; pushFailed = r.failed;
  } catch (e) {
    console.warn("[announce-offer] push failed:", (e as any)?.message);
  }

  return NextResponse.json({ ok: true, recipients: userIds.length, push_sent: pushSent, push_failed: pushFailed });
}
