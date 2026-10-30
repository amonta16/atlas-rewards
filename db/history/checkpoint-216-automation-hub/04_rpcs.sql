-- CP-216 · Automation Hub · 04 RPCs the admin UI calls (all agency-admin only)
-- APPLIED to production Oct 23 2026 (migration cp216_04_rpcs). Safe to re-run.

create or replace function public.wf_assert_admin() returns void language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.is_agency_admin() then raise exception 'automation hub: agency admins only' using errcode = '42501'; end if;
end $$;

-- ───────────── summary strip ─────────────
create or replace function public.wf_hub_summary(p_business_id uuid)
returns table (active_workflows int, enrolled_30d int, push_sent_30d int, push_delivered_30d int, email_sent_30d int, conversions_30d int, return_visits_after_msg_30d int, engine_enabled boolean, settings jsonb)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  perform public.wf_assert_admin();
  return query
  select
    (select count(*)::int from public.workflows w where w.business_id = p_business_id and w.status = 'active'),
    (select count(distinct r.membership_id)::int from public.workflow_runs r where r.business_id = p_business_id and r.entered_at > now() - interval '30 days'),
    (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.source = 'workflow' and n.created_at > now() - interval '30 days'),
    (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.source = 'workflow' and n.push_sent_at is not null and n.created_at > now() - interval '30 days'),
    (select count(*)::int from public.workflow_run_steps st join public.workflow_runs r on r.id = st.run_id where r.business_id = p_business_id and st.node_type = 'a.email' and st.result = 'ok' and st.at > now() - interval '30 days'),
    (select count(*)::int from public.workflow_runs r where r.business_id = p_business_id and r.exit_reason = 'converted' and r.exited_at > now() - interval '30 days'),
    (select count(distinct n.user_id)::int from public.notifications n
       join public.business_memberships m on m.user_id = n.user_id and m.business_id = n.business_id
       join public.customer_events e on e.membership_id = m.id and e.type = 'checkin.recorded' and e.occurred_at > n.created_at and e.occurred_at < n.created_at + interval '7 days'
      where n.business_id = p_business_id and n.source = 'workflow' and n.created_at > now() - interval '30 days'),
    (public.wf_engine_on() and coalesce((select s.enabled from public.business_automation_settings s where s.business_id = p_business_id), false)),
    coalesce((select to_jsonb(s) - 'business_id' from public.business_automation_settings s where s.business_id = p_business_id),
             jsonb_build_object('enabled', false, 'quiet_start', '10:00:00', 'quiet_end', '20:00:00', 'max_msgs_per_member_per_week', 3, 'test_membership_ids', '[]'::jsonb))
    || jsonb_build_object('engine_global', public.wf_engine_on());
end $$;

