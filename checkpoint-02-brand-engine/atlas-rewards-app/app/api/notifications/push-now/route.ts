/**
 * POST /api/notifications/push-now — CP-43
 *
 * Fires an INSTANT phone push to specific members of a business, via the
 * exact same sendPushToUsers path that "Send to all" and the test button
 * use. This is the companion to the manager-initiated notifications whose
 * in-app row is already written by an RPC (e.g. send_winback) but which
 * shouldn't have to wait up to a minute for the process-pending cron to
 * ring the phone.
 *
 * It does NOT insert an in-app row — the calling RPC already did that —
 * it only delivers the push. Gated to staff/manager/admin of the business.
 *
 * Body:
 *   {
 *     business_id: uuid,
 *     membership_ids?: uuid[],   // resolved to user_ids
 *     user_ids?: uuid[],         // used directly if provided
 *     title: string,
 *     body?: string | null,
 *     link_path?: string | null,
 *     kind?: string,
 *   }
 *
 * Returns: { ok, push_sent, push_failed }
 */
import { NextResponse } from "next/server";
import { createClient as createServer } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/notifications/push-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: {
    business_id?: string;
    membership_ids?: string[];
    user_ids?: string[];
    title?: string;
    body?: string | null;
    link_path?: string | null;
    kind?: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const businessId = body.business_id;
  const title = (body.title ?? "").trim();
  if (!businessId || !title) {
    return NextResponse.json({ error: "business_id + title required" }, { status: 400 });
  }

  // Permission: caller must staff this business — same gate as award-event.
  const server = createServer();
  const { data: { user } } = await server.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  const { data: isStaff } = await server.rpc("staffs_business", { b_id: businessId });
  if (!isStaff) return NextResponse.json({ error: "permission denied" }, { status: 403 });

  // Resolve the recipient user_ids.
  const admin = createAdminClient();
  const userIds = new Set<string>((body.user_ids ?? []).filter(Boolean));

  const membershipIds = (body.membership_ids ?? []).filter(Boolean);
  if (membershipIds.length > 0) {
    const { data: mems } = await admin
      .from("business_memberships")
      .select("user_id")
      .eq("business_id", businessId)
      .in("id", membershipIds);
    for (const m of (mems ?? []) as Array<{ user_id: string | null }>) {
      if (m.user_id) userIds.add(m.user_id);
    }
  }

  if (userIds.size === 0) {
    return NextResponse.json({ ok: true, push_sent: 0, push_failed: 0 });
  }

  const { sent, failed } = await sendPushToUsers([...userIds], {
    title,
    body: body.body ?? null,
    link_path: body.link_path ?? "/app",
    kind: body.kind ?? "generic",
  }, businessId);  // CP-51: scope push to this business only

  return NextResponse.json({ ok: true, push_sent: sent, push_failed: failed });
}
