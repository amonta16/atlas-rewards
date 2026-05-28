/**
 * push-server — CP-32
 *
 * Server-side helper that sends a web-push to every saved subscription
 * for a set of user_ids. Uses the `web-push` library and the VAPID
 * keypair from process.env. Tolerant of dead subscriptions: a 404 or
 * 410 from the push provider means the user uninstalled / cleared the
 * worker, so we delete the row.
 *
 * Imported by /api/notifications/broadcast/route.ts. Trigger-driven
 * notifications (review verified, daily check-in, etc.) only land
 * in the in-app bell today — wiring them to push as well needs
 * pg_net or a queue, which is a CP-33 follow-up.
 */
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

let vapidConfigured = false;

function configureVapid(): boolean {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:hello@atlas-engine.org";
  if (!pub || !priv) {
    console.warn("[push-server] VAPID keys missing — push fan-out disabled.");
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  vapidConfigured = true;
  return true;
}

export type PushPayload = {
  title: string;
  body?: string | null;
  link_path?: string | null;
  kind?: string;
};

/**
 * Send a push to every subscription for the given user_ids.
 * Returns { sent, failed } counts. Never throws — push delivery is
 * fire-and-forget; the in-app row is the canonical delivery.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!configureVapid()) return { sent: 0, failed: 0 };
  if (userIds.length === 0) return { sent: 0, failed: 0 };

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, user_id")
    .in("user_id", userIds);

  if (!subs?.length) return { sent: 0, failed: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    link_path: payload.link_path ?? "/",
    kind: payload.kind ?? "generic",
  });

  let sent = 0;
  let failed = 0;
  const deadIds: string[] = [];

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      );
      sent++;
    } catch (e: any) {
      failed++;
      // 404 Not Found or 410 Gone = subscription dead; clean it up.
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        deadIds.push(s.id);
      } else {
        console.warn(`[push-server] send failed for ${s.endpoint}:`, e?.message ?? e);
      }
    }
  }));

  if (deadIds.length) {
    await admin.from("push_subscriptions").delete().in("id", deadIds);
  }

  return { sent, failed };
}

/**
 * Fan a push out to every enrolled member of a business — mirrors
 * the audience of broadcast_notification(p_business_id) RPC.
 */
export async function sendPushToBusiness(
  businessId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("business_memberships")
    .select("user_id")
    .eq("business_id", businessId);
  const ids = (data ?? []).map(r => r.user_id).filter(Boolean) as string[];
  return sendPushToUsers(ids, payload);
}