-- ───────────── the existing (legacy) automations, with live counts ─────────────
create or replace function public.wf_legacy_automations(p_business_id uuid)
returns table (key text, name text, kind text, trigger_text text, action_text text, channel text, enabled boolean, sent_30d int, last_fired_at timestamptz, controlled_by text)
language plpgsql stable security definer set search_path to 'public' as $$
declare s record; b record; v_streaks boolean; v_spin boolean;
begin
  perform public.wf_assert_admin();
  select * into s from public.business_notification_settings where business_id = p_business_id;
  select * into b from public.businesses where id = p_business_id;
  select coalesce(is_enabled,false) into v_streaks from public.streak_config where business_id = p_business_id;
  select coalesce(is_enabled,false) into v_spin from public.business_mystery_config where business_id = p_business_id;

  return query
  -- automated offers (per template config)
  select 'offer:' || t.slug, coalesce(c.custom_title, t.emoji || ' ' || t.name),
         case t.trigger_type when 'signup' then 'trigger' else 'cron' end,
         case t.trigger_type when 'signup' then 'Member enrols' when 'birthday' then 'Member''s birthday (hourly job)' when 'anniversary' then 'Signup anniversary (hourly job)'
                             when 'inactivity' then 'No visit in ' || coalesce((t.trigger_config->>'days')::text, '14') || ' days (hourly job)' else 'Date window (daily job)' end,
         case coalesce(c.discount_type,'none') when 'points_bonus' then '+' || coalesce(c.discount_value,0) || ' points' when 'reward' then 'Gift: ' || coalesce(rw.name,'reward') else 'Offer + notification' end,
         'push', coalesce(c.is_active,false),
         (select count(*)::int from public.customer_saved_offers so join public.offers o on o.id = so.offer_id where o.welcome_config_id = c.id and so.saved_at > now() - interval '30 days')
           + case when t.trigger_type = 'date' then (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'customer_offer' and n.created_at > now() - interval '30 days' and c.last_triggered_at > now() - interval '30 days') else 0 end,
         coalesce(c.last_triggered_at, (select max(so.saved_at) from public.customer_saved_offers so join public.offers o on o.id = so.offer_id where o.welcome_config_id = c.id)),
         'Offers → Automated'
    from public.automated_offer_templates t
    left join public.business_automated_offers c on c.template_id = t.id and c.business_id = p_business_id
    left join public.rewards rw on rw.id = c.gift_reward_id
   where c.id is not null or t.trigger_type <> 'date'
  union all
  select 'sys:birthday_points', '🎂 Birthday points', 'cron', 'Member''s birthday (hourly job)', '+' || coalesce((b.point_rules->>'birthday')::int, 0) || ' points + push', 'push',
         coalesce(s.birthday, true) and coalesce((b.point_rules->>'birthday')::int, 0) > 0,
         (select count(*)::int from public.points_ledger l where l.business_id = p_business_id and l.rule_type = 'birthday' and l.created_at > now() - interval '30 days'),
         (select max(l.created_at) from public.points_ledger l where l.business_id = p_business_id and l.rule_type = 'birthday'), 'Settings → Notifications · Birthday'
  union all
  select 'sys:reward_unlocked', '🎁 Reward unlocked', 'trigger', 'Balance crosses a reward''s cost', 'Push: "you unlocked …"', 'push', coalesce(s.reward_unlocked, true),
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'reward_unlocked' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'reward_unlocked'), 'Settings → Notifications'
  union all
  select 'sys:daily_check', '✅ Check-in confirmation', 'trigger', 'First check-in of the day', 'Bell: streak / spin status', 'in-app', v_streaks or v_spin,
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'daily_check' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'daily_check'), 'Streaks / Spin settings'
  union all
  select 'sys:check_in_available', '⏰ Check-in available again', 'trigger', '12 h after a check-in (lands 10–20 h local)', 'Push reminder', 'push', coalesce(s.check_in_available, true) and (v_streaks or v_spin),
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'check_in_available' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'check_in_available'), 'Settings → Notifications'
  union all
  select 'sys:streak', '🔥 Streak reminders & milestones', 'trigger', 'Streak events', 'Push', 'push', coalesce(s.streak_reminders, true) and v_streaks,
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'streak' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'streak'), 'Streaks'
  union all
  select 'sys:review_request', '⭐ Review request', 'trigger', 'Reward fulfilled, no review yet, none asked in 14 d', 'Push: leave a Google review', 'push', coalesce(s.review_request, true) and coalesce((b.widget_config->>'reviews')::boolean, false),
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'review_request' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'review_request'), 'Settings → Notifications'
  union all
  select 'sys:review_verified', '✔ Review verified', 'trigger', 'Desk verifies a review', 'Push: points added', 'push', coalesce((b.widget_config->>'reviews')::boolean, false),
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'review' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'review'), 'Desk → Reviews'
  union all
  select 'sys:expiring', '⌛ Gift expiring', 'cron', 'Gift / redemption expires in < 48 h (hourly job)', 'Push reminder', 'push', coalesce(s.gift_expiration_reminders, true),
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'reward_expiration' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'reward_expiration'), 'Settings → Notifications'
  union all
  select 'sys:referral', '👥 Referral payout', 'trigger', 'Referred friend''s first qualifying purchase', 'Points to both members', 'points', coalesce((b.widget_config->>'referrals')::boolean, false),
         (select count(*)::int from public.points_ledger l where l.business_id = p_business_id and l.rule_type = 'referral_referrer' and l.created_at > now() - interval '30 days'),
         (select max(l.created_at) from public.points_ledger l where l.business_id = p_business_id and l.rule_type = 'referral_referrer'), 'Settings → Features'
  union all
  select 'sys:winback_manual', '💌 Win-back (desk)', 'route', 'Staff sends from Insights', 'Home banner + push + bonus', 'push', coalesce(s.we_miss_you, true),
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'we_miss_you' and n.source is distinct from 'workflow' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'we_miss_you' and n.source is distinct from 'workflow'), 'Insights → member'
  union all
  select 'sys:dormancy', '😴 Dormancy flag', 'cron', 'No visit in 60 days (daily job)', 'Member status → dormant (no message)', 'status', true,
         (select count(*)::int from public.business_memberships m where m.business_id = p_business_id and m.status = 'dormant' and m.updated_at > now() - interval '30 days'),
         (select max(m.updated_at) from public.business_memberships m where m.business_id = p_business_id and m.status = 'dormant'), 'always on';
