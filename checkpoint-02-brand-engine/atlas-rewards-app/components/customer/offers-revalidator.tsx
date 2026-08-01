"use client";
/**
 * OffersRevalidator — CP-88: neutralised on purpose. Keep reading.
 *
 * WHAT THIS USED TO DO
 * Every customer on the Home tab subscribed to the per-business Realtime
 * topic `offers-${businessId}` and called `router.refresh()` on any change
 * to that business's offers.
 *
 * WHY THAT WAS A LOADED GUN
 * `/[business]/app` is `force-dynamic`, so `router.refresh()` re-runs the
 * entire layout + page chain: ~17 Supabase round-trips, three of them
 * `getUser()` calls against Supabase Auth. Because the topic is
 * per-BUSINESS rather than per-customer, one manager toggling one offer
 * fanned out to every connected customer at once:
 *
 *     50 customers    →   ~950 requests   (~150 auth)
 *    500 customers    → ~9,500 requests (~1,500 auth)
 *  1,000 customers    → ~19,000 requests (~3,000 auth)
 *
 * ...all inside a second or two. That is the same burst that produced the
 * July 25 lockout (54k auth requests/hour, `POST /token` 429s, real admins
 * unable to sign in — see checkpoint-84-refresh-token-storm), except
 * triggered by normal business use instead of a cookie bug. It would have
 * gone off the first busy day after launch.
 *
 * WHY REMOVING IT IS SAFE
 * Nothing on Home depends on this refresh. Every offers-derived surface
 * already runs its own Realtime subscription and re-queries just its own
 * slice of data:
 *
 *   • components/customer/featured-offer-banner.tsx  — `offers` listener
 *   • components/customer/limited-offers-section.tsx — `offers` listener
 *   • components/customer/offer-reveal-watcher.tsx   — `offers` listener
 *
 * Those three, plus this component, meant the SAME event was handled four
 * times per customer. The targeted re-queries are 1–2 RPCs each; the
 * `router.refresh()` was ~17. So the fix is to drop the expensive one and
 * keep the cheap ones — the "manager features an offer, customer's banner
 * updates live" behaviour is preserved by the banner's own listener.
 *
 * WHY THE COMPONENT STILL EXISTS
 * It's still mounted in `app/[business]/app/page.tsx`. Leaving a documented
 * no-op keeps this checkpoint to a one-file change with no risk of a broken
 * import. Removing the mount and deleting this file is safe cleanup for a
 * later checkpoint.
 *
 * IF YOU EVER NEED A WHOLE-PAGE REVALIDATE ON A SHARED TOPIC
 * Don't call `router.refresh()` bare. Wrap it in
 * `createJitteredHandler` from `lib/realtime-jitter.ts` so clients ramp
 * instead of spiking, and satisfy yourself that no cheaper targeted fetch
 * would do.
 */

export function OffersRevalidator(_props: { businessId: string }) {
  return null;
}
