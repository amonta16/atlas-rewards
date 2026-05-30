# Test push notifications on your phone

A real end-to-end test takes 5 minutes. You need a phone + a laptop (for the manager dashboard).

## Prerequisites — verify these once

1. **VAPID keys are set in Vercel** — Settings → Environment Variables → check for:
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (same value as `VAPID_PUBLIC_KEY`)
   - `VAPID_SUBJECT` (something like `mailto:hello@atlas-engine.app`)

   If any are missing, run `npm run vapid` locally and paste them into Vercel + redeploy. Without these, push never fires.

2. **CP-32 SQL migration is applied** to Supabase. That created the `push_subscriptions` table + `upsert_push_subscription` RPC.

3. **You're on a real phone**, not a desktop browser. Push is mobile-only for our use case.

---

## Step-by-step

### 1. On your phone — install the app to your home screen

**iPhone:**
1. Open **Safari** (must be Safari — not Chrome — for push on iOS)
2. Go to `https://demo.atlas-engine.app` (or any business sub-account)
3. Tap the **Share** button (square with up-arrow at the bottom)
4. Scroll down → **"Add to Home Screen"** → **"Add"**
5. Close Safari
6. Tap the new icon on your home screen — opens full-screen with no Safari chrome

**Android:**
1. Open **Chrome**
2. Go to `https://demo.atlas-engine.app`
3. After a few seconds a banner appears: **"Add to Home Screen"** → tap **Install**
4. Tap the new icon on your home screen

### 2. Sign in / sign up

Use a test email + password. After signup you land on the customer Home page.

### 3. Grant push permission

On the Home page, top-right of the hero, there's a **bell icon**. Tap it once.

- iPhone: a system prompt appears: "demo.atlas-engine.app would like to send you notifications" → tap **Allow**
- Android: same dialog → tap **Allow**

The bell badge will show 0 unread. **Permission is now granted.** You can confirm by going into iPhone Settings → Notifications → search for the business name. It should appear.

> **iPhone gotcha**: if you DENY the permission once, iOS hides the option to re-prompt. You'd have to delete the home-screen app + reinstall to ask again. Tell test users to tap **Allow** the first time.

### 4. On your laptop — send a test broadcast

1. Sign in to the agency dashboard at `https://atlas-engine.app/login`
2. Open the same business you signed up to as a customer (`demo` or whichever)
3. Go to manager dashboard → **Notifications** tab
4. Fill in:
   - **Title**: `Test push 🚀`
   - **Message**: `If you see this on your phone, push works!`
   - **Open to**: `Home`
5. Click **Send to everyone**

### 5. Watch your phone

Within **2-10 seconds**, your phone should:
- Vibrate / play notification sound (depending on phone settings)
- Show a push notification banner at the top of your screen with the business's icon + your message
- If your phone is locked, the notification shows on the lock screen

### 6. Tap the notification

The app opens to the destination you picked (`Home` in step 4). The bell shows an unread badge. Tap the bell to open the notification center — the message is there.

---

## What to do if it doesn't work

**No notification arrives after 30 seconds:**

1. **Check the broadcast response.** When you clicked "Send to everyone," the agency dashboard should have shown a green toast: "Sent to X members ✨". If it shows 0 members, your test signup didn't enroll properly. Try the customer side again.

2. **Check push subscription was registered.** In Supabase SQL editor:
   ```sql
   select * from push_subscriptions where user_id = (
     select id from auth.users where email = 'YOUR-TEST-EMAIL'
   );
   ```
   If there's no row, the push subscription never registered. Most common cause: VAPID keys missing or PWA not actually installed (Chrome tab DOESN'T count — must be home-screen install).

3. **Check Vercel logs.** Vercel → atlas-rewards project → **Logs** tab. Look for entries from `/api/notifications/broadcast` around the time you sent the broadcast. The log will say either:
   - `[push-server] VAPID keys missing` — fix VAPID env vars
   - `[push-server] send failed for ...` — push provider rejected (usually means the subscription is stale, get a fresh install)
   - `[broadcast] would push to 0 subscriptions` — no subscriptions registered (see point 2)

4. **iPhone "do not disturb"** — if your phone is in DND or Focus mode, notifications may be silenced. Check phone settings.

---

## A tip for sales demos

When pitching a business owner, do the install + bell-grant on YOUR phone before the meeting. During the meeting, ask them to do the same on theirs. Then send a broadcast from your laptop and they get the notification mid-pitch. Massively memorable demo moment. Worth practicing once before doing it live.