end $$;

-- ───────────── workflows ─────────────
create or replace function public.wf_list(p_business_id uuid)
returns table (id uuid, name text, family text, status text, version int, template_key text, updated_at timestamptz, enrolled_total int, running_now int, sent_30d int, converted_30d int, last_error text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  perform public.wf_assert_admin();
  return query
  select w.id, w.name, w.family, w.status, coalesce(v.version, (select max(v2.version) from public.workflow_versions v2 where v2.workflow_id = w.id), 0), w.template_key, w.updated_at,
         (select count(*)::int from public.workflow_runs r where r.workflow_id = w.id),
         (select count(*)::int from public.workflow_runs r where r.workflow_id = w.id and r.status in ('running','waiting')),
         (select count(*)::int from public.notifications n where n.business_id = w.business_id and n.source = 'workflow' and n.workflow_run_id in (select r.id from public.workflow_runs r where r.workflow_id = w.id) and n.created_at > now() - interval '30 days'),
         (select count(*)::int from public.workflow_runs r where r.workflow_id = w.id and r.exit_reason = 'converted' and r.exited_at > now() - interval '30 days'),
         (select r.last_error from public.workflow_runs r where r.workflow_id = w.id and r.status = 'error' order by r.exited_at desc nulls last limit 1)
    from public.workflows w left join public.workflow_versions v on v.id = w.current_version_id
   where w.business_id = p_business_id and w.status <> 'archived'
   order by case w.status when 'active' then 0 when 'testing' then 1 when 'paused' then 2 when 'error' then 3 else 4 end, w.updated_at desc;
end $$;

create or replace function public.wf_get(p_workflow_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare w record; v_latest record; v_cur record;
begin
  perform public.wf_assert_admin();
  select * into w from public.workflows where id = p_workflow_id;
  if w.id is null then raise exception 'workflow not found'; end if;
  select * into v_cur from public.workflow_versions where id = w.current_version_id;
  select * into v_latest from public.workflow_versions where workflow_id = w.id order by version desc limit 1;
  return jsonb_build_object(
    'id', w.id, 'business_id', w.business_id, 'name', w.name, 'family', w.family, 'status', w.status, 'reentry_days', w.reentry_days, 'template_key', w.template_key,
    'updated_at', w.updated_at, 'current_version_id', w.current_version_id, 'current_version', v_cur.version,
    'latest_version_id', v_latest.id, 'latest_version', v_latest.version,
    'graph', coalesce(v_latest.graph, '{"nodes":[],"edges":[]}'::jsonb),
    'published_graph', v_cur.graph,
    'versions', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'version', v.version, 'notes', v.notes, 'published_at', v.published_at, 'created_at', v.created_at, 'is_current', v.id = w.current_version_id) order by v.version desc)
                          from public.workflow_versions v where v.workflow_id = w.id), '[]'::jsonb));
