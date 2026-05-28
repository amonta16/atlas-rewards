/**
 * POST /api/notifications/broadcast — CP-32
 *
 * Sends an in-app notification (and a best-effort PWA push) to every
 * enrolled member of one business. Caller must be the business's
 * manager or an agency_admin — enforced by the broadcast_notification
 * RPC, not by this route handler. Body:
 *
 *   { business_id: uuid, title: string, body?: string|null, link_path?: string|null }
 *
 * Returns: { ok: true, recipients: number, push_sent: number }
 *
 * Push delivery is fire-and-forget — we don't block the response on
 * the push fan-out. The in-app row insert happens transactionally
 * inside the RPC so the bell badge updates regardless.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToBusiness } from "@/lib/notifications/push-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // web-push needs the node runtime

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const businessId = body.business_id;
  const title = (body.title ?? "").trim();
  if (!businessId || !title) {
    return NextResponse.json({ error: "business_id and title required" }, { status: 400 });
  }

  // broadcast_notification is SECURITY DEFINER and gates on
  // is_business_manager_or_admin(business_id). It fans the row into
  // notifications for every enrolled member.
  const { data, error } = await supabase.rpc("broadcast_notification", {
    p_business_id: businessId,
    p_title:       title,
    p_body:        body.body ?? null,
    p_link_path:   body.link_path ?? null,
    p_kind:        "customer_offer",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const recipients =
    typeof data === "number" ? data
    : Array.isArray(data) ? (data[0]?.recipients ?? data.length)
    : 0;

  // CP-32: actual PWA push fan-out. Best effort — if VAPID isn't
  // configured the helper silently returns 0/0 and the in-app
  // notification still went through.
  let pushSent = 0;
  try {
    const result = await sendPushToBusiness(businessId, {
      title,
      body: body.body ?? null,
      link_path: body.link_path ?? null,
      kind: "customer_offer",
    });
    pushSent = result.sent;
  } catch (e) {
    console.warn("[broadcast] push fan-out skipped:", (e as any)?.message);
  }

  return NextResponse.json({ ok: true, recipients, push_sent: pushSent });
}
