# CP-37 — Daily Spin / Streak / Welcome Gift / Notification Wiring

Bugs Andrew reported on May 31, 2026, bundled into one checkpoint.

## What this fixes

### 1. Daily Spin "ready" stays green after spinning

**Symptom.** Customer checks in, taps the gold "You're ready to spin!" card, spins, sees their prize. The card immediately reverts to "You're ready to spin!" — but tapping it now says "you already spun, come back tomorrow."

**Cause.** `DailySpinButton` only queried `check_in_events` ("did they check in today?"). It had no knowledge of whether the spin itself had happened. Once checked in, the button was permanently green for the rest of the day.

**Fix.** `components/customer/daily-spin-button.tsx` now also calls `mystery_reward_status` and subscribes to `mystery_reward_spins` INSERTs. Three states: `locked` (gray, "Check in to unlock"), `ready` (gold, "SPIN!"), `cooldown` (gray with live countdown to next spin). Falls back to the old behavior if `mystery_reward_status` isn't deployed.

### 2. Streak trail cells show a gift icon with no context

**Symptom.** "Instead of having just an present icon, display the content of pre-existing rewards, so people know what they are working up too."

**Fix.** `components/customer/streak-widget.tsx` — milestone cells now render the reward `label` (e.g. "Free Latte") on two clamped lines under the icon, not just the period number. Non-milestone cells are unchanged.

### 3. 20% OFF Sunday gift claim error

**Symptom.** Tapping "Claim this gift" on the 20% OFF Sunday automated offer throws a generic error toast.

**Fix.** `save_offer` RPC now returns specific messages: `offer is no longer active`, `offer expired`, `this gift is points-only — points were already added to your balance`. The frontend already maps `error.message` into the toast, so customers will see the actual reason instead of "Couldn't claim — undefined".

### 4. Welcome gift appears in Active Gifts but is blank

**Symptom.** Welcome gift shows in Saved Gifts but the row doesn't say whether it's points (no QR) or a specific reward (with QR).

**Cause.** `_fire_welcome_gifts_for_new_member` created the master offers row but never copied `discount_type`, `discount_value`, or `gift_reward_id` from the underlying `business_automated_offers` config. So `my_saved_offers` returned NULL discount fields → no badge, no reward name.

**Fix.**

- `offers` table gets `gift_reward_id`, `discount_type`, `discount_value` columns (idempotent ADD COLUMN IF NOT EXISTS).
- Trigger v3 propagates ALL of those onto the master offer row.
- If `discount_type = 'points_bonus'`, the trigger now **auto-credits the points immediately via `award_points`** and **skips** the saved-offer insert. The customer sees a `+50 welcome points!` notification, no ghost row.
- For `reward` kind, the master row carries `gift_reward_id` and `my_saved_offers` joins to `rewards` to return the reward's name. `SavedGiftsSection` renders "🎁 Free Latte" + QR.
- Backfill UPDATE at the end of the migration patches existing blank welcome rows.

### 5. Reward unlocked = no notification

**Symptom.** Customer crosses a points threshold for a reward and nothing pings — even though "Reward unlocked" is toggled ON in business settings, and the manager broadcast notifications DO arrive.

**Cause.** The reward-unlocked trigger was introduced in CP-42 but probably isn't deployed yet on Andrew's environment.

**Fix.** Migration re-applies `_notif_reward_unlocked` + the trigger idempotently. After CP-37 runs, every `business_memberships.points_balance` UPDATE that crosses any active reward's `point_cost` inserts a notifications row, which the universal push fanout routes to the customer's device.

### 6. papash2021@gmail.com login fails

**Fix.** New `public.diagnose_login(email)` RPC. Plus `cp37_diagnose_papash.sql` — a one-off SQL block to paste into the Supabase SQL editor. Output tells you exactly whether the account exists, whether email is confirmed, whether a password is set, and which sub-accounts the friend is enrolled in. Decision tree is in the comments of the file.

### 7. Manager front-desk "Send to all members" broadcast

**Fix.** `components/manager/manager-dashboard.tsx` now imports `NotificationBroadcast` and renders it inside the front-desk tab, right under `PendingMembershipsQueue`. Gated on `role === "business_manager" || role === "agency_admin"`, so front-desk staff don't see it. The underlying API + RPC are unchanged and already enforce business-scoped permissions.

## How to apply

1. Open Supabase → SQL editor.
2. Paste & run **`cp37_migration.sql`** in full.
3. (Optional) Paste & run **`cp37_diagnose_papash.sql`** to debug the friend login.
4. Code changes are already in `checkpoint-02-brand-engine/atlas-rewards-app/`. Next deploy picks them up automatically.

## Files

| File | Purpose |
| --- | --- |
| `cp37_migration.sql` | Schema + trigger + RPC fixes. Idempotent, safe to re-run. |
| `cp37_diagnose_papash.sql` | One-off SELECTs for the friend login issue. |
| `README.md` | This file. |