end $$;

-- Validation: [{node_id, level, message}]
create or replace function public.wf_validate(p_graph jsonb) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare v jsonb := '[]'::jsonb; n jsonb; v_triggers int; v_trig text; v_type text; v_id text; v_txt text; r text[]; v_reach text[]; v_vars text[] := array['first_name','points','points_remaining','days_since_last_visit','offer_name','business','treatment','member'];
begin
  select count(*) into v_triggers from jsonb_array_elements(coalesce(p_graph->'nodes','[]'::jsonb)) x where x->>'type' like 't.%';
  if v_triggers = 0 then v := v || jsonb_build_object('node_id', null, 'level', 'error', 'message', 'Add a trigger: every workflow starts with one.'); end if;
  if v_triggers > 1 then v := v || jsonb_build_object('node_id', null, 'level', 'error', 'message', 'Only one trigger per workflow.'); end if;
  v_trig := (public.wf_trigger_node(p_graph))->>'id';

  -- reachability from the trigger
  with recursive reach(id) as (
    select v_trig where v_trig is not null
    union
    select e->>'to' from reach, jsonb_array_elements(coalesce(p_graph->'edges','[]'::jsonb)) e where e->>'from' = reach.id
  ) select array_agg(id) into v_reach from reach;

  for n in select x from jsonb_array_elements(coalesce(p_graph->'nodes','[]'::jsonb)) x loop
    v_type := n->>'type'; v_id := n->>'id';
    if v_trig is not null and not (v_id = any(coalesce(v_reach, '{}'))) then
      v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Not connected to the flow.');
    end if;
    if v_type not in ('w.exit') and not exists (select 1 from jsonb_array_elements(coalesce(p_graph->'edges','[]'::jsonb)) e where e->>'from' = v_id) then
      v := v || jsonb_build_object('node_id', v_id, 'level', 'warn', 'message', 'The flow ends here (no next step). Add an End node to make that explicit.');
    end if;
    if v_type like 'c.%' or v_type = 'w.until' then
      if not exists (select 1 from jsonb_array_elements(coalesce(p_graph->'edges','[]'::jsonb)) e where e->>'from' = v_id and e->>'branch' = 'yes') then
        v := v || jsonb_build_object('node_id', v_id, 'level', 'warn', 'message', 'No "Yes" branch: members who match will exit here.'); end if;
      if not exists (select 1 from jsonb_array_elements(coalesce(p_graph->'edges','[]'::jsonb)) e where e->>'from' = v_id and e->>'branch' = 'no') then
        v := v || jsonb_build_object('node_id', v_id, 'level', 'warn', 'message', 'No "No" branch: members who don''t match will exit here.'); end if;
    end if;
    if v_type = 'c.opened' then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Open tracking isn''t available yet. Use "Visited" or "Redeemed" instead.'); end if;
    if v_type = 'a.email' then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Email needs consent + templates before it can go live (coming in a later phase).'); end if;
    if v_type in ('a.sms','a.segment') then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Coming soon — remove this step to publish.'); end if;
    if v_type = 'a.unlock' and nullif(n->'config'->>'reward_id','') is null then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Pick the reward to unlock.'); end if;
    if v_type = 'a.points' and coalesce((n->'config'->>'points')::int, 0) <= 0 then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Set how many points to award.'); end if;
    if v_type = 'a.tag' and nullif(btrim(n->'config'->>'tag'),'') is null then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Name the tag.'); end if;
    if v_type = 'a.enroll' and nullif(n->'config'->>'workflow_id','') is null then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Pick the workflow to add them to.'); end if;
    if v_type in ('a.push','a.offer') and nullif(btrim(n->'config'->>'body'),'') is null then v := v || jsonb_build_object('node_id', v_id, 'level', 'warn', 'message', 'The message is empty.'); end if;
    if v_type = 'w.wait' and coalesce((n->'config'->>'minutes')::int, 0) <= 0 then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Set how long to wait.'); end if;
    -- variables
    v_txt := coalesce(n->'config'->>'title','') || ' ' || coalesce(n->'config'->>'body','') || ' ' || coalesce(n->'config'->>'subject','');
    for r in select regexp_matches(v_txt, '\{\{\s*([a-z_]+)', 'g') loop
      if not (r[1] = any(v_vars)) then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Unknown variable {{' || r[1] || '}}.'); end if;
    end loop;
  end loop;

  -- cycles that contain no wait = runaway loop
  if exists (
    with recursive walk(start_id, cur, path, has_wait) as (
      select e->>'from', e->>'to', array[e->>'from'], false from jsonb_array_elements(coalesce(p_graph->'edges','[]'::jsonb)) e
      union all
      select walk.start_id, e->>'to', walk.path || (e->>'from'),
             walk.has_wait or (select x->>'type' in ('w.wait','w.until','w.until_date') from jsonb_array_elements(coalesce(p_graph->'nodes','[]'::jsonb)) x where x->>'id' = e->>'from')
        from walk join jsonb_array_elements(coalesce(p_graph->'edges','[]'::jsonb)) e on e->>'from' = walk.cur
       where not (e->>'from' = any(walk.path)) and array_length(walk.path, 1) < 60
    ) select 1 from walk where walk.cur = walk.start_id and not walk.has_wait)
  then v := v || jsonb_build_object('node_id', null, 'level', 'error', 'message', 'This flow loops back on itself without a wait, which would run forever.'); end if;
  return v;
