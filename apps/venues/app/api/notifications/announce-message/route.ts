/**
 * POST /api/notifications/announce-message — CP-86
 *
 * Push + in-app bell fan-out for a business ANNOUNCEMENT ("Tuesday we're
 * closing early"). Mirrors the proven announce-offer path (in-app row per
 * member + synchronous push via sendPushToBusiness) but is MANAGER-ONLY —
 * front-desk staff can't blast every customer's phone.
 *
 * The persistent banner itself lives in business_announcements (written by
 * the composer via the set_business_announcement RPC before calling this);
 * this route is only the "make phones light up" half, so a failure here
 * still leaves the banner up.
 *
 * Body:    { business_id: uuid, message: string }
 * Returns: { ok, recipients, push_sent, push_failed }
 */
import { NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToBusiness } from "@/lib/notifications/push-server";
import { rateLimit, clientKey, tooMany } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  // Same cap as the broadcast route — announcements are rare by nature.
  const rl = await rateLimit(clientKey(req, "announce-message"), 10, 60);
  if (!rl.ok) return tooMany(rl.retryAfter);

  let body: { business_id?: string; message?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const businessId = body.business_id;
  const message = (body.message ?? "").trim().slice(0, 280);
  if (!businessId || !message) {
    return NextResponse.json({ error: "business_id + message required" }, { status: 400 });
  }

  // Permission: MANAGER or agency admin only (not business_staff).
  const server = createServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const { data: isManager } = await server.rpc("is_business_manager", { b_id: businessId });
  if (!isManager) return NextResponse.json({ error: "permission denied — manager only" }, { status: 403 });

  const admin = createAdminClient();

  const { data: biz } = await admin
    .from("businesses").select("name").eq("id", businessId).maybeSingle();
  const title = `📣 ${biz?.name ?? "Announcement"}`;

  // (a) In-app bell rows for every enrolled member.
  const { data: members } = await admin
    .from("business_memberships")
    .select("user_id")
    .eq("business_id", businessId);
  const userIds = Array.from(
    new Set((members ?? []).map((m: any) => m.user_id).filter(Boolean)),
  ) as string[];

  if (userIds.length > 0) {
    const rows = userIds.map(uid => ({
      user_id: uid,
      business_id: businessId,
      kind: "generic",
      title,
      body: message,
      link_path: "/app",
      // Pushed synchronously below — stop the cron from double-sending.
      push_sent_at: new Date().toISOString(),
    }));
    try { await admin.from("notifications").insert(rows); }
    catch (e) { console.warn("[announce-message] insert failed:", (e as any)?.message); }
  }

  // (b) Synchronous phone push — tenant-scoped by the subscription's
  // own business_id tag (CP-51 isolation).
  let pushSent = 0, pushFailed = 0;
  try {
    const r = await sendPushToBusiness(businessId, {
      title,
      body: message,
      link_path: "/app",
      kind: "generic",
    });
    pushSent = r.sent; pushFailed = r.failed;
  } catch (e) {
    console.warn("[announce-message] push failed:", (e as any)?.message);
  }

  return NextResponse.json({ ok: true, recipients: userIds.length, push_sent: pushSent, push_failed: pushFailed });
}
