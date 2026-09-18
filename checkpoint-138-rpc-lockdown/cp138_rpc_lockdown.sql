-- =====================================================================
-- CP-138 — Close the anon-callable RPC holes
-- Idempotent; safe to re-run. No function BODIES are rewritten.
-- =====================================================================
-- Why this exists
-- ---------------------------------------------------------------------
-- The weekly advisory reported "236 SECURITY DEFINER functions exposed to
-- anon". That number is one Postgres default, not 236 decisions: EXECUTE on
-- a new function is granted to PUBLIC, and `anon` inherits PUBLIC. So every
-- `grant execute ... to authenticated` in our checkpoints has been
-- decorative — only an explicit REVOKE from PUBLIC closes anything.
--
-- The advisory's headline finding, delete_my_account(), is NOT exploitable:
-- it reads auth.uid() first, raises 'not authenticated' when null, and every
-- statement in it is scoped `where user_id = v_user`. Left alone.
--
-- What actually mattered, found by checking which SECURITY DEFINER functions
-- do work BEFORE checking the caller, then cross-referencing every call site
-- in the app so nothing here can break a real code path:
--
--   · inbound_webhook_award() — awards points to any member at any business.
--     No secret, no auth check in the body. The /api/webhooks/[slug] route
--     does verify an HMAC, but the RPC is reachable directly with the anon
--     key, which ships in the client bundle. Free points minting.
--   · trigger_automated_offers() — fires automated offers → push to every
--     customer of a business. Anyone could have run it in a loop.
--   · process_dormancy, process_birthdays, finalize_due_raffles, recalc_tier,
--     assign_business_rep — background jobs, callable by strangers.
--   · diagnose_login(email) — account enumeration.
--   · effective_commission_pct(business) — our commission, to anyone.
--   · business_analytics_rollup / atlas_review_funnel / list_bookings /
--     get_business_notification_settings — a business's numbers, bookings
--     and settings, to anyone who knows a business id (which is in the page).
--
-- Deliberately NOT touched: create_business and delete_business look
-- unguarded from the outside but delegate to guarded overloads
-- (is_agency_staff / is_agency_admin). set_member_demo and
-- reset_member_account are guarded by is_business_manager. A regex sweep
-- flags all four; reading them clears all four.
-- =====================================================================

-- ── 1. Server-only. No caller anywhere in the app runs these as a user ──
-- Verified against every .ts/.tsx call site:
--   inbound_webhook_award  → app/api/webhooks/[slug]/route.ts (service role)
--   finalize_due_raffles   → app/api/raffles/sweep/route.ts   (admin client)
--   the rest              → no call sites at all (cron / manual)
do $$
declare
  r record;
  fn text;
  fns text[] := array[
    'inbound_webhook_award', 'trigger_automated_offers', 'process_dormancy',
    'process_birthdays', 'finalize_due_raffles', 'recalc_tier',
    'assign_business_rep', 'diagnose_login', 'effective_commission_pct'
  ];
begin
  foreach fn in array fns loop
    for r in
      select p.oid::regprocedure as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = fn
    loop
      execute format('revoke all on function %s from public, anon, authenticated', r.sig);
      if exists (select 1 from pg_roles where rolname = 'service_role') then
        execute format('grant execute on function %s to service_role', r.sig);
      end if;
      raise notice 'server-only: %', r.sig;
    end loop;
  end loop;
end $$;

-- ── 2. Signed-in staff only. Keep `authenticated`, drop anonymous ────────
-- These DO have real call sites, all of them inside manager or agency
-- screens behind a login:
--   business_analytics_rollup, atlas_review_funnel → insights-dashboard.tsx
--   list_bookings                                  → bookings-list.tsx
--   get_business_notification_settings             → notification-settings-panel.tsx
--   set_admin_app_config, set_admin_nudges         → admin-app-client.tsx
-- Revoking anon costs those screens nothing and stops a stranger reading a
-- business's numbers with nothing but a business id.
do $$
declare
  r record;
  fn text;
  fns text[] := array[
    'business_analytics_rollup', 'atlas_review_funnel', 'list_bookings',
    'get_business_notification_settings', 'set_admin_app_config', 'set_admin_nudges'
  ];
begin
  foreach fn in array fns loop
    for r in
      select p.oid::regprocedure as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = fn
    loop
      execute format('revoke all on function %s from public, anon', r.sig);
      execute format('grant execute on function %s to authenticated', r.sig);
      if exists (select 1 from pg_roles where rolname = 'service_role') then
        execute format('grant execute on function %s to service_role', r.sig);
      end if;
      raise notice 'staff-only: %', r.sig;
    end loop;
  end loop;
end $$;

-- ── 3. Pin search_path on every SECURITY DEFINER function ───────────────
-- A definer function with a mutable search_path can be aimed at an
-- attacker-controlled schema. CP-87 was exactly this bug wearing a
-- different hat (pgcrypto living in `extensions`, not `public`), so this
-- sweeps the whole surface rather than the ten the advisory happened to
-- name. Functions that already pin one are left alone.
do $$
declare r record; n int := 0;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prosecdef
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
          where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, extensions', r.sig);
    n := n + 1;
  end loop;
  raise notice 'search_path pinned on % function(s)', n;
end $$;

-- ── 4. What is left, on purpose ──────────────────────────────────────────
-- Still anon-callable because the public pages genuinely need them before
-- anyone signs in — the join screen, the promo QR landing, the waiver link:
--   resolve_business_by_slug, required_waiver_for_business, get_signup_campaign,
--   get_guardian_request, guardian_sign_waiver, membership_billing_public,
--   featured_offer, featured_raffle, list_active_offers, latest_news,
--   top_rewards_public, list_business_events, list_business_specials,
--   mystery_wheel_segments, platform_reward_terms, landing_waitlist_count,
--   signup_identity_available, preview_invitation, join_business_by_code.
-- Each of those returns published, business-public content or is gated by a
-- token. They are the ones to re-read first if this list is ever revisited.
--
-- Also still open, deliberately out of scope here because fixing them means
-- rewriting function bodies rather than grants:
--   · enroll_member(p_user_id, p_business_id) does not check that p_user_id
--     is the caller. A signed-in member could enroll someone else. Low
--     impact, wants a body change.
--   · The 112 tables with stacked permissive RLS policies, and the 37
--     policies calling auth.<fn>() per row instead of (select auth.<fn>()).
--
-- And one thing SQL cannot do: leaked-password protection is a switch in
-- Authentication → Providers in the Supabase dashboard. Turn it on.
