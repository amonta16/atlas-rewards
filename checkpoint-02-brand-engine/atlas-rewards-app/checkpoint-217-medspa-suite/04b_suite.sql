-- CP-217 · Med Spa Automation Suite · 04b install, legacy switches, auto-install trigger, suite RPCs (safe to re-run)

-- ───────── overrides: per node {title, body, subject, preheader, heading, cta_label, footnote, points} ─────────
-- points on a message node goes to the points node it advertises (config.bonus_from = node:<id>);
-- points on an a.points / a.offer node sets that node's amount. Points from point_rules (rule:*) are not editable here.
create or replace function public.wf_suite_apply_overrides(p_graph jsonb, p_ov jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare v_nodes jsonb := '[]'::jsonb; n jsonb; p jsonb; v_pts jsonb := '{}'::jsonb; v_tgt text; v_cfg jsonb; v_p int;
begin
  if p_graph is null or p_ov is null or p_ov = '{}'::jsonb then return p_graph; end if;
  for n in select x from jsonb_array_elements(coalesce(p_graph->'nodes','[]'::jsonb)) x loop
    p := p_ov->(n->>'id');
    if p is not null and (p->>'points') ~ '^\d{1,6}$' then
      v_tgt := case when n->>'type' in ('a.points','a.offer') then n->>'id'
                    when n->'config'->>'bonus_from' like 'node:%' then substr(n->'config'->>'bonus_from', 6) end;
      if v_tgt is not null then v_pts := v_pts || jsonb_build_object(v_tgt, (p->>'points')::int); end if;
    end if;
  end loop;
  for n in select x from jsonb_array_elements(coalesce(p_graph->'nodes','[]'::jsonb)) x loop
    p := coalesce(p_ov->(n->>'id'), '{}'::jsonb);
    v_cfg := coalesce(n->'config','{}'::jsonb) || coalesce((select jsonb_object_agg(key, value) from jsonb_each(p)
                where key in ('title','body','subject','preheader','heading','cta_label','footnote') and jsonb_typeof(value) = 'string'), '{}'::jsonb);
    if v_pts ? (n->>'id') then
      v_p := (v_pts->>(n->>'id'))::int;
      if n->>'type' = 'a.offer' then v_cfg := v_cfg || jsonb_build_object('bonus_points', v_p);
      else v_cfg := v_cfg || jsonb_build_object('points', v_p); end if;
      n := jsonb_set(n, '{label}', to_jsonb(regexp_replace(coalesce(n->>'label',''), '\+\d+', '+' || v_p)));
    end if;
    v_nodes := v_nodes || jsonb_set(n, '{config}', v_cfg);
  end loop;
  return jsonb_set(p_graph, '{nodes}', v_nodes);
end $$;

-- ───────── install / update one managed journey. Returns created | adopted | updated | unchanged | skipped ─────────
create or replace function public.wf_suite_install_key(p_business_id uuid, p_key text, p_force boolean default false) returns text
language plpgsql security definer set search_path to 'public' as $$
declare d jsonb; w public.workflows; g jsonb; cur jsonb; v_vid uuid; v_ver int; v_state text := 'unchanged';
begin
  select x into d from jsonb_array_elements(public.wf_suite_catalog()) x where x->>'key' = p_key;
  if d is null or coalesce(d->>'engine','workflow') <> 'workflow' then return 'skipped'; end if;
  select * into w from public.workflows where business_id = p_business_id and system_key = p_key;
  if w.id is null then
    -- adopt a CP-216 copy of the same template (e.g. lotus-medspa's ms.winback) instead of duplicating it
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
    values (w.id, v_ver, g, 'Atlas med spa suite', now()) returning id into v_vid;
    update public.workflows set current_version_id = v_vid where id = w.id;
    if v_state = 'unchanged' then v_state := 'updated'; end if;
  end if;
  update public.workflows set name = d->>'name', family = d->>'family', reentry_days = coalesce((d->>'reentry')::int, reentry_days), managed = true,
         status = case when v_state in ('created','adopted') then 'active' else status end, updated_at = now()
   where id = w.id;
  return v_state;
end $$;

-- ───────── legacy switches ─────────
create or replace function public.wf_suite_save(p_business_id uuid, p_key text, p_saved jsonb) returns void
language sql security definer set search_path to 'public' as $$
  insert into public.suite_legacy_saved (business_id, key, saved, updated_at) values (p_business_id, p_key, coalesce(p_saved,'{}'::jsonb), now())
  on conflict (business_id, key) do update set saved = excluded.saved, updated_at = now();
$$;

-- What each suite key controls outside the workflow engine:
--   ms.review          business_notification_settings.review_request      (legacy redemption-based review ask) OFF while the journey is on
--   ms.winback         business_automated_offers.is_active for every template with trigger_type 'inactivity' (Comeback) OFF while on
--   ms.reward_ready    business_notification_settings.reward_unlocked     follows the toggle (the instant "you unlocked" push)
--   ms.birthday        business_notification_settings.birthday, businesses.point_rules.birthday, business_automated_offers.is_active (birthday template)
--   ms.points_expiring business_notification_settings.gift_expiration_reminders
-- Values in place before the suite turned something off are kept in suite_legacy_saved and restored when it's turned back.
create or replace function public.wf_suite_legacy_apply(p_business_id uuid, p_key text, p_enabled boolean) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_saved jsonb; ns record; v_pr int; v_offers jsonb;
begin
  insert into public.business_notification_settings (business_id) values (p_business_id) on conflict do nothing;
  select * into ns from public.business_notification_settings where business_id = p_business_id;
  select saved into v_saved from public.suite_legacy_saved where business_id = p_business_id and key = p_key;
  v_saved := coalesce(v_saved, '{}'::jsonb);
  case p_key
  when 'ms.review' then
    if p_enabled then
      if not v_saved ? 'review_request' then perform public.wf_suite_save(p_business_id, p_key, jsonb_build_object('review_request', coalesce(ns.review_request, true))); end if;
      update public.business_notification_settings set review_request = false, updated_at = now() where business_id = p_business_id and review_request is distinct from false;
    else
      update public.business_notification_settings set review_request = coalesce((v_saved->>'review_request')::boolean, true), updated_at = now() where business_id = p_business_id;
      perform public.wf_suite_save(p_business_id, p_key, '{}'::jsonb);
    end if;
  when 'ms.winback' then
    if p_enabled then
      if not v_saved ? 'offers' then
        select coalesce(jsonb_object_agg(o.id::text, o.is_active), '{}'::jsonb) into v_offers
          from public.business_automated_offers o join public.automated_offer_templates t on t.id = o.template_id
         where o.business_id = p_business_id and t.trigger_type = 'inactivity';
        perform public.wf_suite_save(p_business_id, p_key, jsonb_build_object('offers', v_offers));
      end if;
      update public.business_automated_offers o set is_active = false, updated_at = now() from public.automated_offer_templates t
       where t.id = o.template_id and o.business_id = p_business_id and t.trigger_type = 'inactivity' and o.is_active;
    else
      update public.business_automated_offers o set is_active = (v_saved->'offers'->>o.id::text)::boolean, updated_at = now()
       where o.business_id = p_business_id and v_saved->'offers' ? o.id::text;
      perform public.wf_suite_save(p_business_id, p_key, '{}'::jsonb);
    end if;
  when 'ms.birthday' then
    if p_enabled then
      update public.business_notification_settings set birthday = true, updated_at = now() where business_id = p_business_id;
      v_pr := coalesce((v_saved->>'points')::int, nullif((select (point_rules->>'birthday')::int from public.businesses where id = p_business_id), 0), 250);
      update public.businesses set point_rules = coalesce(point_rules, '{}'::jsonb) || jsonb_build_object('birthday', v_pr)
       where id = p_business_id and coalesce((point_rules->>'birthday')::int, 0) <> v_pr;
      if v_saved ? 'offers' then
        update public.business_automated_offers o set is_active = (v_saved->'offers'->>o.id::text)::boolean, updated_at = now()
         where o.business_id = p_business_id and v_saved->'offers' ? o.id::text;
      end if;
      perform public.wf_suite_save(p_business_id, p_key, '{}'::jsonb);
    else
      select coalesce(jsonb_object_agg(o.id::text, o.is_active), '{}'::jsonb) into v_offers
        from public.business_automated_offers o join public.automated_offer_templates t on t.id = o.template_id
       where o.business_id = p_business_id and t.trigger_type = 'birthday';
      perform public.wf_suite_save(p_business_id, p_key, jsonb_build_object(
        'points', (select (point_rules->>'birthday')::int from public.businesses where id = p_business_id), 'offers', v_offers));
      update public.business_notification_settings set birthday = false, updated_at = now() where business_id = p_business_id;
      update public.businesses set point_rules = coalesce(point_rules, '{}'::jsonb) || jsonb_build_object('birthday', 0) where id = p_business_id;
      update public.business_automated_offers o set is_active = false, updated_at = now() from public.automated_offer_templates t
       where t.id = o.template_id and o.business_id = p_business_id and t.trigger_type = 'birthday' and o.is_active;
    end if;
  when 'ms.points_expiring' then
    update public.business_notification_settings set gift_expiration_reminders = p_enabled, updated_at = now() where business_id = p_business_id;
  when 'ms.reward_ready' then
    update public.business_notification_settings set reward_unlocked = p_enabled, updated_at = now() where business_id = p_business_id;
  else null;
  end case;
end $$;

-- ───────── install the whole suite for a med spa ─────────
create or replace function public.wf_install_medspa_suite(p_business_id uuid, p_force boolean default false) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare k text; v_state text; v_n int := 0; v_created boolean := false; w record;
begin
  if not exists (select 1 from public.businesses where id = p_business_id and layout_preset = 'medspa') then return 0; end if;
  for k in select x->>'key' from jsonb_array_elements(public.wf_suite_catalog()) x where coalesce(x->>'engine','workflow') = 'workflow' order by (x->>'sort')::int loop
    v_state := public.wf_suite_install_key(p_business_id, k, p_force);
    if v_state <> 'skipped' then v_n := v_n + 1; end if;
    if v_state in ('created','adopted') then v_created := true; end if;
  end loop;
  -- first install (or no settings row yet) switches the engine on for this business
  if v_created or not exists (select 1 from public.business_automation_settings where business_id = p_business_id) then
    insert into public.business_automation_settings (business_id, enabled) values (p_business_id, true)
    on conflict (business_id) do update set enabled = true, updated_at = now();
  end if;
  -- legacy overlap follows the suite journey's state
  for w in select system_key, status from public.workflows where business_id = p_business_id and system_key in ('ms.review','ms.winback') loop
    perform public.wf_suite_legacy_apply(p_business_id, w.system_key, w.status in ('active','testing'));
  end loop;
  return v_n;
end $$;

-- Auto-install when an app becomes a med spa (new business or preset change). Never fails the host write.
create or replace function public._wf_suite_on_business() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if new.layout_preset = 'medspa' and (tg_op = 'INSERT' or old.layout_preset is distinct from 'medspa') then
      perform public.wf_install_medspa_suite(new.id, false);
    end if;
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_suite_on_business after insert or update of layout_preset on public.businesses
  for each row execute function public._wf_suite_on_business();

-- ───────── display graphs for the legacy-backed keys ─────────
create or replace function public.wf_suite_legacy_graph(p_business_id uuid, p_key text) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare v_pts int; o record;
begin
  if p_key = 'ms.birthday' then
    select coalesce((point_rules->>'birthday')::int, 0) into v_pts from public.businesses where id = p_business_id;
    select coalesce(nullif(bao.custom_title,''), t.name) title, coalesce(nullif(bao.custom_description,''), 'Your birthday gift is waiting in the app.') body, bao.is_active
      into o from public.business_automated_offers bao join public.automated_offer_templates t on t.id = bao.template_id
     where bao.business_id = p_business_id and t.trigger_type = 'birthday' limit 1;
    return jsonb_build_object('nodes', jsonb_build_array(
        public.wf_tn('n1','t.birthday','Birthday (checked hourly, local time)',0,0),
        public.wf_tn('n2','a.points','Birthday points: +' || v_pts,0,140, jsonb_build_object('points', v_pts, 'note', 'Birthday points')),
        public.wf_tn('n3','a.push','Push: happy birthday',0,280, jsonb_build_object('when','On their birthday','title','Happy birthday! +' || v_pts || ' points',
                     'body','On us. Come celebrate, your points are already in your account.','link_path','/app/rewards')),
        public.wf_tn('n4','a.offer', case when coalesce(o.is_active,false) then 'Birthday gift card' else 'Birthday gift card (off)' end,0,420,
                     jsonb_build_object('when','On their birthday','title', coalesce(o.title, 'Happy birthday, {{first_name}}'), 'body', coalesce(o.body, 'Your birthday gift is waiting in the app.'))),
        public.wf_tn('n5','w.exit','End',0,560)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'), public.wf_te('n2','n3'), public.wf_te('n3','n4'), public.wf_te('n4','n5')));
  elsif p_key = 'ms.points_expiring' then
    return jsonb_build_object('nodes', jsonb_build_array(
        public.wf_tn('n1','t.event','A saved gift expires in under 48 hours',0,0, jsonb_build_object('events', jsonb_build_array('gift.expiring'))),
        public.wf_tn('n2','a.push','Push: expires tomorrow',0,140, jsonb_build_object('when','About a day before it expires','title','{{offer_name}} expires tomorrow',
                     'body','Don''t let it slip, it''s waiting at {{business}}.','link_path','/app/rewards')),
        public.wf_tn('n3','a.push','Push: last call',0,280, jsonb_build_object('when','A few hours before it expires','title','Last call: {{offer_name}} expires in a few hours',
                     'body','Show it at the desk at {{business}} before it''s gone.','link_path','/app/rewards')),
        public.wf_tn('n4','w.exit','End',0,420)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'), public.wf_te('n2','n3'), public.wf_te('n3','n4')));
  end if;
  return '{"nodes":[],"edges":[]}'::jsonb;
end $$;

create or replace function public.wf_suite_fill(p_text text, p_bonus int, p_friend int) returns text language sql immutable set search_path = public as $$
  select case when p_text is null then null else
    regexp_replace(regexp_replace(p_text, '\{\{\s*bonus\s*\}\}', coalesce(p_bonus::text, '{{bonus}}'), 'g'), '\{\{\s*friend_bonus\s*\}\}', coalesce(p_friend::text, '0'), 'g') end;
$$;

-- ───────── one suite row (jsonb) ─────────
create or replace function public.wf_suite_row(p_business_id uuid, p_key text) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare d jsonb; v_wid uuid; v_wstatus text; v_wgraph jsonb; g jsonb; ns record; b record; v_enabled boolean; v_entered int := 0; v_sent int := 0; v_conv int := 0;
        v_msgs jsonb := '[]'::jsonb; n jsonb; c jsonb; v_bonus int; v_fb int; v_engine text; v_src text;
begin
  select x into d from jsonb_array_elements(public.wf_suite_catalog()) x where x->>'key' = p_key;
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
      'footnote',  public.wf_suite_fill(c->>'footnote', v_bonus, v_fb),
      'points',    v_bonus,
      'points_source', case when v_src like 'node:%' then 'journey' when v_src like 'rule:%' then 'point_rules' end,
      'points_editable', coalesce(v_engine = 'workflow' and v_src like 'node:%', false),
      'editable',  v_engine = 'workflow',
      'transactional', coalesce((c->>'transactional')::boolean, false));
  end loop;

  return jsonb_build_object(
    'key', p_key, 'grp', d->>'grp', 'name', d->>'name', 'why', d->>'why', 'research', d->>'research',
    'trigger_text', d->>'trigger_text', 'timing_text', d->>'timing_text', 'channels', d->'channels', 'reward_text', d->>'reward_text',
    'engine', v_engine, 'enabled', coalesce(v_enabled, false), 'workflow_id', v_wid, 'status', v_wstatus,
    'entered_30d', coalesce(v_entered, 0), 'sent_30d', coalesce(v_sent, 0), 'converted_30d', coalesce(v_conv, 0),
    'graph', g, 'messages', v_msgs);
end $$;



-- ───────── RPCs for the Suite tab (agency admins only) ─────────
create or replace function public.wf_suite(p_business_id uuid)
returns table (key text, grp text, name text, why text, research text, trigger_text text, timing_text text, channels text[], reward_text text,
               engine text, enabled boolean, workflow_id uuid, entered_30d int, sent_30d int, converted_30d int, graph jsonb, messages jsonb)
language plpgsql stable security definer set search_path to 'public' as $$
declare k text; r jsonb;
begin
  perform public.wf_assert_admin();
  for k in select x->>'key' from jsonb_array_elements(public.wf_suite_catalog()) x order by (x->>'sort')::int loop
    r := public.wf_suite_row(p_business_id, k);
    key := r->>'key'; grp := r->>'grp'; name := r->>'name'; why := r->>'why'; research := r->>'research';
    trigger_text := r->>'trigger_text'; timing_text := r->>'timing_text';
    channels := array(select jsonb_array_elements_text(r->'channels')); reward_text := r->>'reward_text';
    engine := r->>'engine'; enabled := (r->>'enabled')::boolean; workflow_id := nullif(r->>'workflow_id','')::uuid;
    entered_30d := (r->>'entered_30d')::int; sent_30d := (r->>'sent_30d')::int; converted_30d := (r->>'converted_30d')::int;
    graph := r->'graph'; messages := r->'messages';
    return next;
  end loop;
end $$;

create or replace function public.wf_suite_toggle(p_business_id uuid, p_key text, p_enabled boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare d jsonb;
begin
  perform public.wf_assert_admin();
  select x into d from jsonb_array_elements(public.wf_suite_catalog()) x where x->>'key' = p_key;
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
end $$;

create or replace function public.wf_suite_update(p_business_id uuid, p_key text, p_node_id text, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare d jsonb; w record; v_clean jsonb := '{}'::jsonb; e record; v_merged jsonb; v_max int;
begin
  perform public.wf_assert_admin();
  select x into d from jsonb_array_elements(public.wf_suite_catalog()) x where x->>'key' = p_key;
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
  -- null or empty string = back to the Atlas default for that field
  v_merged := jsonb_strip_nulls(coalesce(w.overrides->p_node_id, '{}'::jsonb) || v_clean);
  v_merged := coalesce((select jsonb_object_agg(k, v) from jsonb_each(v_merged) t(k, v) where not (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '')), '{}'::jsonb);
  update public.workflows set overrides = case when v_merged = '{}'::jsonb then overrides - p_node_id else overrides || jsonb_build_object(p_node_id, v_merged) end,
         updated_at = now() where id = w.id;
  perform public.wf_suite_install_key(p_business_id, p_key, false);
  return public.wf_suite_row(p_business_id, p_key);
end $$;

create or replace function public.wf_suite_reset(p_business_id uuid, p_key text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.wf_assert_admin();
  update public.workflows set overrides = '{}'::jsonb, updated_at = now() where business_id = p_business_id and system_key = p_key;
  perform public.wf_suite_install_key(p_business_id, p_key, false);
  return public.wf_suite_row(p_business_id, p_key);
end $$;

create or replace function public.wf_suite_install(p_business_id uuid) returns integer
language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.wf_assert_admin();
  return public.wf_install_medspa_suite(p_business_id, false);
end $$;

create or replace function public.wf_suite_preview_data(p_business_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare b record; m record; v_treat text; v_item jsonb; v_offer text; v_rem int; v_c int; v_tz text; v_amt int;
begin
  perform public.wf_assert_admin();
  select * into b from public.businesses where id = p_business_id;
  if b.id is null then raise exception 'business not found'; end if;
  v_tz := public.business_timezone(p_business_id);
  select bm.points_balance, bm.last_visit_at, nullif(split_part(btrim(coalesce(p.full_name,'')), ' ', 1), '') first_name, bm.user_id
    into m from public.business_memberships bm left join public.profiles p on p.id = bm.user_id
   where bm.business_id = p_business_id and bm.status not in ('blocked','canceled') and nullif(btrim(coalesce(p.full_name,'')), '') is not null
   order by coalesce(bm.last_visit_at, bm.joined_at) desc limit 1;
  select l.treatment_name into v_treat from public.medspa_treatment_log l where l.business_id = p_business_id order by l.performed_at desc limit 1;
  v_treat := coalesce(v_treat, (select x->>'name' from jsonb_array_elements(coalesce(b.medspa_config->'treatments','[]'::jsonb)) x where coalesce((x->>'is_active')::boolean,true) limit 1), 'HydraFacial');
  select x into v_item from jsonb_array_elements(coalesce(b.medspa_config->'shop'->'items','[]'::jsonb)) x
   where coalesce((x->>'is_active')::boolean,true) order by coalesce((x->>'featured')::boolean,false) desc limit 1;
  select r.name into v_offer from public.rewards r where r.business_id = p_business_id and r.is_active and r.archived_at is null order by r.point_cost limit 1;
  select min(r.point_cost) - coalesce(m.points_balance, 420) into v_rem from public.rewards r
   where r.business_id = p_business_id and r.is_active and r.archived_at is null and r.point_cost > coalesce(m.points_balance, 420);
  v_c := coalesce((b.medspa_config->'credits'->>'monthly_credit_cents')::int, 0);
  v_amt := (v_item->>'price_cents')::int;
  return jsonb_build_object(
    'sample', jsonb_build_object(
      'first_name', coalesce(m.first_name, 'Jane'),
      'points', coalesce(m.points_balance, 420)::text,
      'points_remaining', coalesce(v_rem, 80)::text,
      'days_since_last_visit', coalesce(extract(day from now() - m.last_visit_at)::int, 92)::text,
      'treatment', v_treat,
      'item', coalesce(v_item->>'name', 'HydraFacial, 3 sessions'),
      'offer_name', coalesce(v_offer, 'a complimentary facial'),
      'business', b.name,
      'price', case when v_amt > 0 then '$' || case when v_amt % 100 = 0 then to_char(v_amt / 100, 'FM999,999') else to_char(v_amt / 100.0, 'FM999,990.00') end end,
      'installment', case when v_amt > 0 then '$' || case when v_amt % 400 = 0 then to_char(v_amt / 400, 'FM999,999') else to_char(v_amt / 400.0, 'FM999,990.00') end end,
      'member_value', case when coalesce((b.medspa_config->'credits'->>'enabled')::boolean, false) and v_c > 0
                           then '$' || to_char(v_c / 100, 'FM999,999') || ' in treatment credit every month ($' || to_char(v_c * 12 / 100, 'FM999,999') || ' a year), plus member pricing'
                           else 'member pricing on every treatment, plus members-only perks' end,
      'due_date', to_char((now() + interval '10 days') at time zone v_tz, 'FMMon FMDD'),
      'appt_time', to_char(((now() at time zone v_tz)::date + 1) + time '14:30', 'FMDay "at" FMHH12:MI am'),
      'friend_bonus', coalesce((b.point_rules->>'referral_referee')::int, 0)::text,
      'link', '/app',
      'item_image', v_item->>'image_url'),
    'brand', jsonb_build_object('name', b.name, 'logo_url', b.logo_url, 'primary', coalesce(b.brand_colors->>'primary', '#2d6a78'), 'hero_url', b.hero_image_url,
                                'address', b.contact_info->>'address'),
    'sender', jsonb_build_object('from_name', regexp_replace(coalesce(b.name, 'Your clinic'), '["<>]', '', 'g'), 'from_address', 'hello@atlas-engine.app',
                                 'reply_to', nullif(btrim(coalesce(b.contact_info->>'email', '')), '')));
end $$;
