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

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Internal: send a payload to a concrete set of subscription rows.
 * Cleans up dead (404/410) subscriptions. Never throws.
 */
async function deliver(subs: SubRow[], payload: PushPayload): Promise<{ sent: number; failed: number }> {
  if (!configureVapid()) return { sent: 0, failed: 0 };
  if (!subs.length) return { sent: 0, failed: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? "",
    link_path: payload.link_path ?? "/",
    kind: payload.kind ?? "generic",
  });

  let sent = 0, failed = 0;
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
      if (e?.statusCode === 404 || e?.statusCode === 410) deadIds.push(s.id);
      else console.warn(`[push-server] send failed for ${s.endpoint}:`, e?.message ?? e);
    }
  }));

  if (deadIds.length) {
    const admin = createAdminClient();
    await admin.from("push_subscriptions").delete().in("id", deadIds);
  }
  return { sent, failed };
}

/**
 * Send a push to the given user_ids — STRICTLY scoped to one business.
 *
 * CP-51 tenant-isolation fix: `businessId` is REQUIRED. A device's push
 * subscription is tagged with the business it was created under, and we
 * only ever deliver to subscriptions whose business_id MATCHES. Pass a
 * real id for a business notification, or `null` for a root/global one
 * (which then only reaches root-tagged subscriptions). This is what
 * stops e.g. a new business's offer from pushing to a phone that's only
 * subscribed to a *different* business.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  businessId: string | null,
): Promise<{ sent: number; failed: number }> {
  if (userIds.length === 0) return { sent: 0, failed: 0 };

  const admin = createAdminClient();
  let q = admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);
  // The tenant boundary: never send a business's push to a subscription
  // tagged for a different business (or to an untagged/global one).
  q = businessId === null ? q.is("business_id", null) : q.eq("business_id", businessId);

  const { data: subs } = await q;
  return deliver((subs ?? []) as SubRow[], payload);
}

/**
 * Fan a push out to a business's audience.
 *
 * CP-51: scoped by the subscription's OWN business_id tag — the
 * isolation boundary — rather than by membership. A subscription only
 * carries a business_id if the user subscribed to push from inside that
 * business's app, so this is exactly the set of devices that opted into
 * THIS business's notifications, and nobody else's.
 */
export async function sendPushToBusiness(
  businessId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("business_id", businessId);
  return deliver((subs ?? []) as SubRow[], payload);
}
