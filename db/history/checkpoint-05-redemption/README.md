# Checkpoint 5 — Rewards redemption

The second half of the loop closes. Customer browses store → taps an affordable reward → confirms → gets a code + QR → shows to staff → manager scans/types → marks fulfilled. Points deducted, balance updates live, reward delivered.

## What got built

**Backend — `01_redemption_rpcs.sql`:**
- `redeem_reward(reward_id)` — atomic point deduction + redemption row creation, returns the unique 7-char code
- `resolve_redemption_by_code(code, business_id)` — manager lookup
- `fulfill_redemption(redemption_id)` — manager marks completed
- `my_redemptions(business_id)` — customer's redemption history
- `generate_redemption_code()` — 7-char alphanumeric, excludes 0/O/1/I to avoid front-desk typos
- Realtime enabled on `redemptions` table

**Customer side:**
- Reward cards on `/app/rewards` are now tappable when affordable — show "Tap to redeem" instead of "Available"
- `RedeemFlow` modal — 3 stages: confirm cost + final balance preview → loading → success with QR + 7-char code + Copy button
- `ActiveRedemptions` section above the rewards grid — lists pending redemptions, tap to re-open the QR/code anytime
- All Realtime-aware — when manager fulfills, the redemption disappears from active list automatically

**Manager side:**
- Smart resolver: scan ANY code → tries member lookup first (6 hex chars) → falls back to redemption lookup (7 alphanumeric)
- `RedemptionFulfillPanel` — full reward card, member name, cost, code, status banner if already fulfilled/expired
- Big "Deliver {reward}" CTA at the bottom → marks fulfilled → confirmation screen
- Single dashboard handles both flows; the cashier doesn't have to think about which mode they're in

## How to install (2 min)

### 1. SQL

Supabase SQL Editor → New query → paste and run [`01_redemption_rpcs.sql`](01_redemption_rpcs.sql).

### 2. Restart dev

No new npm packages. In your `npm run dev` terminal: Ctrl+C → `npm run dev`.

## How to walk the loop

You need enough points on your test customer first. Use the manager app to award yourself some — `demo.lvh.me:3000/manage` → scan/type your member code → Quick Award → tap Google Review +500 a couple of times to clear the 500-point reward threshold.

**Customer window:**
1. Go to `demo.lvh.me:3000/app/rewards`
2. Scroll to the Rewards store grid
3. Tap a reward that says "Tap to redeem" (e.g., "$25 off Botox" at 500 pts)
4. Confirmation modal: see the cost, your balance now, and your balance after
5. Tap **Confirm redemption**
6. Success screen pops in: QR code + 7-char code (e.g., `K7H2X8M`) + Copy button
7. Tap Done → scroll up on /app/rewards → see "Your active rewards" section with your new pending redemption

**Manager window:**
1. Go back to `demo.lvh.me:3000/manage`
2. Tap **Scan code** OR **Type code** and enter the 7-char redemption code
3. Redemption Fulfill Panel appears: shows the reward, the member, the cost, the code
4. Tap **Deliver {reward name}** → green checkmark confirmation
5. Hit Done → back to manager dashboard

**Customer window again:**
- The active redemption silently disappears from "Your active rewards" — fulfilled redemptions don't show there anymore
- Recent activity in the manager dashboard now shows the `-500` redemption entry in the ledger

## What's NOT in CP 5

- **Inventory tracking** — rewards have an `inventory` column but it's not decremented yet. Easy to add later.
- **Reward expiration enforcement** — pending redemptions show their `expires_at` date but a background job hasn't been written to auto-mark expired ones.
- **Refund / cancellation** — if a customer cancels, the code shows up as cancelled but points aren't refunded yet. Will add in CP 8 with the dormancy job (same scheduling system).
- **Reward images** — rewards still show a Gift icon fallback. Image upload + URL field comes in CP 9.

## Approval gate

Once the customer-redeems → manager-fulfills loop works end-to-end with no refreshes, CP 5 is done. Next up: **CP 6 — referral tracking**, which builds on the same member code we already use for QR (one column doing double duty).
