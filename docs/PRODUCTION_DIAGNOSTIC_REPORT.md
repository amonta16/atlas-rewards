# Atlas Rewards — Production-Readiness Diagnostic (CP-110)

**Date:** 2026-08-28  ·  **Scope:** full-system audit of the Next.js 14 (App Router) + Supabase multi-tenant loyalty platform (`checkpoint-02-brand-engine/atlas-rewards-app`) and all 141 SQL migrations.  ·  **Method:** every finding was traced through real code (route → auth → business scoping → SQL/RLS → response) and independently re-verified before any change. Nothing was fixed on assumption.

---

## 1. Overall production-readiness assessment

**The platform is well-built and largely production-ready in architecture, but the audit found a small number of *critical* multi-tenant/authorization defects that were exploitable in the field.** These were not stylistic — they allowed one signed-in user to (a) become the platform owner, (b) rewrite their own points/paid-membership status, and (c) read another business's private GoHighLevel API key. All three, plus five further authorization/data-integrity issues, are **fixed and verified** in this checkpoint.

A second tier of **confirmed but higher-risk issues** (Stripe-secret handling, streak time-zone math, monthly-membership expiry, background-job schedulers) is documented in detail with evidence and a recommended fix, but **intentionally left unchanged** because a safe correction needs a product decision, a live-database check, or an end-to-end payment test I could not perform from source alone. Guessing at those would have risked breaking working revenue and streak behavior — exactly what this audit's mandate forbids.

Verdict: **ship the CP-110 hardening now** (it only closes holes; it changes no working behavior), then schedule the documented tier-2 items. After the CP-110 migration + app deploy, the tenant-isolation posture is strong.

---

## 2. Architecture summary

