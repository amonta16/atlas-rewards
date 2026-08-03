# CP-97 — Android push fixed: native app stays on one origin

**Verified:** `tsc --noEmit` = 0 errors, full `next build` green.
**Files:** 2 web (`app/join/page.tsx`, `components/customer/my-shops.tsx`). Deploys via
Vercel — reaches installed apps with **no rebuild**.

## The bug (found via chrome://inspect on Andrew's Motorola)

`"PushNotifications" plugin is not implemented on android` — thrown the moment the app
sits on a business **subdomain** (starbucks.atlas-engine.app). On Android, Capacitor only
injects its plugin bridge into pages served from the configured server origin
(`www.atlas-engine.app`). Every hop to a subdomain silently killed ALL plugins:

- no notification permission prompt / bell spotlight (app read "unsupported" → skipped)
- **no push registration at all on Android** (push_subscriptions never written)
- Preferences writes no-oping off-origin (CP-76.1 had already worked around this)

iOS injects the bridge into every page, which is why iPhones worked all along.

## The fix

Inside the native shell the app now **never leaves www** — it uses path routing
(`www.atlas-engine.app/<slug>/…`), which the app has supported since CP-74:

- `app/join/page.tsx` — all five boot/join navigations go through a new
  `businessEntryUrl()`: native → `/<slug>` (same origin), web → `/qr/<slug>` →
  subdomain, unchanged.
- `my-shops.tsx` — switching shops in the native app goes to
  `https://www.<root>/<slug>/app`. This also **rescues devices currently stranded on a
  subdomain**: one shop-switch or cold start brings them home. Web keeps subdomains.

CP-91's `resolveNativeBusinessSlug()` already understands path routing, and the CP-81
parent-domain auth cookie is valid on www — so recording, push business-tagging, and
sessions all just work.

## Ship it

```bash
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
git add checkpoint-97-native-single-origin checkpoint-02-brand-engine/atlas-rewards-app/app/join/page.tsx checkpoint-02-brand-engine/atlas-rewards-app/components/customer/my-shops.tsx
git commit -m "CP-97: native shell stays on www via path routing — fixes Android plugin bridge (push registration + permission prompt)"
git push
```

## Verify (on the Motorola, after Vercel deploys)

1. `adb shell pm clear com.atlasengine.rewards` (full-path adb as before), reopen the app.
2. Join/sign in → note the URL if inspecting: should be `www.atlas-engine.app/<slug>/app`.
3. Home tab → bell spotlight appears → tap the bell → **Android 13 permission dialog**.
4. Allow → in chrome://inspect console you should see the `[subscribe] saved native token`
   log; `push_subscriptions` gains an `android` row in Supabase.
5. Trigger a push (staff announcement / points award) → Android notification arrives.
6. iPhone regression check: force-quit + reopen the iOS app → boots into the business as
   before (now on the www path URL) — pushes still arrive.

## Note

`/qr/<slug>` and the whole subdomain experience are untouched for real web browsers —
printed QR posters, PWA users, and marketing links behave exactly as before.
