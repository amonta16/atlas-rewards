# Checkpoint 4 — Realtime + Rules Engine

The "magic moment" checkpoint. Manager taps Award → customer's phone instantly animates the new balance and fires confetti, no refresh needed. Plus quick-award buttons for non-purchase point rules (Review, Referral, Birthday, Check-in, Social Follow, Profile Complete).

## What got built

**Backend — `01_enable_realtime.sql`:**
- Enables Supabase Realtime broadcasting on `business_memberships` and `points_ledger`
- Sets `REPLICA IDENTITY FULL` so UPDATE events carry full row data
- New RPC `quick_award(membership_id, rule_key, notes)` — awards the business's configured value for any built-in rule (review, visit, birthday, etc.)

**Customer side:**
- New hook `useRealtimeMembership` (lib/hooks) — subscribes to a customer's own membership + ledger
- New component `LiveMemberCard` — Home tab's white card with animated count-up
- `RewardsClient` 3D card — points number now animates from old → new (~900ms easeOutCubic)
- `CelebrateWatcher` — extends to listen to ledger inserts. The moment a positive entry hits the customer's ledger, the full-screen confetti fires anywhere in the app (any tab)

**Manager side:**
- `AwardPointsPanel` rebuilt as a two-mode flow:
  - **Menu mode (default):** purchase amount option + 6 quick-award buttons (Review, Visit, Referral, Birthday, Social Follow, Profile Complete) showing each rule's configured point value
  - **Purchase mode:** the $ keypad we shipped in CP 3.5
- Quick-award uses the new `quick_award()` RPC — atomic, idempotent, RLS-enforced

## How to install (2 min)

### 1. Schema

Supabase SQL Editor → New query → paste and run [`01_enable_realtime.sql`](01_enable_realtime.sql).

You should see "Success" messages for the publication ALTERs and the function CREATE.

### 2. Restart dev

No new npm packages needed (Supabase Realtime is built into `@supabase/supabase-js` which we already have). In your `npm run dev` terminal:

- Press **Ctrl + C** to stop
- Run `npm run dev` again

### 3. Walk the magic loop

Open three windows:

**Window 1 — Customer (incognito):** sign in as your test customer at `http://demo.lvh.me:3000/login`. Stay on the Home tab.

**Window 2 — Customer same account, second tab:** open `http://demo.lvh.me:3000/app/rewards`. (You'll watch the 3D card update here.)

**Window 3 — Manager (your normal browser):** `http://demo.lvh.me:3000/manage`. Scan the customer's QR OR enter their code.

**Award flow now:**
1. In the manager window, you'll see a menu: "Purchase amount" at top, then a 2-column grid of quick-award buttons (Google Review +500, Visit +50, Referral +500, Birthday +250, Social Follow +50, Profile Complete +100).
2. Tap **Google Review +500**.
3. **Immediately** switch eyes to Window 1 — confetti bursts, the number on the Home tab member card animates up by 500.
4. Confetti dismiss → routes to /app/rewards → the 3D credit-card-style points number animates again.

No refreshes anywhere. This is the Patient App moment.

## What's behind the magic

The customer app subscribes to Supabase Realtime channels filtered to **their own rows** (`filter: id=eq.<their_membership_id>`). RLS still applies on top — even if a customer tried to listen to someone else's ID, the database would filter the event out. So security and live updates work together.

When the manager calls `award_points` or `quick_award`, those functions:
1. UPDATE the `business_memberships` row (broadcasts a postgres_changes event)
2. INSERT into `points_ledger` (broadcasts another event)

The customer's app receives both:
- The UPDATE → LiveMemberCard re-renders with new balance, animation kicks in
- The ledger INSERT with positive delta → CelebrateWatcher fires confetti

## What's NOT in CP 4 (intentionally)

- **Custom rule creation** (agency defines new rules beyond the 9 built-ins) — moves to CP 9 when we build the full widget builder
- **Rewards redemption** — that's CP 5, next up
- **Trigger automation rules** (e.g. "1000 points reached → unlock VIP reward") — that's the second half of CP 4 we deferred; the `automation_rules` table is already in place, just no UI yet

## Approval gate

Once you've seen the customer's phone update live + confetti fire on a manager award, CP 4 is done. Ping me and we kick off **CP 5 (rewards redemption with verification QR codes — the second half of the loop)**.
