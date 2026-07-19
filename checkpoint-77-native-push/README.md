# CP-77 — Native Push (FCM)

Native notifications for the Android (and later iOS) app. Rides the existing pipeline end-to-end: same `push_subscriptions` table, same CP-51 business-scoped fan-out, same senders (offer announcements, broadcasts, award events). A business pushes an offer → phones get a real OS notification → tap opens that business's app at the right screen.

## How it fits (design)
- Native tokens live in `push_subscriptions` with `endpoint = 'fcm:<token>'`, `platform = 'android'|'ios'`, `p256dh/auth = NULL`. Every existing scoping query is untouched; `deliver()` just routes `fcm:` rows to FCM and the rest to web-push.
- Native tokens are **per-app, not per-origin** — so the CP-51 "one web-push sub per device" limitation disappears on mobile: one phone can hold subscriptions for several businesses, each correctly tagged.
- Permission is requested **inside a business app while signed in** (never on `/join`), so the one-shot Android 13 system dialog appears with context.
- Tap routing: FCM `data.link_path` → `onPushTap` → in-webview navigation.
- No new npm deps in the web app: FCM HTTP v1 auth is a service-account JWT signed with Node crypto (`lib/notifications/fcm-server.ts`), OAuth token cached ~1h. Missing env = native sends silently skipped (deploy-safe before Firebase exists).

## Files
- `cp77_migration.sql` — platform column, nullable web-push keys, guard constraints
- `lib/notifications/fcm-server.ts` (new) — FCM v1 sender
- `lib/notifications/push-server.ts` — deliver() splits native/web
- `app/api/notifications/subscribe/route.ts` — accepts `{ platform, token, business_slug }`
- `lib/native.ts` — `registerNativePush`, `onPushTap`
- `components/native/native-shell.tsx` — registers after sign-in on a business subdomain
- `mobile-shell/package.json` — `@capacitor/push-notifications`

## Setup (one-time, ~20 min)
1. **Firebase:** [console.firebase.google.com](https://console.firebase.google.com) → Add project ("Atlas Rewards", Analytics off is fine) → Add app → **Android** → package name `com.atlasengine.rewards` → download **`google-services.json`** → put it at `mobile-shell/android/app/google-services.json`.
2. **Server key:** Project settings → Service accounts → **Generate new private key** (downloads a JSON). In Vercel → Env vars → add `FIREBASE_SERVICE_ACCOUNT` = the file's contents (or base64 of it). Redeploy.
3. **Shell:** `cd mobile-shell && npm install && npx cap sync` → rebuild in Android Studio.
4. **SQL:** run `cp77_migration.sql` in Supabase (after cp75).

## Verify
- [ ] Open the app, sign in at a business → OS notification permission dialog appears once → accept
- [ ] `select platform, business_id from push_subscriptions;` → an `android` row tagged with that business
- [ ] Manager dashboard → broadcast → notification arrives on the phone (app closed)
- [ ] Tap it → app opens into that business at the notification's link
- [ ] Second business joined on the same phone → its broadcasts arrive too; business A's never arrive for business B (CP-51 regression check)
- [ ] Deny permission on a fresh install → app works normally, no nagging

## Notes
- Web/PWA push (VAPID) is unchanged and still works alongside.
- iOS (CP-79): same code path — add the iOS app in Firebase, upload the APNs key, `npx cap add ios`. The `apns` block in fcm-server is already in place.
