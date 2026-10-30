# CP-91 — Native push actually delivers (the three stacked bugs)

**Verified:** `tsc --noEmit` = 0 errors, full `next build` green. Swift changes follow the
canonical Capacitor + Firebase recipe and compile on the Mac (Xcode is the gate there).
**Files:** 3 web (`lib/native.ts`, `lib/notifications/push-client.ts`,
`components/native/native-shell.tsx`) + 2 iOS shell (`AppDelegate.swift`, `Podfile`).

## Why `push_subscriptions` was empty

Diagnosed from the Xcode live log + a zero-row table. Three independent breaks, any one of
which was fatal:

1. **`native-shell.tsx`** resolved the business from the *subdomain* — but CP-74/81 moved
   customers to *path* routing on `app.atlas-engine.app/<slug>/app`. First hostname label =
   `"app"` = reserved → slug null → the silent token (re)registration block never ran.
2. **`push-client.ts`** (the bell-tap path that shows the permission dialog) computed
   `slug = hostname.split(".")[0]` — literally `"app"` — while ignoring the real `businessId`
   it already receives as an argument.
3. **`AppDelegate.swift`** (the killer): the stock Capacitor template omits
   `didRegisterForRemoteNotificationsWithDeviceToken` /
   `didFailToRegisterForRemoteNotificationsWithError`, so Capacitor's `registration` event
   **never fires on iOS**. Permission granted → `register()` called → token never delivered →
   no POST → no row. And even with forwarding, the raw APNs token would be rejected by FCM
   HTTP v1, which our server sends through.

## The fixes

- **New `resolveNativeBusinessSlug()`** in `lib/native.ts` — handles both subdomain
  (`<slug>.atlas-engine.app`) and path (`app.atlas-engine.app/<slug>/app/...`) routing, with
  a child-route guard so `/join`, `/j/CODE`, `/agency` etc. can't be mistaken for slugs.
  `native-shell.tsx` uses it.
- **`push-client.ts`** native branch now sends `business_id: businessId` directly — the
  subscribe route already accepted it.
- **`AppDelegate.swift`** — configures Firebase on launch, forwards the APNs token to
  `FirebaseMessaging`, exchanges it for an **FCM registration token**, and posts that to
  Capacitor's notification center (the plugin accepts a String). Failure path forwarded too.
- **`Podfile`** — adds `pod 'FirebaseMessaging'`.

## Windows (now)

```bash
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
git add checkpoint-91-native-push-fix checkpoint-02-brand-engine/atlas-rewards-app/lib checkpoint-02-brand-engine/atlas-rewards-app/components/native mobile-shell/ios
git commit -m "CP-91: native push fix — path-aware business slug, business_id subscribe, iOS APNs->FCM token exchange"
git push
```

Vercel picks up the web fixes; Android needs no rebuild for them (the web app is remote).

**Also run in Supabase SQL Editor if you haven't** (kills the every-5-min sweep error):

```sql
alter function public.finalize_due_raffles() set search_path = public, extensions;
```

## Mac (after the push)

```bash
cd ~/atlas-rewards        # your clone
git pull
cd mobile-shell
npx cap sync ios          # runs pod install → fetches FirebaseMessaging
npx cap open ios
```

Then in Xcode: just **▶ Run** to your iPhone again (capabilities are already set from last
time). If `cap sync` doesn't fetch the new pod, run `cd ios/App && pod install` manually.

## Verify (the same test that failed)

1. Open the app on the iPhone, sign into the business.
2. Supabase SQL: `select platform, business_id, created_at from push_subscriptions where platform='ios';`
   → **one row should appear within seconds of opening the app** (permission is already
   granted, so native-shell's silent re-register fires on open — no bell tap needed).
3. No row? Xcode console now shows the failure explicitly (the fail path is forwarded) —
   paste it to me.
4. Row present → award points past a reward threshold, lock the phone → buzz within ~1 min.
5. Android: rebuild once in Android Studio (google-services.json landed in CP-90), then same test.

## Still open

- Announcements don't push (only the live banner) — by design so far; small checkpoint if wanted.
- Everything from the CP-89 "queued" list (fan-out batching, /agency pagination, members
  search, magic-link cooldown).
