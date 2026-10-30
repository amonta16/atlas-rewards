-- CP-216 · Automation Hub · 08 security hardening (from get_advisors after 01–07)
-- APPLIED to production Oct 23 2026 (migration cp216_08_hardening). Safe to re-run.
--
--  1. Pure SQL helpers get a fixed search_path (advisor: function_search_path_mutable).
--  2. Internal engine / trigger / cron functions are not callable through PostgREST by anon or authenticated:
--     EXECUTE revoked from PUBLIC, anon, authenticated (advisor: *_security_definer_function_executable).
--     Trigger firing and pg_cron (postgres role) are unaffected — EXECUTE is only checked at CREATE TRIGGER time.
--  3. Client-facing RPCs stay callable by `authenticated` only (every one of them calls wf_assert_admin()).
--     anon gets nothing.
--  4. search_members(uuid, text, integer) loses its p_limit DEFAULT: a pre-existing staff-desk RPC
--     search_members(uuid, text) exists, and with the default both overloads matched a 2-argument
--     PostgREST call ("could not choose the best candidate function"). Postgres can't remove a default with
--     CREATE OR REPLACE and DROP needs an interactive confirmation in this runner, so the defaulted function is
--     renamed to _search_members_hub_v0 (kept, EXECUTE revoked from everyone) and search_members(uuid,text,integer)
--     is recreated without the default. The Hub UI must always pass p_limit (e.g. 20).

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'search_members'
                and pg_get_function_identity_arguments(p.oid) = 'p_business_id uuid, p_q text, p_limit integer'
                and p.pronargdefaults > 0) then
    alter function public.search_members(uuid, text, integer) rename to _search_members_hub_v0;
    revoke execute on function public._search_members_hub_v0(uuid, text, integer) from public, anon, authenticated;
  end if;
end $$;

-- recreated without DEFAULT (body unchanged)
create or replace function public.search_members(p_business_id uuid, p_q text, p_limit integer)
returns table(membership_id uuid, user_id uuid, full_name text, email text, phone text, is_demo boolean)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  perform public.wf_assert_admin();
  return query
  select m.id, m.user_id, coalesce(p.full_name, 'Member'), p.email::text, p.phone, coalesce(m.is_demo, false)
    from public.business_memberships m left join public.profiles p on p.id = m.user_id
   where m.business_id = p_business_id and m.status <> 'blocked'
     and (nullif(btrim(p_q), '') is null or p.full_name ilike '%' || btrim(p_q) || '%' or p.email::text ilike '%' || btrim(p_q) || '%')
   order by coalesce(m.is_demo, false) desc, p.full_name nulls last limit greatest(1, least(coalesce(p_limit, 20), 100));
end $$;

do $$
declare f text;
begin
  -- 1. search_path on pure helpers
  foreach f in array array[
    'wf_graph_node(jsonb, text)', 'wf_trigger_node(jsonb)', 'wf_node_cfg(jsonb, text)', 'wf_next_node(jsonb, text, text)',
    'wf_random_next(jsonb, text)', 'wf_trigger_matches(jsonb, text, jsonb)', 'wf_tn(text, text, text, integer, integer, jsonb)',
    'wf_te(text, text, text)', 'wf_winback_graph(integer, text, text)', 'wf_template_catalog()'] loop
    execute format('alter function public.%s set search_path = public', f);
  end loop;

  -- 2. internal: engine, adapters, emitters, cron entry points, trigger functions
  foreach f in array array[
    'wf_graph_node(jsonb, text)', 'wf_trigger_node(jsonb)', 'wf_node_cfg(jsonb, text)', 'wf_next_node(jsonb, text, text)',
    'wf_random_next(jsonb, text)', 'wf_trigger_matches(jsonb, text, jsonb)', 'wf_tn(text, text, text, integer, integer, jsonb)',
    'wf_te(text, text, text)', 'wf_winback_graph(integer, text, text)', 'wf_template(text, uuid)',
    'wf_engine_on()', 'wf_assert_admin()', 'wf_render(text, uuid, uuid, jsonb)', 'wf_cond(text, jsonb, uuid, uuid)',
    'wf_log_step(uuid, text, text, text, jsonb)', 'wf_open_run(uuid, uuid, bigint, text)', 'wf_match_event()',
    'wf_msg_block(uuid, uuid)', 'wf_quiet_until(uuid)',
    'wf_act_push(public.workflow_runs, jsonb, text, boolean)', 'wf_act_points(public.workflow_runs, jsonb)',
    'wf_act_unlock(public.workflow_runs, jsonb, text, boolean)', 'wf_act_offer(public.workflow_runs, jsonb, text, boolean)',
    'wf_act_tag(public.workflow_runs, jsonb)', 'wf_act_notify_admin(public.workflow_runs, jsonb, boolean)',
    'wf_act_enroll(public.workflow_runs, jsonb)', 'wf_advance_run(uuid, integer, boolean)', 'wf_tick(integer)',
    'wf_emit(uuid, uuid, text, jsonb, text)', 'wf_evaluate_time_events()',
    '_wf_ev_membership()', '_wf_ev_checkin()', '_wf_ev_points()', '_wf_ev_purchase()', '_wf_ev_order()', '_wf_ev_redemption()',
    '_wf_ev_streak_gift()', '_wf_ev_booking()', '_wf_ev_review()', '_wf_ev_referral()', '_wf_ev_treatment()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;

  -- 3. client RPCs: authenticated only
  foreach f in array array[
    'wf_hub_summary(uuid)', 'wf_legacy_automations(uuid)', 'wf_list(uuid)', 'wf_get(uuid)', 'wf_validate(jsonb)',
    'wf_save_draft(uuid, uuid, text, text, jsonb, text)', 'wf_publish(uuid, uuid, text)', 'wf_set_status(uuid, text)',
    'wf_rollback(uuid, uuid)', 'wf_simulate(uuid, uuid, uuid)', 'wf_node_metrics(uuid, integer)', 'wf_member_path(uuid, uuid)',
    'wf_runs(uuid, text, integer)', 'wf_set_settings(uuid, jsonb)', 'wf_load_template(uuid, text)', 'wf_template_catalog()',
    'wf_members(uuid, text, integer)', 'wf_rewards(uuid)', 'wf_messages(uuid, integer)', 'wf_set_engine(boolean)',
    'search_members(uuid, text, integer)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

