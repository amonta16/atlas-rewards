-- CP-261 · Email journeys for entertainment venues (Flippo's) on the CP-217 automation engine.
--
-- Safe to run BEFORE the deploy: nothing here starts a journey. The venue journeys only exist as a
-- catalog until 03_install.sql (after the deploy) installs them, PAUSED. Med spas are unchanged:
-- wf_catalog_for() returns the same wf_suite_catalog() they read today.
--
--   1. wf_catalog_for(business): med spa catalog, or wf_venue_catalog() for layout_preset = 'entertainment'
--   2. wf_suite / wf_suite_row / wf_suite_toggle / wf_suite_install_key / wf_suite_update read it
--   3. wf_act_email: passes template 'arcade' and data.gate through to the outbox
--   4. reward.unlocked / reward.near and reward.expiring now also fire for entertainment venues
--      (prize-counter rewards only, so wheel / streak prizes at 1 point never count as "unlocked")
--   5. birthday.soon (21 days before) for entertainment venues + a daily cron
--   6. wf_install_venue_suite(): installs the venue journeys, new ones paused
--
-- Run 01_catalog.sql (wf_venue_catalog) first: wf_catalog_for is a SQL function, checked when it's created.

begin;

-- 1 ───────────────────────────────────────────────────────────────────────────
create or replace function public.wf_catalog_for(p_business_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when (select layout_preset from public.businesses where id = p_business_id) = 'entertainment'
              then public.wf_venue_catalog() else public.wf_suite_catalog() end;
$$;
revoke all on function public.wf_catalog_for(uuid) from public, anon, authenticated;

-- 2 ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wf_suite(p_business_id uuid)
 RETURNS TABLE(key text, grp text, name text, why text, research text, trigger_text text, timing_text text, channels text[], reward_text text, engine text, enabled boolean, workflow_id uuid, entered_30d integer, sent_30d integer, converted_30d integer, graph jsonb, messages jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k text; r jsonb;
begin
  perform public.wf_assert_suite_access(p_business_id);   -- CP-249: clinic managers too (was agency admins only)
  -- CP-261: the business's own catalog (med spa suite, or the entertainment venue journeys)
  for k in select x->>'key' from jsonb_array_elements(public.wf_catalog_for(p_business_id)) x order by (x->>'sort')::int loop
    r := public.wf_suite_row(p_business_id, k);
    key := r->>'key'; grp := r->>'grp'; name := r->>'name'; why := r->>'why'; research := r->>'research';
    trigger_text := r->>'trigger_text'; timing_text := r->>'timing_text';
    channels := array(select jsonb_array_elements_text(r->'channels')); reward_text := r->>'reward_text';
    engine := r->>'engine'; enabled := (r->>'enabled')::boolean; workflow_id := nullif(r->>'workflow_id','')::uuid;
    entered_30d := (r->>'entered_30d')::int; sent_30d := (r->>'sent_30d')::int; converted_30d := (r->>'converted_30d')::int;
    graph := r->'graph'; messages := r->'messages';
    return next;
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION public.wf_suite_row(p_business_id uuid, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d jsonb; v_wid uuid; v_wstatus text; v_wgraph jsonb; g jsonb; ns record; b record; v_enabled boolean; v_entered int := 0; v_sent int := 0; v_conv int := 0;
        v_msgs jsonb := '[]'::jsonb; n jsonb; c jsonb; v_bonus int; v_fb int; v_engine text; v_src text;
begin
  select x into d from jsonb_array_elements(public.wf_catalog_for(p_business_id)) x where x->>'key' = p_key;   -- CP-261
  if d is null then raise exception 'unknown suite key %', p_key; end if;
  v_engine := coalesce(d->>'engine','workflow');
  select * into ns from public.business_notification_settings where business_id = p_business_id;
  select * into b from public.businesses where id = p_business_id;
  v_fb := coalesce((b.point_rules->>'referral_referee')::int, 0);

  if v_engine = 'workflow' then
    select w2.id, w2.status, v.graph into v_wid, v_wstatus, v_wgraph from public.workflows w2 left join public.workflow_versions v on v.id = w2.current_version_id
     where w2.business_id = p_business_id and w2.system_key = p_key;
    g := coalesce(v_wgraph, d->'graph');
    v_enabled := coalesce(v_wstatus in ('active','testing'), false) and (p_key <> 'ms.reward_ready' or coalesce(ns.reward_unlocked, true));
    if v_wid is not null then
      select count(*)::int, count(*) filter (where r.exit_reason = 'converted' and r.exited_at > now() - interval '30 days')::int
        into v_entered, v_conv from public.workflow_runs r where r.workflow_id = v_wid and r.entered_at > now() - interval '30 days';
      select (select count(*)::int from public.notifications n2 join public.workflow_runs r on r.id = n2.workflow_run_id
               where r.workflow_id = v_wid and n2.created_at > now() - interval '30 days')
           + (select count(*)::int from public.email_outbox o join public.workflow_runs r on r.id = o.workflow_run_id
               where r.workflow_id = v_wid and o.status in ('queued','sending','sent') and o.created_at > now() - interval '30 days')
        into v_sent;
    end if;
  else
    g := public.wf_suite_legacy_graph(p_business_id, p_key);
    if p_key = 'ms.birthday' then
      v_enabled := coalesce(ns.birthday, true) and (coalesce((b.point_rules->>'birthday')::int, 0) > 0
                   or exists (select 1 from public.business_automated_offers o join public.automated_offer_templates t on t.id = o.template_id
                               where o.business_id = p_business_id and t.trigger_type = 'birthday' and o.is_active));
      select count(*)::int into v_sent from public.points_ledger l where l.business_id = p_business_id and l.rule_type = 'birthday' and l.created_at > now() - interval '30 days';
    else
      v_enabled := coalesce(ns.gift_expiration_reminders, true);
      select count(*)::int into v_sent from public.notifications n2 where n2.business_id = p_business_id and n2.kind = 'reward_expiration' and n2.created_at > now() - interval '30 days';
    end if;
  end if;

  for n in select x from jsonb_array_elements(coalesce(g->'nodes','[]'::jsonb)) with ordinality t(x, i) where x->>'type' in ('a.push','a.email','a.offer') order by i loop
    c := coalesce(n->'config','{}'::jsonb);
    v_bonus := public.wf_msg_bonus(n, g, p_business_id);
    v_src := c->>'bonus_from';
    v_msgs := v_msgs || jsonb_build_object(
      'node_id', n->>'id', 'channel', case n->>'type' when 'a.email' then 'email' else 'push' end, 'label', n->>'label',
      'when_text', c->>'when',
      'title',     public.wf_suite_fill(c->>'title', v_bonus, v_fb),
      'body',      public.wf_suite_fill(c->>'body', v_bonus, v_fb),
      'subject',   public.wf_suite_fill(c->>'subject', v_bonus, v_fb),
      'preheader', public.wf_suite_fill(c->>'preheader', v_bonus, v_fb),
      'heading',   public.wf_suite_fill(c->>'heading', v_bonus, v_fb),
      'cta_label', c->>'cta_label',
      'cta_path',  coalesce(c->>'cta_path', c->>'link_path'),
      'cta_redeem', coalesce((c->>'cta_redeem')::boolean, false),   -- CP-261
      'footnote',  public.wf_suite_fill(c->>'footnote', v_bonus, v_fb),
      'points',    v_bonus,
      'points_source', case when v_src like 'node:%' then 'journey' when v_src like 'rule:%' then 'point_rules' end,
      'points_editable', coalesce(v_engine = 'workflow' and v_src like 'node:%', false),
      'editable',  v_engine = 'workflow',
      'transactional', coalesce((c->>'transactional')::boolean, false),
      'template',  c->>'template');
  end loop;

  return jsonb_build_object(
    'key', p_key, 'grp', d->>'grp', 'name', d->>'name', 'why', d->>'why', 'research', d->>'research',
    'trigger_text', d->>'trigger_text', 'timing_text', d->>'timing_text', 'channels', d->'channels', 'reward_text', d->>'reward_text',
    'engine', v_engine, 'enabled', coalesce(v_enabled, false), 'workflow_id', v_wid, 'status', v_wstatus,
    'entered_30d', coalesce(v_entered, 0), 'sent_30d', coalesce(v_sent, 0), 'converted_30d', coalesce(v_conv, 0),
    'graph', g, 'messages', v_msgs);
end $function$;

CREATE OR REPLACE FUNCTION public.wf_suite_install_key(p_business_id uuid, p_key text, p_force boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d jsonb; w public.workflows; g jsonb; cur jsonb; v_vid uuid; v_ver int; v_state text := 'unchanged';
begin
  select x into d from jsonb_array_elements(public.wf_catalog_for(p_business_id)) x where x->>'key' = p_key;   -- CP-261
  if d is null or coalesce(d->>'engine','workflow') <> 'workflow' then return 'skipped'; end if;
  select * into w from public.workflows where business_id = p_business_id and system_key = p_key;
  if w.id is null then
    select * into w from public.workflows where business_id = p_business_id and template_key = p_key and system_key is null and status <> 'archived'
     order by updated_at desc limit 1;
    if w.id is not null then
      update public.workflows set system_key = p_key, managed = true where id = w.id returning * into w;
      v_state := 'adopted';
    end if;
  end if;
  if w.id is null then
    insert into public.workflows (business_id, name, family, status, reentry_days, template_key, system_key, managed)
    values (p_business_id, d->>'name', d->>'family', 'draft', coalesce((d->>'reentry')::int, 30), p_key, p_key, true) returning * into w;
    v_state := 'created';
  end if;
  g := public.wf_suite_apply_overrides(d->'graph', w.overrides);
  select graph into cur from public.workflow_versions where id = w.current_version_id;
  if p_force or cur is distinct from g then
    select coalesce(max(version), 0) + 1 into v_ver from public.workflow_versions where workflow_id = w.id;
    insert into public.workflow_versions (workflow_id, version, graph, notes, published_at)
    values (w.id, v_ver, g, case when d->>'niche' = 'entertainment' then 'Atlas venue journeys' else 'Atlas med spa suite' end, now()) returning id into v_vid;
    update public.workflows set current_version_id = v_vid where id = w.id;
    if v_state = 'unchanged' then v_state := 'updated'; end if;
  end if;
  update public.workflows set name = d->>'name', family = d->>'family', reentry_days = coalesce((d->>'reentry')::int, reentry_days), managed = true,
         status = case when v_state in ('created','adopted') then 'active' else status end, updated_at = now()
   where id = w.id;
  return v_state;
end $function$;

CREATE OR REPLACE FUNCTION public.wf_suite_toggle(p_business_id uuid, p_key text, p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d jsonb;
begin
  perform public.wf_assert_suite_access(p_business_id);   -- CP-249: clinic managers too (was agency admins only)
  select x into d from jsonb_array_elements(public.wf_catalog_for(p_business_id)) x where x->>'key' = p_key;   -- CP-261
  if d is null then raise exception 'unknown suite key %', p_key; end if;
  if coalesce(d->>'engine','workflow') = 'workflow' then
    if not exists (select 1 from public.workflows where business_id = p_business_id and system_key = p_key) then
      perform public.wf_suite_install_key(p_business_id, p_key, false);
    end if;
    update public.workflows set status = case when p_enabled then 'active' else 'paused' end, updated_at = now()
     where business_id = p_business_id and system_key = p_key;
    if p_enabled then
      insert into public.business_automation_settings (business_id, enabled) values (p_business_id, true)
      on conflict (business_id) do update set enabled = true, updated_at = now();
    end if;
  end if;
  if p_key in ('ms.review','ms.winback','ms.reward_ready','ms.birthday','ms.points_expiring') then
    perform public.wf_suite_legacy_apply(p_business_id, p_key, p_enabled);
  end if;
  return jsonb_build_object('ok', true, 'row', public.wf_suite_row(p_business_id, p_key));
end $function$;

CREATE OR REPLACE FUNCTION public.wf_suite_update(p_business_id uuid, p_key text, p_node_id text, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d jsonb; w record; v_clean jsonb := '{}'::jsonb; e record; v_merged jsonb; v_max int;
begin
  perform public.wf_assert_admin();
  select x into d from jsonb_array_elements(public.wf_catalog_for(p_business_id)) x where x->>'key' = p_key;   -- CP-261
  if d is null then raise exception 'unknown suite key %', p_key; end if;
  if coalesce(d->>'engine','workflow') <> 'workflow' then raise exception 'This journey runs on a built-in automation: only on/off can be changed.'; end if;
  if public.wf_graph_node(d->'graph', p_node_id) is null then raise exception 'unknown step %', p_node_id; end if;
  for e in select * from jsonb_each(coalesce(p_patch, '{}'::jsonb)) loop
    v_max := case e.key when 'title' then 120 when 'subject' then 150 when 'preheader' then 200 when 'heading' then 150
                        when 'cta_label' then 40 when 'footnote' then 200 when 'body' then 2000 else null end;
    if v_max is not null and jsonb_typeof(e.value) in ('string','null') then
      v_clean := v_clean || jsonb_build_object(e.key, case when jsonb_typeof(e.value) = 'null' then null else left(e.value #>> '{}', v_max) end);
    elsif e.key = 'points' and (e.value #>> '{}') ~ '^\d{1,6}$' and (e.value #>> '{}')::int between 1 and 100000 then
      v_clean := v_clean || jsonb_build_object('points', (e.value #>> '{}')::int);
    elsif e.key = 'points' and jsonb_typeof(e.value) = 'null' then
      v_clean := v_clean || jsonb_build_object('points', null);
    end if;
  end loop;
  if not exists (select 1 from public.workflows where business_id = p_business_id and system_key = p_key) then
    perform public.wf_suite_install_key(p_business_id, p_key, false);
  end if;
  select * into w from public.workflows where business_id = p_business_id and system_key = p_key;
  v_merged := jsonb_strip_nulls(coalesce(w.overrides->p_node_id, '{}'::jsonb) || v_clean);
  v_merged := coalesce((select jsonb_object_agg(k, v) from jsonb_each(v_merged) t(k, v) where not (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')), '{}'::jsonb);
  update public.workflows set overrides = case when v_merged = '{}'::jsonb then overrides - p_node_id else overrides || jsonb_build_object(p_node_id, v_merged) end,
         updated_at = now() where id = w.id;
  perform public.wf_suite_install_key(p_business_id, p_key, false);
  return public.wf_suite_row(p_business_id, p_key);
end $function$;

-- 3 ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wf_act_email(p_run workflow_runs, p_node jsonb, p_family text, p_test boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m record; v_key text; v_to text; c jsonb; x jsonb; v_subject text; v_id uuid; v_hero text; v_payload jsonb;
begin
  select m2.*, p.email::text as email into m from public.business_memberships m2 left join public.profiles p on p.id = m2.user_id where m2.id = p_run.membership_id;
  v_key := 'wf:' || p_run.id || ':' || (p_node->>'id');
  if exists (select 1 from public.email_outbox where idempotency_key = v_key) then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','already_sent')); end if;
  v_to := nullif(btrim(coalesce(m.email, '')), '');
  if v_to is null or position('@' in v_to) = 0 then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','no_email')); end if;
  if exists (select 1 from public.member_comm_prefs where membership_id = p_run.membership_id and email_opt_out_at is not null) then
    return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','opted_out'));
  end if;
  c := coalesce(p_node->'config', '{}'::jsonb);
  x := coalesce(c->'_ctx', '{}'::jsonb);
  v_subject := (case when p_test then '[TEST] ' else '' end) || public.wf_render(coalesce(nullif(c->>'subject',''), 'A note from {{business}}'), p_run.business_id, p_run.membership_id, x);
  v_hero := case c->>'hero' when 'item' then x->>'item_image' else null end;
  -- CP-249: the shared rewards layout, and which reward the email is about (from the entry event)
  select payload into v_payload from public.customer_events where id = p_run.entry_event_id;
  insert into public.email_outbox (business_id, membership_id, user_id, to_email, subject, preheader, heading, body, cta_label, cta_url, footnote, hero_url,
                                   workflow_run_id, node_id, idempotency_key, template, data)
  values (p_run.business_id, p_run.membership_id, m.user_id, v_to, v_subject,
          nullif(public.wf_render(c->>'preheader', p_run.business_id, p_run.membership_id, x), ''),
          nullif(public.wf_render(c->>'heading', p_run.business_id, p_run.membership_id, x), ''),
          public.wf_render(coalesce(c->>'body', ''), p_run.business_id, p_run.membership_id, x),
          nullif(public.wf_render(c->>'cta_label', p_run.business_id, p_run.membership_id, x), ''),
          nullif(public.wf_render(c->>'cta_path', p_run.business_id, p_run.membership_id, x), ''),
          nullif(public.wf_render(c->>'footnote', p_run.business_id, p_run.membership_id, x), ''),
          v_hero, p_run.id, p_node->>'id', v_key,
          -- CP-261: 'arcade' is the entertainment venue layout
          case when c->>'template' in ('rewards','arcade') then c->>'template' end,
          jsonb_strip_nulls(jsonb_build_object('reward_id', v_payload->>'reward_id', 'offer_name', coalesce(v_payload->>'offer_name', x->>'offer_name'),
                                               'gated', case when coalesce((c->>'gated')::boolean, false) then true end,
                                               'gate', nullif(c->>'gate', ''),
                                               'redeem', case when coalesce((c->>'cta_redeem')::boolean, false) then true end)))
  on conflict (idempotency_key) do nothing returning id into v_id;
  if v_id is null then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','already_sent')); end if;
  return jsonb_build_object('result','ok','detail',jsonb_build_object('channel','email','subject',v_subject,'email_id',v_id));
end $function$;

-- 4 ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._wf_ev_reward_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_un record; v_nx record; v_at int; v_preset text; v_store_only boolean;
begin
  begin
    if new.points_balance is null or old.points_balance is null or new.points_balance <= old.points_balance then return new; end if;
    select b.layout_preset into v_preset from public.businesses b where b.id = new.business_id;
    if v_preset is distinct from 'medspa' and v_preset is distinct from 'entertainment' then return new; end if;
    -- CP-261: venues have prize-only rewards (wheel / streak gifts at 1 point) outside the prize counter; only counter prizes count
    v_store_only := v_preset = 'entertainment';
    -- the most valuable reward this change newly covers
    select r.id, r.name, r.point_cost into v_un from public.rewards r
     where r.business_id = new.business_id and r.is_active and r.archived_at is null and r.point_cost > 0
       and (not v_store_only or r.show_in_store)
       and r.point_cost > old.points_balance and r.point_cost <= new.points_balance
     order by r.point_cost desc limit 1;
    if v_un.id is not null then
      perform public.wf_emit(new.business_id, new.id, 'reward.unlocked',
        jsonb_build_object('reward_id', v_un.id, 'offer_name', v_un.name, 'point_cost', v_un.point_cost, 'balance', new.points_balance),
        new.id || ':' || v_un.id || ':' || to_char(now(), 'YYYYMMDDHH24'));
    end if;
    -- the next reward the new balance doesn't cover yet, when the balance just entered its last 25%
    select r.id, r.name, r.point_cost into v_nx from public.rewards r
     where r.business_id = new.business_id and r.is_active and r.archived_at is null and r.point_cost > new.points_balance
       and (not v_store_only or r.show_in_store)
     order by r.point_cost asc limit 1;
    if v_nx.id is not null then
      v_at := ceil(v_nx.point_cost * 0.75)::int;
      if old.points_balance < v_at and new.points_balance >= v_at then
        perform public.wf_emit(new.business_id, new.id, 'reward.near',
          jsonb_build_object('reward_id', v_nx.id, 'offer_name', v_nx.name, 'point_cost', v_nx.point_cost, 'points_to_go', v_nx.point_cost - new.points_balance),
          new.id || ':' || v_nx.id || ':near:' || to_char(now(), 'YYYYMMDD'));
      end if;
    end if;
  exception when others then null; end;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.wf_emit_reward_expiring()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_n int := 0;
begin
  for r in
    select d.id, d.business_id, d.membership_id, d.reward_id, d.expires_at, coalesce(rw.name, 'your reward') as name
      from public.redemptions d
      join public.businesses b on b.id = d.business_id and b.layout_preset in ('medspa','entertainment')   -- CP-261: venues too
      left join public.rewards rw on rw.id = d.reward_id
     where d.status = 'pending' and d.membership_id is not null and d.expires_at is not null
       and d.expires_at between now() + interval '48 hours' and now() + interval '96 hours'
  loop
    perform public.wf_emit(r.business_id, r.membership_id, 'reward.expiring',
      jsonb_build_object('redemption_id', r.id, 'reward_id', r.reward_id, 'offer_name', r.name, 'due_at', r.expires_at),
      'redemption:' || r.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

-- 5 ───────────────────────────────────────────────────────────────────────────
-- birthday.soon: 21 days before a member's birthday, for venues whose automations are on and that run a
-- journey listening for it. One per member per year (dedupe key).
create or replace function public.wf_emit_venue_time_events()
returns integer language plpgsql security definer set search_path = public as $$
declare b record; r record; v_tz text; v_target date; v_n int := 0;
begin
  if not public.wf_engine_on() then return 0; end if;
  for b in
    select s.business_id from public.business_automation_settings s join public.businesses bz on bz.id = s.business_id
     where s.enabled and bz.layout_preset = 'entertainment'
       and exists (select 1 from public.workflows w join public.workflow_versions v on v.id = w.current_version_id,
                          jsonb_array_elements(v.graph->'nodes') n
                    where w.business_id = s.business_id and w.status in ('active','testing') and n->>'type' = 't.event'
                      and n->'config'->'events' ? 'birthday.soon')
  loop
    v_tz := public.business_timezone(b.business_id);
    v_target := (now() at time zone v_tz)::date + 21;
    for r in
      select m.id from public.business_memberships m join public.profiles p on p.id = m.user_id
       where m.business_id = b.business_id and coalesce(m.is_demo, false) = false and m.status not in ('blocked','canceled')
         and p.birthday is not null and to_char(p.birthday, 'MMDD') = to_char(v_target, 'MMDD')
    loop
      perform public.wf_emit(b.business_id, r.id, 'birthday.soon', jsonb_build_object('birthday', v_target),
                             r.id::text || ':' || extract(year from v_target)::text);
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end $$;
revoke all on function public.wf_emit_venue_time_events() from public, anon, authenticated;

-- 6 ───────────────────────────────────────────────────────────────────────────
-- Installs (or refreshes) every venue journey on one entertainment business. Journeys created here start
-- PAUSED: the manager turns each one on from the desk (Campaigns → Automations). Existing ones keep their status.
create or replace function public.wf_install_venue_suite(p_business_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare k text; v_state text; v_n int := 0;
begin
  if not exists (select 1 from public.businesses where id = p_business_id and layout_preset = 'entertainment') then return 0; end if;
  for k in select x->>'key' from jsonb_array_elements(public.wf_venue_catalog()) x order by (x->>'sort')::int loop
    v_state := public.wf_suite_install_key(p_business_id, k, false);
    if v_state in ('created','adopted') then
      update public.workflows set status = 'paused', updated_at = now() where business_id = p_business_id and system_key = k;
    end if;
    if v_state <> 'skipped' then v_n := v_n + 1; end if;
  end loop;
  insert into public.business_automation_settings (business_id, enabled) values (p_business_id, false)
  on conflict (business_id) do nothing;
  return v_n;
end $$;
revoke all on function public.wf_install_venue_suite(uuid) from public, anon, authenticated;

commit;

-- daily at 16:40 UTC (8:40 am Pacific), outside the transaction (pg_cron)
select cron.schedule('atlas-wf-venue-time-events', '40 16 * * *', 'select public.wf_emit_venue_time_events();');
