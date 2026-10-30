-- CP-217 · 05 grants + install the suite for every existing med spa (safe to re-run)
do $$
declare f text;
begin
  -- internal: not callable through PostgREST
  foreach f in array array[
    'wf_member_allowed(uuid, uuid)', 'wf_msg_bonus(jsonb, jsonb, uuid)', 'wf_run_ctx(public.workflow_runs, jsonb, jsonb)',
    'wf_cond_run(text, jsonb, public.workflow_runs, jsonb)', 'wf_at_target(public.workflow_runs, jsonb)',
    'wf_act_email(public.workflow_runs, jsonb, text, boolean)', 'wf_cond(text, jsonb, uuid, uuid)', 'wf_trigger_matches(jsonb, text, jsonb)',
    'wf_match_event()', 'wf_msg_block(uuid, uuid)', 'wf_act_push(public.workflow_runs, jsonb, text, boolean)',
    'wf_act_offer(public.workflow_runs, jsonb, text, boolean)', 'wf_advance_run(uuid, integer, boolean)',
    '_wf_ev_shop_checkout()', '_wf_ev_order()', '_wf_ev_visit()', '_wf_ev_content()', 'wf_fanout_content(uuid, text, jsonb)',
    'wf_evaluate_time_events()', 'wf_suite_catalog()', 'wf_suite_apply_overrides(jsonb, jsonb)', 'wf_suite_install_key(uuid, text, boolean)',
    'wf_suite_save(uuid, text, jsonb)', 'wf_suite_legacy_apply(uuid, text, boolean)', 'wf_install_medspa_suite(uuid, boolean)',
    '_wf_suite_on_business()', 'wf_suite_legacy_graph(uuid, text)', 'wf_suite_row(uuid, text)', 'wf_suite_fill(text, integer, integer)',
    '_notif_gate()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
  -- admin UI RPCs (each calls wf_assert_admin) + member tracking RPC: authenticated only
  foreach f in array array[
    'wf_suite(uuid)', 'wf_suite_toggle(uuid, text, boolean)', 'wf_suite_update(uuid, text, text, jsonb)', 'wf_suite_reset(uuid, text)',
    'wf_suite_preview_data(uuid)', 'wf_suite_install(uuid)', 'track_event(uuid, text, jsonb)',
    'wf_validate(jsonb)', 'wf_simulate(uuid, uuid, uuid)', 'wf_hub_summary(uuid)', 'wf_set_settings(uuid, jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- Install for every med spa now (Flippo's and other non-med-spa businesses are skipped by wf_install_medspa_suite).
select b.slug, public.wf_install_medspa_suite(b.id, false) as journeys from public.businesses b where b.layout_preset = 'medspa' order by b.slug;
