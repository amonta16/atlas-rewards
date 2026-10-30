# Checkpoint 3 + 3.5 — Customer dashboard & Manager front-desk app

The first complete usable loop. A customer can sign up, see their points, view their QR. A manager can sign in, scan that QR, and award points by dollar amount. The whole earn-and-redeem cycle works end-to-end on top of the schema we built in CP 1.

## What got built

**Customer side (CP 3):**
- `demo.lvh.me:3000` — branded customer landing page (signup CTA)
- `demo.lvh.me:3000/signup` — create-account form, auto-enrolls into this business, fires confetti with welcome bonus
- `demo.lvh.me:3000/login` — sign-in for returning customers
- `demo.lvh.me:3000/app` — the 5-tab app shell:
  - **Home** — sticky offer banner, hero with welcome, member card, featured offer (real data from `business_memberships`)
  - **Shop** — placeholder for CP 5
  - **Scan** — branded QR card containing the member's referral code, plus a printed code below for manual entry
  - **Rewards** — the 3D credit-card-style loyalty card with logo watermark + shine, rewards grid with locked/available states, "Need more points?" earn rows
  - **Profile** — name/email/phone/joined date/tier, sign out
- **Confetti celebration** — full-screen overlay with three particle bursts when `?celebrate=N` hits the URL (welcome bonus, manager award, etc.)
- **Hero image** field added to the brand editor + database

**Manager side (CP 3.5):**
- `demo.lvh.me:3000/manage` — front-desk dashboard
  - Hero CTA: "Scan a customer to start" with Scan QR / Enter code buttons
  - Camera scanner — uses device camera to read customer QR, looks up member
  - Manual code entry — if camera fails, type the 6-char code
  - Recent activity feed of all point transactions for this business
- `/manage` → award flow:
  - Member card with name, balance, tier
  - Big amount display ($)
  - Numeric keypad (3×4 grid)
  - Auto-calculates points using `point_rules.purchase_per_dollar`
  - Confirmation screen with big checkmark + Done button
  - Awards via `award_points` RPC with idempotency key per transaction
  - Also logs to the `events` table for analytics in CP 10

## How to install (5 min)

### 1. Schema additions

In Supabase SQL Editor → New query → paste and run [`01_schema_addition.sql`](01_schema_addition.sql). This adds the `hero_image_url` column to `businesses` and creates two helper RPCs (`my_membership` and `resolve_member_by_code`).

### 2. Install new npm packages

In your terminal, inside `atlas-rewards-app/`:

```
npm install
```

This pulls in three new dependencies that landed in `package.json`:
- `react-qr-code` — renders the customer's QR
- `@yudiel/react-qr-scanner` — manager's camera-based QR reader
- `canvas-confetti` (+ types) — the confetti animation

If `npm run dev` is already running, **restart it** (Ctrl+C, then `npm run dev`) so it picks up the new dependencies.

### 3. Make yourself a business manager (one-time)

You're already an `agency_admin` (set up in CP 1), which gives you access to `/manage` for every business. But if you want to test the dedicated manager role, run in SQL Editor:

```sql
insert into public.business_users (user_id, business_id, role)
select
  (select id from auth.users where email = 'andrewmontano619@gmail.com'),
  (select id from public.businesses where slug = 'demo'),
  'business_manager';
```

## How to walk the full loop

Open three browser windows side by side for the full demo:

**Window 1 — Customer side (incognito recommended):**
1. Visit `http://demo.lvh.me:3000` → click **"Join the rewards program"**
2. Fill in name, email, phone, password → submit
3. Confetti fires with your **+100 welcome bonus** (set by `point_rules.first_visit_bonus`)
4. Click **View my rewards** → see the 3D loyalty card with 100 points
5. Tap **Scan** tab → see your branded QR code with your 6-char member code below

**Window 2 — Manager side (your normal browser, signed in as agency admin):**
1. Visit `http://demo.lvh.me:3000/manage`
2. Click **Scan QR** → grant camera permission → point at Window 1's QR code
3. Member card appears with name + 100 pts balance
4. Tap keypad to enter `42.50` → keypad shows "+42 points at 1 pt/$1"
5. Tap **Award 42 points**
6. Confirmation screen flashes: "+42 to Andrew"

**Window 1 again:**
- Refresh `/app/rewards` → balance now shows 142 points
- Your tier may have bumped up depending on `tiers` thresholds

That's the complete earn loop. The Manager's award call hit `award_points()` in Supabase, which atomically updated the membership balance, wrote to the immutable `points_ledger`, and re-calculated tier — exactly the foundation we shipped in CP 1.

## Camera permissions on localhost

Modern browsers require HTTPS for camera access **except** on `localhost`. `lvh.me` resolves to `127.0.0.1` which Chrome and Safari treat as localhost. If your browser still refuses camera permission:
- **Chrome**: chrome://settings/content/camera → allow `http://lvh.me:3000`
- **Safari**: Settings → Websites → Camera → set lvh.me to Allow
- **Firefox**: works out of the box

If the camera still won't connect, use **Enter code** instead — you can just type the 6-char member code shown below the QR.

## What's NOT in CP 3 / 3.5

- **Real-time auto-refresh** — customer has to refresh `/app/rewards` to see new points. CP 4 adds Supabase Realtime so balance updates instantly without refresh.
- **Redemption verification flow** — Rewards show "Locked / Available" but tapping doesn't redeem yet. CP 5 ships the full redemption cycle.
- **Logo / hero image direct upload** — fields accept URLs for now. CP 9 adds file upload via Supabase Storage (bucket already exists from CP 2's `storage-setup.sql`).
- **Phone OTP / social login** — sign-in is email/password only. CP 12 enables phone + Google + Apple.
- **Confetti on every manager award** — currently only fires from the welcome-bonus signup redirect. CP 4 wires a Realtime channel so the customer's app shows confetti the moment the manager hits "Award."

## Approval gate

Once you've walked the loop end-to-end (signup → confetti → see QR → manager scans → award points → balance updates), CP 3 + 3.5 are officially done. Snap a screenshot of any of the new views and we'll move to **CP 4 (points rules engine + Realtime live updates)** and **CP 5 (rewards redemption)**.
