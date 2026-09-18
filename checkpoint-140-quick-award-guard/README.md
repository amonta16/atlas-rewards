# CP-140 · quick_award() double-tap guard

**SQL only. No app changes, no deploy needed.** `cp140_quick_award_guard.sql` is idempotent.

**Already applied to production** on 2026-09-18 as tracked migration `20260918192418_quick_award_double_tap_guard`. This checkpoint is the committed record — re-running the file is a no-op.

## The bug

`award_points()` has an idempotency short-circuit: if the passed key already exists in `points_ledger.idempotency_key`, it returns the original result instead of awarding twice. `points_ledger_idempotency_key_key` is a UNIQUE index, so the mechanism is sound.

`quick_award()` was passing a key it could never match:

```sql
'quick_award_' || p_membership_id || '_' || p_rule_key || '_' || extract(epoch from now())::text
```

`now()` is the transaction timestamp at microsecond precision, and each RPC call is its own transaction. The key was therefore unique on every call, the short-circuit never fired, and `quick_award` had **no double-award protection at all**.

The check-in flow was covered by accident — `member_checkin()`'s 12-hour cooldown runs first and gates the `quick_award('visit')` that follows it. The quick-award tiles in `award-points-panel.tsx` call `quick_award` directly with nothing in front of them, so a double-tap or a retry on flaky counter wifi would award twice.

## Why the obvious fix is wrong

Removing the timestamp gives a static key: `quick_award_<membership>_<rule>`. The unique index is **global** — not per member, not per day. So the first award inserts and every subsequent call for that member and rule early-returns forever.

Each customer would earn each rule exactly once in their lifetime at that shop. Staff would see a success message every time, because the early-return path is indistinguishable from a successful award at the call site. Across 80 businesses, silently. Worse than the bug.

## What it does

Guards on recency rather than on the key. Before awarding, `quick_award` looks for a ledger row with the same `membership_id` and `rule_type` inside the last 5 seconds. If one exists it returns that row and awards nothing.

- Uses the existing `ledger_membership_idx (membership_id, created_at DESC)` — no new index.
- True sliding window, so there is no bucket-boundary gap.
- `points_awarded` returns `0` on the deduped path so callers can tell a real award from a swallowed repeat. `new_balance` is the true current balance either way.
- The timestamped key stays. It is now just a unique ledger tag; the recency check is what enforces the invariant.

5 seconds covers a double-tap (sub-second) and a network retry (1–3s) without realistically swallowing a genuinely separate second transaction at a counter.

## Deliberately not touched

`member_checkin()` awards under `streak_milestone` and `milestone`, never `visit` — confirmed against the live `rule_type` distribution. The guard therefore cannot intercept the `quick_award('visit')` that follows a check-in.

`award_points()` itself is unchanged. Its idempotency short-circuit still works for every caller that passes a stable key, and its separate 12-hour `visit_count` rule is a different invariant (how many visits to count) from this one (don't pay twice for one tap).

## Still open

* **`mystery_bonus` — 5 same-member same-amount awards within 5s of another**, July–August, 450 points total. Goes through the wheel path (`mystery_reward_spins`), not `quick_award`, so this fix does not touch it. Could be legitimate (milestone spin landing with a daily spin) or the same class of bug. Unverified.
* **`redemption` — 2 pairs** within 5s on 2026-06-02, −6,400 points. Same caveat, different path.
* A client-supplied idempotency key (UUID per button press, passed into `quick_award`) would survive network retries beyond the 5s window. Needs a signature change and every call site updated; deferred.

## Verified

Applied to production and re-read from `pg_proc`: `SECURITY DEFINER` intact, `search_path=public` intact, owner `postgres` unchanged, and all EXECUTE grants preserved (`anon`, `authenticated`, `service_role`) — `CREATE OR REPLACE` does not reset an ACL.

Historical scan of `points_ledger` for same-member, same-rule, same-amount awards inside 5 seconds found **zero** on `visit` or `purchase`, so nothing needs backing out. This is preventive.