end $$;

create or replace function public.wf_save_draft(p_workflow_id uuid, p_business_id uuid, p_name text, p_family text, p_graph jsonb, p_notes text default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_wf uuid := p_workflow_id; v_ver int; v_vid uuid;
begin
  perform public.wf_assert_admin();
  if v_wf is null then
    insert into public.workflows (business_id, name, family, created_by) values (p_business_id, coalesce(nullif(btrim(p_name),''), 'Untitled workflow'), nullif(btrim(p_family),''), auth.uid()) returning id into v_wf;
  else
    update public.workflows set name = coalesce(nullif(btrim(p_name),''), name), family = nullif(btrim(p_family),'') where id = v_wf and business_id = p_business_id;
    if not found then raise exception 'workflow not found'; end if;
  end if;
  select coalesce(max(version), 0) + 1 into v_ver from public.workflow_versions where workflow_id = v_wf;
  insert into public.workflow_versions (workflow_id, version, graph, notes) values (v_wf, v_ver, coalesce(p_graph, '{"nodes":[],"edges":[]}'::jsonb), p_notes) returning id into v_vid;
  return jsonb_build_object('workflow_id', v_wf, 'version_id', v_vid, 'version', v_ver, 'validation', public.wf_validate(p_graph));
end $$;

create or replace function public.wf_publish(p_workflow_id uuid, p_version_id uuid, p_mode text default 'active') returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare w record; v record; v_val jsonb; s record;
begin
  perform public.wf_assert_admin();
  select * into w from public.workflows where id = p_workflow_id;
  select * into v from public.workflow_versions where id = p_version_id and workflow_id = p_workflow_id;
  if w.id is null or v.id is null then raise exception 'workflow / version not found'; end if;
  v_val := public.wf_validate(v.graph);
  if exists (select 1 from jsonb_array_elements(v_val) x where x->>'level' = 'error') then
    return jsonb_build_object('ok', false, 'validation', v_val);
  end if;
  insert into public.business_automation_settings (business_id) values (w.business_id) on conflict do nothing;
  select * into s from public.business_automation_settings where business_id = w.business_id;
  if p_mode = 'testing' and coalesce(array_length(s.test_membership_ids, 1), 0) = 0 then
    return jsonb_build_object('ok', false, 'validation', jsonb_build_array(jsonb_build_object('node_id', null, 'level', 'error', 'message', 'Add at least one test member in Settings before publishing in Testing mode.')));
  end if;
  update public.workflow_versions set published_at = now(), published_by = auth.uid() where id = v.id;
  update public.workflows set current_version_id = v.id, status = case when p_mode = 'testing' then 'testing' else 'active' end,
         reentry_days = coalesce((public.wf_node_cfg(v.graph, 'w.no_reentry')->>'days')::int, reentry_days) where id = w.id;
  return jsonb_build_object('ok', true, 'status', case when p_mode = 'testing' then 'testing' else 'active' end, 'version', v.version, 'validation', v_val,
                            'engine_enabled', public.wf_engine_on() and s.enabled);
end $$;

create or replace function public.wf_set_status(p_workflow_id uuid, p_status text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare w record;
begin
  perform public.wf_assert_admin();
  select * into w from public.workflows where id = p_workflow_id;
  if w.id is null then raise exception 'workflow not found'; end if;
  if p_status not in ('paused','active','testing','archived','draft') then raise exception 'bad status'; end if;
  if p_status in ('active','testing') and w.current_version_id is null then raise exception 'publish a version first'; end if;
  update public.workflows set status = p_status where id = w.id;
  if p_status = 'archived' then
    update public.workflow_runs set status = 'exited', exited_at = now(), exit_reason = 'archived' where workflow_id = w.id and status in ('running','waiting');
  end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

create or replace function public.wf_rollback(p_workflow_id uuid, p_version_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.wf_assert_admin();
  if not exists (select 1 from public.workflow_versions where id = p_version_id and workflow_id = p_workflow_id) then raise exception 'version not found'; end if;
  update public.workflow_versions set published_at = coalesce(published_at, now()), published_by = coalesce(published_by, auth.uid()) where id = p_version_id;
  update public.workflows set current_version_id = p_version_id where id = p_workflow_id;
  return jsonb_build_object('ok', true);
end $$;

-- Dry run: the real engine, rolled back.
create or replace function public.wf_simulate(p_workflow_id uuid, p_version_id uuid, p_membership_id uuid default null) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare w record; v record; v_m uuid; v_run uuid; v_path jsonb; v_detail text; v_name text;
begin
  perform public.wf_assert_admin();
  select * into w from public.workflows where id = p_workflow_id;
  select * into v from public.workflow_versions where id = coalesce(p_version_id, w.current_version_id) and workflow_id = p_workflow_id;
  if w.id is null or v.id is null then raise exception 'workflow / version not found'; end if;
  v_m := p_membership_id;
  if v_m is null then
    select m.id into v_m from public.business_memberships m where m.business_id = w.business_id and m.status = 'active' order by coalesce(m.is_demo,false) desc, m.joined_at desc limit 1;
  end if;
  if v_m is null then return jsonb_build_object('path', '[]'::jsonb, 'would_send', '[]'::jsonb, 'note', 'This business has no members to simulate with.'); end if;
  select coalesce(p.full_name, 'Member') into v_name from public.business_memberships m left join public.profiles p on p.id = m.user_id where m.id = v_m;
  begin
    insert into public.workflow_runs (workflow_id, version_id, business_id, membership_id, status, current_node_id, wake_at, goal)
    values (w.id, v.id, w.business_id, v_m, 'running', (public.wf_trigger_node(v.graph))->>'id', now(), public.wf_node_cfg(v.graph, 'w.stop_on_convert')->>'goal') returning id into v_run;
    v_path := public.wf_advance_run(v_run, 200, true);
    raise exception 'WF_DRY_ROLLBACK' using detail = v_path::text;
  exception when others then
    if sqlerrm = 'WF_DRY_ROLLBACK' then
      get stacked diagnostics v_detail = pg_exception_detail;
      v_path := v_detail::jsonb;
    else
      v_path := jsonb_build_array(jsonb_build_object('node_id', null, 'node_type', 'engine', 'result', 'error', 'detail', jsonb_build_object('error', sqlerrm)));
    end if;
  end;
  return jsonb_build_object('membership_id', v_m, 'member_name', v_name, 'path', v_path,
    'would_send', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_path) x where x->>'node_type' in ('a.push','a.offer','a.unlock','a.notify_admin') and x->>'result' = 'ok'));
end $$;

create or replace function public.wf_node_metrics(p_workflow_id uuid, p_days int default 30)
returns table (node_id text, reached int, completed int, waiting int, sent int, delivered int, failed int, skipped int, converted int)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  perform public.wf_assert_admin();
  return query
  select st.node_id,
         count(distinct st.run_id)::int,
         count(distinct st.run_id) filter (where st.result in ('ok','yes','no','exit'))::int,
         (select count(*)::int from public.workflow_runs r2 where r2.workflow_id = p_workflow_id and r2.current_node_id = st.node_id and r2.status = 'waiting'),
         count(*) filter (where st.result = 'ok' and st.node_type in ('a.push','a.offer','a.unlock','a.notify_admin'))::int,
         (select count(*)::int from public.notifications n where n.workflow_node_id = st.node_id and n.push_sent_at is not null and n.workflow_run_id in (select r3.id from public.workflow_runs r3 where r3.workflow_id = p_workflow_id) and n.created_at > now() - (p_days || ' days')::interval),
         count(*) filter (where st.result = 'error')::int,
         count(*) filter (where st.result = 'skipped')::int,
         count(distinct st.run_id) filter (where r.exit_reason = 'converted')::int
    from public.workflow_run_steps st join public.workflow_runs r on r.id = st.run_id
   where r.workflow_id = p_workflow_id and st.at > now() - (p_days || ' days')::interval
   group by st.node_id;
end $$;

create or replace function public.wf_member_path(p_workflow_id uuid, p_membership_id uuid)
returns table (run_id uuid, run_status text, entered_at timestamptz, exited_at timestamptz, exit_reason text, node_id text, node_type text, result text, detail jsonb, at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  perform public.wf_assert_admin();
  return query
  select r.id, r.status, r.entered_at, r.exited_at, r.exit_reason, st.node_id, st.node_type, st.result, st.detail, st.at
    from public.workflow_runs r join public.workflow_run_steps st on st.run_id = r.id
   where r.workflow_id = p_workflow_id and r.membership_id = p_membership_id
     and r.id = (select r2.id from public.workflow_runs r2 where r2.workflow_id = p_workflow_id and r2.membership_id = p_membership_id order by r2.entered_at desc limit 1)
   order by st.at;
end $$;

create or replace function public.wf_runs(p_workflow_id uuid, p_status text default null, p_limit int default 50)
returns table (run_id uuid, membership_id uuid, member_name text, status text, current_node_id text, wake_at timestamptz, entered_at timestamptz, exited_at timestamptz, exit_reason text, last_error text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  perform public.wf_assert_admin();
  return query
  select r.id, r.membership_id, coalesce(p.full_name, 'Member'), r.status, r.current_node_id, r.wake_at, r.entered_at, r.exited_at, r.exit_reason, r.last_error
    from public.workflow_runs r join public.business_memberships m on m.id = r.membership_id left join public.profiles p on p.id = m.user_id
   where r.workflow_id = p_workflow_id and (p_status is null or r.status = p_status)
   order by r.entered_at desc limit greatest(1, least(p_limit, 500));
end $$;

create or replace function public.wf_set_settings(p_business_id uuid, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare s record;
begin
  perform public.wf_assert_admin();
  insert into public.business_automation_settings (business_id) values (p_business_id) on conflict do nothing;
  update public.business_automation_settings set
    enabled = coalesce((p_settings->>'enabled')::boolean, enabled),
    quiet_start = coalesce((p_settings->>'quiet_start')::time, quiet_start),
    quiet_end = coalesce((p_settings->>'quiet_end')::time, quiet_end),
    max_msgs_per_member_per_week = coalesce((p_settings->>'max_msgs_per_member_per_week')::int, max_msgs_per_member_per_week),
    test_membership_ids = case when p_settings ? 'test_membership_ids' then coalesce((select array_agg(x::text::uuid) from jsonb_array_elements_text(p_settings->'test_membership_ids') x), '{}') else test_membership_ids end,
    updated_at = now()
   where business_id = p_business_id returning * into s;
  return to_jsonb(s) || jsonb_build_object('engine_global', public.wf_engine_on());
end $$;

-- Members list for the test-member picker and the simulator
create or replace function public.wf_members(p_business_id uuid, p_q text default null, p_limit int default 20)
returns table (membership_id uuid, full_name text, email text, is_demo boolean, points_balance int, last_visit_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  perform public.wf_assert_admin();
  return query
  select m.id, coalesce(p.full_name, 'Member'), p.email::text, coalesce(m.is_demo,false), m.points_balance, m.last_visit_at
    from public.business_memberships m left join public.profiles p on p.id = m.user_id
   where m.business_id = p_business_id and m.status <> 'blocked'
     and (p_q is null or p.full_name ilike '%' || p_q || '%' or p.email::text ilike '%' || p_q || '%')
   order by coalesce(m.is_demo,false) desc, m.last_visit_at desc nulls last limit greatest(1, least(p_limit, 100));
end $$;

-- Rewards for pickers (unlock / offer nodes)
create or replace function public.wf_rewards(p_business_id uuid)
returns table (id uuid, name text, point_cost int)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  perform public.wf_assert_admin();
  return query select r.id, r.name, r.point_cost from public.rewards r where r.business_id = p_business_id and r.is_active and r.archived_at is null order by r.point_cost;
end $$;

-- Unified message log (workflow + legacy) for the business
create or replace function public.wf_messages(p_business_id uuid, p_limit int default 100)
returns table (id uuid, at timestamptz, kind text, source text, family text, title text, body text, member_name text, delivered boolean, read boolean, workflow_name text, node_id text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  perform public.wf_assert_admin();
  return query
  select n.id, n.created_at, n.kind, coalesce(n.source, 'system'), n.family, n.title, n.body, coalesce(p.full_name, 'Member'), n.push_sent_at is not null, n.read_at is not null,
         (select w.name from public.workflow_runs r join public.workflows w on w.id = r.workflow_id where r.id = n.workflow_run_id), n.workflow_node_id
    from public.notifications n left join public.profiles p on p.id = n.user_id
   where n.business_id = p_business_id and n.kind not in ('invoice_paid','invoice_failed','subscription_updated')
   order by n.created_at desc limit greatest(1, least(p_limit, 500));
end $$;

-- Global flag (admin only)
create or replace function public.wf_set_engine(p_on boolean) returns boolean
language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.wf_assert_admin();
  insert into public.app_settings (key, value) values ('automation_engine', case when p_on then 'on' else 'off' end)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return p_on;
end $$;

-- Member search for the test-member picker (admin only)
-- NB: no DEFAULT on p_limit — a pre-existing staff-desk search_members(uuid, text) overload exists and a default
-- would make a 2-argument PostgREST call ambiguous (see 08_hardening.sql). The Hub UI always passes p_limit.
create or replace function public.search_members(p_business_id uuid, p_q text, p_limit int)
returns table (membership_id uuid, user_id uuid, full_name text, email text, phone text, is_demo boolean)
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
