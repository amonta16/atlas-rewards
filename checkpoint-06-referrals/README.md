# Checkpoint 6 — Referral tracking

Each customer's existing 6-char member code (already used for QR + manager scan) is now also their referral code. Share link is just `demo.lvh.me:3000/signup?ref=A3F9C2`. When a new user signs up through that link, both parties auto-earn points per the business's `referral_referrer` and `referral_referee` rules.

## What got built

**Backend — `01_referrals.sql`:**
- `process_referral(referrer_code, business_id)` — called from signup. Anti-fraud guards: no self-referral, no double-referral of the same account. Awards points to both parties atomically.
- `my_referrals(business_id)` — lists referrals a customer has made (with completion status and referee name)
- Realtime broadcast on `referrals` so the referrer's app updates the moment their friend signs up

**Customer side:**
- **Signup page** captures `?ref=` query param, stashes in sessionStorage (survives page reloads), shows a green "You were invited!" banner, calls `process_referral` after enrollment. Welcome bonus + referral bonus are combined into one confetti celebration.
- **"Refer a friend" earn row** in Rewards tab is now actionable — taps open the share modal
- **Share modal** shows: how many points each party earns, the invite link with one-tap Copy, native Share API + SMS + Email tiles, and a live list of referrals the customer has made
- **"Review on Google" row** is now also actionable — opens the business's `google_review_url` in a new tab (manager later awards via Quick Award button)

## How to install (1 min)

1. Supabase SQL Editor → run [`01_referrals.sql`](01_referrals.sql).
2. Restart `npm run dev` (Ctrl+C → `npm run dev`).

## How to test

You need **two browser sessions** — one signed-in customer (your existing account), one fresh incognito window (the new friend being referred).

1. **As your existing customer** (`demo.lvh.me:3000/app/rewards`):
   - Scroll to "Need more points?" → tap **Refer a friend**
   - Modal opens. Tap **Copy** next to the invite link.
   - Or use the SMS/Email tiles to fire off a real invite if you want.

2. **Open the copied link in an incognito window** (or paste it):
   - URL looks like `http://demo.lvh.me:3000/signup?ref=A3F9C2`
   - Green "You were invited!" banner shows above the signup form
   - Fill in name, a *new* email, a password → submit
   - On `/app` you should see one confetti burst that includes both the welcome bonus AND the referee bonus

3. **Switch back to your original customer:**
   - Refresh `/app/rewards` → balance has gone up by the `referral_referrer` amount (default 500)
   - Re-open the Refer a friend modal → your new friend now appears in "Your referrals · 1 completed"

## What's NOT in CP 6

- **Delayed reward (qualifying purchase)** — MVP completes the referral the moment they sign up. Some loyalty programs wait until the referee makes their first purchase. Easy to add later by changing `process_referral` to insert with `status='signed_up'` and adding a trigger that calls a `complete_referral` function on first non-zero ledger entry.
- **Leaderboard** — Andrew has a "leaderboard" widget toggle in the schema but no UI yet. Will land in CP 9.
- **SMS auto-send** — currently relies on the device's native share sheet. Sending bulk SMS invites via Twilio is CP 12.

## Approval gate

When you complete one referral flow end-to-end (your friend signs up → you both see the bonus points appear), CP 6 is done. Next is **CP 7 — review reward flow** (verified Google reviews, screenshot upload, manager approval).
