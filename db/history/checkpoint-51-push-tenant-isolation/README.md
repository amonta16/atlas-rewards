# CP-51 — Fix: push notifications crossing between businesses

## The bug

You created a new business (no customers), added an offer to it, and your **Starbucks** test app buzzed with a notification. Pushes were leaking across tenants — a serious isolation bug.

## Root cause

Each device's push subscription **is** correctly tagged with the business it was created under (`push_subscriptions.business_id` — added back in CP-32/42). But the server-side push fan-out ignored that tag: `sendPushToUsers()` matched subscriptions on **`user_id` only**.

So when the new business announced its offer, it looked up that business's members, found your account, and pushed to **every** subscription for your user — including the one your phone registered under Starbucks. The installed Starbucks PWA (same web origin) then displayed it.

## The fix

Made the business a **required, enforced scope** on every push:

- `sendPushToUsers(userIds, payload, businessId)` now filters `push_subscriptions` by `business_id` too — it only delivers to subscriptions tagged for that exact business (or, for a global notification, to untagged ones). A different business's offer can no longer reach a Starbucks-tagged device.
- `sendPushToBusiness(businessId, …)` now selects subscriptions **by the subscription's own `business_id` tag** (the real opt-in signal) instead of by membership.
- Every caller now passes its business: `announce-offer`, `broadcast`, `award-event`, `process-pending`, `push-fanout`, `push-now`, and `flush-mine`.

No database changes — the column and the per-subscription tag were already there; the fan-out just wasn't using them.

## How to verify after deploy

1. From the new (empty) business, feature an offer → your Starbucks phone should get **nothing**.
2. From Starbucks, feature an offer or award points → only the Starbucks-subscribed device gets it.

## One thing to know (web-push limitation)

A push subscription is **one per browser origin per device**, so a phone has a single subscription tagged with the **last** business it enabled notifications in. That means if the *same person on the same device/browser* is a customer of two businesses, they'll only receive pushes for whichever one they most recently turned notifications on for. This is a browser constraint, not something we can split per-business on one origin — the clean long-term answer is per-business subdomains (each its own installable app), which is already on the Atlas Engine roadmap. **Isolation is now guaranteed** either way: a device never receives another business's notifications.

## Files changed

- `lib/notifications/push-server.ts` — business scope is now required + enforced; shared `deliver()` helper
- `app/api/notifications/award-event/route.ts`
- `app/api/notifications/process-pending/route.ts`
- `app/api/notifications/push-fanout/route.ts`
- `app/api/notifications/push-now/route.ts`
- `app/api/notifications/flush-mine/route.ts`

(`announce-offer` and `broadcast` already routed through `sendPushToBusiness`, which is now scoped.)

## Ship it

Run from the repo root (the **Atlas Engine APP** folder):

```bash
git add -A
git commit -m "CP-51: scope push notifications by business_id — fix cross-tenant push leak"
git push
```
