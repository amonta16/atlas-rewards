# CP-138 · Close the anon-callable RPC holes

**SQL only. No app changes, no deploy needed.** Run `cp138_rpc_lockdown.sql` in the Supabase SQL editor. Idempotent.

## What the advisory got wrong

It reported *"236 SECURITY DEFINER functions exposed to `anon`"* and ranked `delete_my_account()` as the top risk. Both need correcting:

* **236 is one Postgres default, not 236 decisions.** `EXECUTE` on a new function is granted to `PUBLIC`, and `anon` inherits `PUBLIC`. Every `grant execute … to authenticated` we have ever written has been decorative — only an explicit `REVOKE … FROM PUBLIC` closes anything.
* **`delete_my_account()` is not exploitable.** It reads `auth.uid()` first, raises `not authenticated` when null, and every statement is scoped `where user_id = v_user`. An anonymous caller deletes nothing.

The useful question isn't how many functions `anon` can call — it's which ones **do work before checking the caller**. That list is much shorter, and much worse.

## What was actually open

| Function | What an anonymous caller could do |
|---|---|
| `inbound_webhook_award` | **Mint points** for any member at any business. No secret, no auth check in the body — the HMAC lives in the API route, but the RPC is reachable directly with the anon key, which ships in the client bundle. |
| `trigger_automated_offers` | Fire automated offers → push-notify every customer of a business, in a loop. |
| `process_dormancy`, `process_birthdays`, `finalize_due_raffles`, `recalc_tier`, `assign_business_rep` | Run background jobs on demand. |
| `diagnose_login(email)` | Enumerate accounts. |
| `effective_commission_pct` | Read our commission rate. |
| `business_analytics_rollup`, `atlas_review_funnel`, `list_bookings`, `get_business_notification_settings` | Read a business's numbers, bookings and settings knowing only a business id — which is in the page source. |

## What it does

1. **Server-only functions** → revoked from `public`, `anon` and `authenticated`; granted to `service_role`. Safe because every call site was checked first: `inbound_webhook_award` is only called by `/api/webhooks/[slug]` (service-role client, HMAC-verified), `finalize_due_raffles` only by `/api/raffles/sweep` (admin client), and the rest have **no call sites in the app at all**.
2. **Staff-only functions** → revoked from `public` and `anon`, `authenticated` kept. Their real callers are the manager and agency screens, all behind a login, so those screens are unaffected.
3. **`search_path` pinned** on every SECURITY DEFINER function that lacked one — the whole surface, not just the ten the advisory named. CP-87 was this bug in a different costume (pgcrypto living in `extensions`, not `public`). Functions that already pin one are left alone.

## Deliberately not touched

`create_business` and `delete_business` look unguarded from outside but delegate to guarded overloads (`is_agency_staff` / `is_agency_admin`). `set_member_demo` and `reset_member_account` are guarded by `is_business_manager`. A regex sweep flags all four; reading them clears all four — which is why nothing here was done by script alone.

Still anon-callable **on purpose**, because the pre-login pages need them: `resolve_business_by_slug`, `required_waiver_for_business`, `get_signup_campaign`, `get_guardian_request`, `guardian_sign_waiver`, `membership_billing_public`, `featured_offer`, `featured_raffle`, `list_active_offers`, `latest_news`, `top_rewards_public`, `list_business_events`, `list_business_specials`, `mystery_wheel_segments`, `platform_reward_terms`, `landing_waitlist_count`, `signup_identity_available`, `preview_invitation`, `join_business_by_code`. Each returns published business-public content or is token-gated.

## Still open

* `enroll_member(p_user_id, p_business_id)` doesn't check that `p_user_id` is the caller — a signed-in member could enroll someone else. Low impact, needs a body change rather than a grant change.
* 112 tables with stacked permissive RLS policies; 37 policies calling `auth.<fn>()` per row instead of `(select auth.<fn>())`. Both are batch passes, both are performance rather than exposure.
* **Leaked-password protection is a dashboard switch**, not SQL: Authentication → Providers. Turn it on — it's free.
* `citext`, `pg_net` and `btree_gist` live in `public`. Moving them is a breaking change (`citext` is a live column type), so it wants its own checkpoint.

## Verified

Applied twice on a scratch Postgres 16 against stand-in functions: correct grants after (`server-only → service_role` only; `staff-only → authenticated + service_role`, no anon), an already-pinned function left untouched, and a clean idempotent re-run.