| Layer | Implementation |
|---|---|
| **Frontend** | Next.js 14 App Router, React 18, Tailwind. Server Components fetch data; Client Components handle interactivity. Also wrapped as a Capacitor native app (iOS/Android) that loads the hosted site at `app.atlas-engine.app`. |
| **Backend** | Next.js Route Handlers (`app/api/**`) + Supabase. Two Supabase clients: a **user/anon** client (cookie session, subject to RLS) and a **service-role** client (`lib/supabase/admin.ts`, bypasses RLS — used only server-side). |
| **Database** | Supabase Postgres. ~45 tables, all with RLS enabled. Business logic lives in ~120 SECURITY DEFINER RPCs (award/redeem/spin/raffle/membership/team/analytics). Tenant isolation is enforced by `staffs_business()` / `manages_business()` / `is_agency_admin()` gates + RLS policies. |
| **Auth / sessions** | Supabase Auth (email+password). `middleware.ts` refreshes the session cookie (parent-domain scoped for subdomain SSO) and rewrites `{slug}.domain` → `/[business]`. Route protection is done in server components/layouts, not middleware. |
| **Tenant model** | One agency (Andrew's) → many businesses (sub-accounts). Roles: `agency_admin`, `agency_va`, `business_manager`, `business_staff` (front desk), and customers (members). Front desk signs in via a PIN keypad (bcrypt, per-business, throttled). |
| **Background jobs** | Vercel Cron → `/api/notifications/process-pending` (every min), `/api/raffles/sweep` (5 min), `/api/admin-app/daily-nudge` (16:00 & 20:00 UTC). Machine routes gated by `CRON_SECRET` (fail-closed). Some pg_cron jobs also exist (birthday/dormancy/raffle backstop). |
| **Integrations** | Stripe (agency billing + per-business membership checkout), GoHighLevel (per-business booking), Firebase FCM + web-push/VAPID (notifications), Resend (transactional email). |
| **State/caching** | Per-request React `cache()` memoization; Supabase Realtime channels for live updates; short-poll safety nets with jitter (CP-88/89). |

**Data flow, verified end-to-end** on the highest-value paths (customer check-in/award, redeem, membership join, front-desk scan, notifications): UI → client guard → route handler / RPC → **authorization gate** → **business scoping** → DB (RLS) → response → UI. The paths where a link in that chain was missing are the findings below.

---

## 3. Areas inspected

Routing & middleware; auth/session handling & the CP-84 refresh-storm fix; all 34 pages and 31 API routes; role/permission enforcement for all four roles + VA; every table's RLS; all SECURITY DEFINER RPC grants; points/ledger race safety; realtime subscription & listener cleanup; client caching and account/business-switch state; notifications & the three cron jobs + pg_cron; time-zone/streak/cooldown math; Stripe/GHL/Firebase/Resend integrations; env & secret handling; the production build, type-check, and unit tests; and destructive-migration safety across all 141 SQL files.

---

## 4. Role-based workflows tested

For each role I verified the correct landing page, direct-URL protection (server-side, not just hidden nav), permission boundaries, and session/logout behavior.

- **Agency admin** — `/agency` deck, analytics, pipeline, team, settings, admin-app, field app, per-business brand editor. All gated to `agency_admin` **except** the two pages in Finding S3/S4 (now fixed).
- **Agency VA** — same deck, no analytics/pipeline/team/settings, no delete (request-to-delete flow). Gating correct.
- **Manager** — `/[slug]/manage` desk; gated to manager/staff of that business or agency staff (layout enforces server-side). Correct.
- **Front desk** — PIN keypad at `/[slug]/frontdesk`; session scoped to one business; cannot reach another business's data (PIN verified against `business_id`). Correct.
- **Customer** — signup/login/reset, home, rewards, shop, streaks, scan, book, profile; auto-enrolled into the business on first app load. Correct, **except** customers could write their own membership row (Finding S2, now fixed).

---

## 5. Confirmed bugs found & 6. Security / permission / tenant-isolation findings

Severity: **S**=security, **D**=data-integrity, **R**=reliability, **P**=perf, **M**=mobile. Each shows: severity · role/system · evidence · root cause · resolution · verification.

### FIXED IN THIS CHECKPOINT

**S1 — CRITICAL — Privilege escalation: any signed-in user could become platform owner**
- *Role/system:* Auth · everyone. *Evidence:* `sql/checkpoint-37…/cp37_8_bootstrap_admin.sql:86` `GRANT EXECUTE … bootstrap_self_agency_admin(boolean) TO authenticated;` — the RPC is `SECURITY DEFINER`, and with `p_force=>true` skips the "an admin already exists" guard (`…:64-78`). The page `app/(agency)/agency/bootstrap-admin/page.tsx` calls it and its layout checks login only. *Repro:* sign up as a customer → `supabase.rpc('bootstrap_self_agency_admin',{p_force:true})` (no page needed) → you hold an `agency_admin` row → full access to every business, analytics, GHL keys, team, delete.
- *Root cause:* a one-time dev bootstrap tool ("safe to drop / lock down later") was never revoked.
- *Resolution:* `REVOKE EXECUTE … FROM public, anon, authenticated` (cp110); page rewritten to a server-gated no-op. Andrew is already an admin, so no operational loss.
- *Verification:* scratch-Postgres test T4 — `authenticated` call now raises `insufficient_privilege`. ✅

**S2 — CRITICAL — Customers could rewrite their own points, tier, and paid-membership status**
- *Role/system:* DB/RLS · customers. *Evidence:* `sql/checkpoint-01-foundation/02_rls.sql:119-120` — `create policy mem_self on public.business_memberships for all using (user_id = auth.uid()) with check (user_id = auth.uid());`. Never redefined in any later migration. Under Supabase's default table grants to `authenticated`, `for all` permits a direct PostgREST `PATCH /business_memberships?user_id=eq.<self>` setting `points_balance`, `tier`, `membership_payment_status`, `membership_expires_at`.
- *Root cause:* the policy should have been `FOR SELECT` (read own membership); staff writes already flow through `mem_staff_write` and enrollment/points through SECURITY DEFINER RPCs. `for all` was the defect and it silently nullifies every server-side points control (a customer can self-inflate then `redeem_reward`, or self-grant VIP).
- *Resolution:* `mem_self` changed to `FOR SELECT` (cp110). Confirmed no client code writes this table directly, so nothing legitimate breaks.
- *Verification:* negative control — on the pre-fix schema a "customer" set their balance to 999999 (test aborted there, proving the hole). Post-fix tests T1/T2/T3 pass (customer reads own row, cannot write balance or paid status) and T6 passes (staff update still works). ✅

**S3 — CRITICAL — GoHighLevel API key leaked to every customer's browser**
- *Role/system:* Booking + Home · customers. *Evidence:* `app/[business]/app/book/page.tsx:10` `.from("businesses").select("*")` → `<BookFlow business={business}>` (a Client Component that read `b.ghl_api_key`); and `app/[business]/app/page.tsx` passes the full `business` row (from `getBusinessBySlug`, also `select("*")`) into client components (points card, winback, raffle). Next serializes Client-Component props into the browser payload, so the per-business `ghl_api_key` (a private integration token) shipped to every customer.
- *Root cause:* `select("*")` on `businesses` (which stores secrets alongside branding) feeding Client Components.
- *Resolution:* null `ghl_api_key`/`webhook_secret` at the shared `getBusinessBySlug` choke-point (`lib/data/customer-app.ts`), and in `book/page.tsx` (computing `ghlOn` server-side) and `manage/page.tsx`. The GHL routes still read the real key server-side via the service-role client.
- *Verification:* production build + type-check pass; diff review confirms the key no longer reaches any Client-Component prop. ✅  *Note:* a deeper, direct-query variant of this leak remains — see **S9 (documented, not auto-fixed)**.

**S4 — HIGH — Agency brand-editor page had no role gate**
- *Evidence:* `app/(agency)/agency/businesses/[id]/page.tsx` checked login only (`if (!user) redirect("/login")`) then `select("*")` on the business and rendered it, unlike every sibling `/agency` page which re-checks the agency role. Any signed-in user could open `/agency/businesses/<id>` and read the full row (incl. `ghl_api_key`).
- *Resolution:* added an `agency_admin`/`agency_va` gate (redirect to `/agency` otherwise), matching the siblings. ✅ build-verified.

**S5 — HIGH — Member PII harvest via `resolve_member_by_code`**
- *Evidence:* `sql/checkpoint-03…/01_schema_addition.sql:35-49` — `SECURITY DEFINER`, granted to `authenticated`, **no** `staffs_business` check; returns `full_name, email, phone, points_balance` for any member given their referral code + business id. Referral codes are shared publicly by customers to refer friends; business ids are public.
- *Resolution:* added the `staffs_business(p_business_id)` gate the sibling scan RPCs use (cp110). *Verification:* T5 (non-staff caller now raises) + T6 (staff still resolves). ✅

**S6 — MEDIUM — Cross-tenant financial reads**
- *Evidence:* `sql/checkpoint-17…/02_billing_schema.sql` — `agency_billing_summary()` (:132), `list_agency_payments(int)` (:169), `my_business_billing(uuid)` (:234) are `SECURITY DEFINER`, granted `authenticated`, ungated. A customer could read the agency's MRR/payments and any business's billing by id.
- *Resolution:* `agency_billing_summary`/`list_agency_payments` gated to `is_agency_admin()`; `my_business_billing` gated to `staffs_business()` (covers managers of that business + agency staff). Callers confirmed to be agency/manager components only. ✅ parse + build verified.

**S7 — MEDIUM — Cross-tenant analytics reads**
- *Evidence:* `atlas_impact_rollup` (`cp50:197`) and `atlas_impact_monthly` (`cp32:342`) — ungated, return any business's revenue/visit/review analytics by id.
- *Resolution:* gated both to `staffs_business()` (cp110). ✅

**D1 — DATA-INTEGRITY — `reverse_last_award` (front-desk Undo) clobbered concurrent balance changes**
- *Evidence:* `sql/checkpoint-30…/cp30_migration.sql` — the undo read the reversed award's **stale** `balance_after` and wrote `points_balance = balance_after - delta` absolutely, discarding any award/redeem in the 60-second window (two front-desk stations). Also had a latent `column reference "delta" is ambiguous` (RETURNS TABLE `delta` vs `points_ledger.delta`) that throws on modern Postgres.
- *Resolution:* lock the membership row `FOR UPDATE`, refuse a second reversal of the same entry (idempotent), adjust the balance **relatively** (`greatest(0, current - delta)`), and qualify the column. Same signature/return.
- *Verification:* T7 — with an intervening redeem, buggy path gives 25 (redeem lost), fixed path gives the correct 17. T8 — double-undo of the same award is refused, balance unchanged. ✅

**A1 / A2 — MEDIUM (abuse) — Anonymous GHL endpoints unthrottled**
- *Evidence:* `app/api/ghl/book` and `app/api/ghl/slots` are anonymous (guest booking, by design) with no rate limit; each call hits the business's paid GHL API. `book` also creates a real appointment per call (calendar flooding / quota burn); `slots` is an unauthenticated amplifier + slot enumerator.
- *Resolution:* added per-IP `rateLimit()` (book 8/60s, slots 30/60s) using the existing helper. ✅ build-verified.

**M1 — MOBILE — Bottom tab bar sat under the iPhone home indicator**
- *Evidence:* `app/[business]/layout.tsx` sets `viewport-fit=cover`; `components/customer/app-shell.tsx` nav had `py-2.5` with no `env(safe-area-inset-bottom)`, so tab hit-targets fell in the home-indicator band and fought the system swipe.
- *Resolution:* `paddingBottom: calc(0.625rem + env(safe-area-inset-bottom, 0px))`. ✅

### CONFIRMED — DOCUMENTED, NOT AUTO-FIXED (need a decision, a live-DB check, or a payment test)

**S8 — HIGH — Stripe secret key shipped to the manager's browser.** `components/manager/membership-billing-setup.tsx:99` `select("*")` on `business_membership_billing` returns `stripe_secret_key`/`stripe_webhook_secret` into a Client Component and prefills them into inputs. This is the manager's own key (not cross-tenant), but it round-trips to the browser (XSS/extension exposure) and any actor who can read the row gets it. **Why not auto-fixed:** the safe fix (write-only field + a `select` that excludes the secrets + "only overwrite the key if a new one was typed") changes the save flow, and mishandling it would *erase* saved keys and break paid signups — which I cannot end-to-end test from source. **Recommended fix:** stop selecting the secret columns; load a `stripe_connected` boolean instead; render the key field as write-only (`placeholder="•••• saved"`); on save, only upsert `stripe_secret_key` when the field is non-empty. Pair with a column-level `REVOKE SELECT (stripe_secret_key, stripe_webhook_secret) … FROM authenticated` once the select is fixed.

**S9 — HIGH — `businesses` row (incl. `ghl_api_key`) is readable by a direct anon query.** `sql/checkpoint-01…/02_rls.sql:74-75` `biz_select_public … using (status='active' or staffs_business(id))` + Supabase's default table SELECT grant means anyone with the anon key can run `supabase.from('businesses').select('ghl_api_key').eq('status','active')` and harvest every active business's GHL key — independent of the app-layer fix in S3. **Why not auto-fixed:** the correct fix is a column-level `REVOKE SELECT (ghl_api_key, webhook_secret) ON businesses FROM anon, authenticated`, but ~15 server call-sites do `select('*')` on `businesses` as the user role and would then fail with "permission denied for column"; each must first be converted to an explicit column list. That is a cohesive but broad change deserving its own checkpoint and Andrew's go-ahead. **A ready migration + the call-site list is in §15.**

**C1 — HIGH — Streak period math is UTC-bucketed and breaks near the local midnight hour.** `sql/checkpoint-19-streaks/01_streaks.sql:108-116` buckets periods with `date_trunc('day'|'week', timestamptz)` in the DB session tz (UTC on Supabase); there is no business-timezone column. For a US-Pacific business the UTC day flips at ~4–5pm local, so a customer who visits Mon 4:50pm and Tue 5:10pm local straddles a UTC-day boundary and their streak **resets** despite perfect attendance (`cp99_visits_fix.sql:211-229`). **Why not auto-fixed:** correcting it requires a product decision (add a per-business timezone and bucket in it) and a change to the streak engine — the kind of established-behavior redesign this audit must not guess at.

**C2 — HIGH — With `checkins_required_per_period ≥ 2`, the streak counter is permanently stuck at 0.** In `member_checkin` (`cp99_visits_fix.sql`), the `+1` continuation is only computed on the first check-in of a new period, then unconditionally overwritten by the `current_period_checkins < required` branch (:238-244), so it never advances and milestones never fire. Only the default `required = 1` works. **Why not auto-fixed:** same class as C1 — a streak-engine logic change needing product confirmation of intended multi-check-in behavior.

**D2 — HIGH — Monthly memberships never expire after a Stripe cancel.** `app/api/[business]/membership/webhook/route.ts:172-183` — `customer.subscription.deleted` is a logging stub (`// For now just log it`), and monthly plans store `membership_expires_at = NULL`. A customer who cancels or whose card fails keeps VIP forever. **Why not auto-fixed:** needs the real downgrade handler implemented and tested against Stripe (test-clock), which I can't do from source.

**R1 — HIGH (SUSPECTED) — The queued-reminder drain has no scheduler in the repo.** The per-minute cron calls `/api/notifications/process-pending`, which pushes existing `notifications` rows — it does **not** call `fire_due_notifications()` (the `notification_queue` drain that cp109 hardened). The only scheduler for it is a **commented-out** pg_cron snippet (`cp42_checkin_available_notif.sql:152-156`). Same for `notify_expiring_redemptions`. **If** the pg_cron job was never created in the live DB, every "check-in available / spin ready" reminder and every reward-expiry warning silently never fires. **Cannot confirm from source** — needs `select jobname from cron.job;` on the live database.

**R2 — MEDIUM — `automation_queue` has a producer but no consumer.** `cp12…/01_automation_rpcs.sql:92-150` — a trigger on every `points_ledger` insert enqueues automation rows ("the edge function picks it up"), but there is no edge function, route, or cron that drains `automation_queue` anywhere in the repo. Any business that configures an automation rule believes SMS/email/push will send; nothing does, and the table grows unbounded. **Needs the missing consumer built.**

**R3 — MEDIUM — `reward_unlocked` notifications can be delivered up to 3×.** cp109's dedupe-stamp fix covered broadcasts/announcements/raffles but **not** `reward_unlocked`. Two producers are live and unstamped: the `trg_notif_reward_unlocked` DB trigger (`cp37_migration.sql:392-425`) and `/api/notifications/award-event` (which also pushes directly). A front-desk award that crosses a threshold → one direct push + two cron pushes + two bell rows. **Needs a decision on which producer is canonical** before stamping the other.

**R4 — MEDIUM — `process-pending` can double-push or silently drop.** `list_pending_pushes` has no row-claiming (no `FOR UPDATE SKIP LOCKED`), and the route marks the whole batch pushed only *after* the send loop with no `maxDuration`. A run that exceeds 60s or dies mid-batch re-pushes the whole batch next minute; a send that returns `sent=0, failed>0` is still marked pushed (silently dropped); rows older than 24h are abandoned with no failure stamp.

**R5 — MEDIUM — Raffle push regression from cp109.** cp85 schedules a pg_cron `finalize-due-raffles` that draws in the DB (where no web-push happens); cp109 now stamps `raffle_won/raffle_winner_drawn` at insert, so when the pg_cron job wins the draw the Vercel sweep sends nothing → **winner gets no push**. Also `raffle_ended` (no-entries) is still double-pushed.

**R6 — MEDIUM — `team/accept-signup` breaks past 200 users.** `app/api/team/accept-signup/route.ts` relocates an existing invited account via `listUsers({page:1,perPage:200})` then `.find()`. Beyond 200 total auth users, an existing invitee can't be found → 500, invite un-acceptable.

**P1 — MEDIUM — Notification bell subscribes to the whole `notifications` table.** `components/notifications/notification-bell.tsx:76-86` — the realtime `.on('postgres_changes', … table:'notifications')` has **no `filter:`** (the channel name is cosmetic) and reacts un-jittered with an RPC + a `POST /flush-mine` per event. Opening the center bulk-marks-read → N UPDATE events → N back-to-back RPCs. Request-storm shape on busy/multi-shop accounts. **Fix (documented):** add `filter:'user_id=eq.<uid>'` and wrap in `createJitteredHandler`, drop the per-event `flush-mine`. *(Left unfixed to avoid altering notification delivery I can't runtime-test; the patch is low-risk and recommended.)*

**Lower severity (documented, not fixed):** membership/checkout has no caller auth and an unvalidated `returnUrl` (L1); Stripe API version unpinned + no test/live-key validation + agency webhook returns 200 on DB error so Stripe won't retry (L2); per-business raw Stripe secret keys stored in DB instead of Stripe Connect (architecture, L3); `mystery_reward_pool` odds are anon-readable (L4); daily-nudge's `nudge_hours/nudge_tz` config is dead and the fixed-UTC crons drift 1h across DST (L5); most offer/raffle realtime handlers are un-jittered (P2); custom dialogs lack `role="dialog"`/focus management (A11y, L6); `subscribe` returns raw Postgres error detail to the client (L7); `get_streak_status` shows a lapsed streak until the next check-in (L8); 12h cooldown can block a legitimate next-day check-in that shifts >12h earlier (L9); birthday pg_cron misses Feb-29 in non-leap years (L10); `next.config.mjs` image `remotePatterns` wildcards all Supabase projects (L11).

---

## 7. Changes made & 8. Files changed

**SQL (one new migration, non-destructive, idempotent):**
- `checkpoint-110-production-audit/cp110_security_hardening.sql` — revoke `bootstrap_self_agency_admin` (S1); `mem_self` → `FOR SELECT` (S2); staff-gate `resolve_member_by_code` (S5); role-gate `agency_billing_summary`, `list_agency_payments`, `my_business_billing` (S6); staff-gate `atlas_impact_rollup`, `atlas_impact_monthly` (S7); rewrite `reverse_last_award` with row-lock + relative adjust + idempotency (D1).
- `checkpoint-110-production-audit/cp110_isolation_test.sql` — the 8-assertion regression suite (rolls back; safe to run on prod).

**App:**
- `lib/data/customer-app.ts` — `stripBusinessSecrets()` in `getBusinessBySlug` (S3).
- `app/[business]/app/book/page.tsx` + `components/customer/book-flow.tsx` — server-side `ghlOn`, strip secrets (S3).
- `app/[business]/manage/page.tsx` — strip secrets before `ManagerDashboard` (S3).
- `app/(agency)/agency/businesses/[id]/page.tsx` — agency role gate (S4).
- `app/(agency)/agency/bootstrap-admin/page.tsx` — server-gated no-op (S1 defense-in-depth).
- `app/api/ghl/book/route.ts`, `app/api/ghl/slots/route.ts` — rate limiting (A1/A2).
- `components/customer/app-shell.tsx` — bottom-nav safe-area inset (M1).

## 9. Why each change was necessary & 10. Expected improvement

Each fix closes a *confirmed* hole with the smallest change that resolves the root cause and preserves working behavior: S1 removes a full account-takeover path; S2 restores the entire server-side points/membership control surface (it was bypassable by a direct table write); S3/S4 stop a private third-party credential from reaching customers and unauthorized users; S5/S6/S7 stop cross-tenant PII/financial/analytics reads; D1 stops the Undo button from silently corrupting a member's balance under concurrency (and fixes a latent crash on modern Postgres); A1/A2 stop anonymous abuse of a paid third-party API; M1 makes the primary navigation reliably tappable on notched phones. None alter a working user-facing flow.

## 11. Tests added or updated

- **`cp110_isolation_test.sql`** (new) — 8 assertions: customer can read but **not** write own membership (T1–T3); `bootstrap_self_agency_admin` dead to `authenticated` (T4); `resolve_member_by_code` refuses non-staff, allows staff (T5–T6); `reverse_last_award` preserves an intervening redeem and refuses double-undo (T7–T8).
- Existing `tests/machine-secret.test.mjs` (cron-secret gate) re-run green (5/5).

## 12. Verification commands & actual results

| Check | Command | Result |
|---|---|---|
| SQL parse | `pglast.parse_sql(cp110_security_hardening.sql)` | **OK — 12 statements** |
| Negative control | isolation suite vs pre-fix schema (scratch PG16) | **Reproduced the hole** — customer set own balance to 999999 |
| Positive suite | isolation suite vs shim+migration | **✅ ALL CP-110 HARDENING TESTS PASSED (balance=17)** |
| Idempotency | re-apply migration | **OK — idempotent** |
| Type-check | `tsc --noEmit` | **0 errors** |
| Production build | `next build` (dummy Supabase env) | **✅ Compiled successfully**, all routes built |
| Unit tests | `npm test` | **pass 5 / fail 0** |
| Diff review | `diff` every changed file vs pristine snapshot | Only the intended, commented changes; no collateral edits |

*(Migrations were verified against a scratch Postgres 16 with a faithful pre-fix shim; the live database was not modified. Because this codebase has a documented history of migrations not reaching the live DB, re-run the two `select` checks at the end of the migration against production after applying — see §16.)*

## 13. Working systems intentionally left unchanged (verified correct)

CP-84 refresh-token-storm fix (intact); front-desk PIN flow (bcrypt, per-business scoped, throttled, `verify_front_desk_pin` service-role-only); `accept_invitation` (email-bound token, no replay/escalation); `safeRedirect` (no open redirect); manager `/manage` layout gate; customer app auth; `award_points`/`redeem_reward` race safety (`FOR UPDATE` + unique idempotency key, non-negative balance); raffle draw (once-only under `FOR UPDATE` + status guard, CSPRNG, idempotent refunds); **both Stripe webhooks verify HMAC over the raw body** (forged events can't grant membership); **no secret reaches the client bundle** (verified — the S3/S8 leaks are data-layer `select('*')`, not bundle imports); `.env.local` gitignored; security headers present; TypeScript build gate on; dependencies current (Next 14.2.35 includes the CVE-2025-29927 middleware fix); realtime subscriptions and listeners are consistently torn down; tenant state is clean across business/account switch (every switch is a full navigation); double-submit guards on all mutation surfaces; **CP-109 notification tenant-isolation hardening intact**.

## 14. Optional improvements not implemented

Add CSP (deferred by design); jitter the offer/raffle realtime handlers (P2); add `role="dialog"`/focus-trap to custom modals (L6); migrate per-business Stripe to Stripe Connect (L3); pin the Stripe API version and validate test-vs-live keys (L2); tighten image `remotePatterns` to the project ref (L11); resurrect the daily-nudge `nudge_hours/nudge_tz` config or accept the fixed schedule (L5); the notification-bell filter+jitter (P1, patch provided).

## 15. Remaining risks, assumptions & items requiring manual verification

**Assumptions:** all prior migrations (cp01–cp109) are actually applied on the live DB; `CRON_SECRET`, VAPID, and (optionally) Upstash env vars are set in production; the CP-109 migration has been applied.

**Must verify manually / on the live DB:**
1. **R1** — run `select jobname, schedule from cron.job;` on the live database. If `atlas-fire-due-notifs` (queue drain) and the expiry-warning job are absent, check-in/spin reminders and reward-expiry warnings are not firing — schedule them (uncomment the snippet in `cp42_checkin_available_notif.sql`) or move the drain into `process-pending`.
2. **S9** — the anon-direct `businesses.ghl_api_key` read. Recommended follow-up migration (its own checkpoint, after converting the `select('*')` call-sites listed below to explicit columns):
   ```sql
   revoke select (ghl_api_key, webhook_secret) on public.businesses from anon, authenticated;
   -- Call-sites to convert to explicit column lists first (user-role reads):
   --   app/[business]/page.tsx, /app/book/page.tsx, /manage/page.tsx, /manage/layout.tsx,
   --   /manage-manifest/route.ts, /manifest.ts, /signup/page.tsx, /frontdesk/page.tsx,
   --   lib/data/customer-app.ts, components/{manager/manager-dashboard, brand-editor/brand-editor,
   --   agency/*, team/*}.tsx, accept-invitation-client.tsx
   ```
3. **S8** — Stripe secret to the manager browser: apply the write-only pattern in §6, then column-revoke the two `business_membership_billing` secret columns.
4. **C1/C2** — decide on per-business timezone + multi-check-in streak semantics, then correct `member_checkin`.
5. **D2** — implement `customer.subscription.deleted`/`invoice.payment_failed` in the membership webhook and test with a Stripe test clock.
6. **R2/R3/R4/R5** — build the `automation_queue` consumer; canonicalize the `reward_unlocked` producer; add row-claiming + `maxDuration` to `process-pending`; reconcile the raffle pg_cron vs Vercel-cron delivery.
7. **R6** — replace the 200-user `listUsers` scan in `team/accept-signup`.

## 16. Concise manual testing checklist

1. **Apply `cp110_security_hardening.sql`** in the Supabase SQL editor. Then run the two verification `select`s at the bottom (expect `mem_self` cmd = `r`, and `bootstrap` execute = false). Optionally paste `cp110_isolation_test.sql` (it rolls back) → expect `✅ ALL CP-110 HARDENING TESTS PASSED`.
2. Deploy the app. As a **customer**, open the booking page and view source / network — confirm no `ghl_api_key` in the page payload.
3. As a **customer**, in the browser console try `supabase.from('business_memberships').update({points_balance:999999}).eq('user_id', <self>)` → expect 0 rows changed.
4. As a **non-agency** user, open `/agency/bootstrap-admin` and `/agency/businesses/<id>` → expect redirect to `/agency` / `/login`.
5. As a **front-desk** user, award points then hit **Undo** while a second station redeems → confirm the balance reflects both (no clobber).
6. On a notched iPhone, confirm the bottom tab bar clears the home indicator.
7. Run `select jobname from cron.job;` (item R1 above).
8. As an **agency admin**, confirm billing/analytics pages still load (the RPC gates allow admins).
