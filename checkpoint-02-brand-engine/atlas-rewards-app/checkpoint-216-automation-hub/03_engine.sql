-- CP-216 · Automation Hub · 03 engine: matcher, tick, conditions, adapters, guardrails
-- APPLIED to production Oct 23 2026 (migration cp216_03_engine). Safe to re-run.

create or replace function public.wf_engine_on() returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select value from public.app_settings where key = 'automation_engine'), 'off') = 'on';
$$;

create or replace function public.wf_graph_node(p_graph jsonb, p_id text) returns jsonb language sql immutable as $$
  select n from jsonb_array_elements(coalesce(p_graph->'nodes','[]'::jsonb)) n where n->>'id' = p_id limit 1;
$$;

create or replace function public.wf_trigger_node(p_graph jsonb) returns jsonb language sql immutable as $$
  select n from jsonb_array_elements(coalesce(p_graph->'nodes','[]'::jsonb)) n where n->>'type' like 't.%' limit 1;
$$;

create or replace function public.wf_node_cfg(p_graph jsonb, p_type text) returns jsonb language sql immutable as $$
  select coalesce(n->'config','{}'::jsonb) from jsonb_array_elements(coalesce(p_graph->'nodes','[]'::jsonb)) n where n->>'type' = p_type limit 1;
$$;

-- Next node along an edge. Conditions pass branch yes/no; others pass null (falls back to any edge).
create or replace function public.wf_next_node(p_graph jsonb, p_from text, p_branch text) returns text language sql immutable as $$
  select coalesce(
    (select e->>'to' from jsonb_array_elements(coalesce(p_graph->'edges','[]'::jsonb)) e
      where e->>'from' = p_from and ((p_branch is null and (e->>'branch') is null) or (e->>'branch') = p_branch) limit 1),
    case when p_branch is null then (select e->>'to' from jsonb_array_elements(coalesce(p_graph->'edges','[]'::jsonb)) e where e->>'from' = p_from limit 1) end);
$$;

create or replace function public.wf_random_next(p_graph jsonb, p_from text) returns text language sql volatile as $$
  select e->>'to' from jsonb_array_elements(coalesce(p_graph->'edges','[]'::jsonb)) e where e->>'from' = p_from order by random() limit 1;
$$;

-- Personalisation: {{first_name}} {{points}} {{points_remaining}} {{days_since_last_visit}} {{offer_name}} {{business}} {{treatment}} with {{var|fallback}}
create or replace function public.wf_render(p_text text, p_business_id uuid, p_membership_id uuid, p_extra jsonb default '{}'::jsonb)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare v jsonb; m record; v_out text := coalesce(p_text, ''); r text[]; v_key text; v_fb text; v_val text; v_remaining int;
begin
  select m2.points_balance, m2.last_visit_at, m2.joined_at, p.full_name, b.name as business
    into m from public.business_memberships m2 join public.businesses b on b.id = m2.business_id
    left join public.profiles p on p.id = m2.user_id where m2.id = p_membership_id;
  select min(r2.point_cost) - coalesce(m.points_balance, 0) into v_remaining from public.rewards r2
   where r2.business_id = p_business_id and r2.is_active and r2.archived_at is null and r2.point_cost > coalesce(m.points_balance, 0);
  v := jsonb_build_object(
    'first_name', nullif(split_part(coalesce(m.full_name, ''), ' ', 1), ''),
    'points', coalesce(m.points_balance, 0)::text,
    'points_remaining', coalesce(v_remaining, 0)::text,
    'days_since_last_visit', case when m.last_visit_at is null then null else extract(day from now() - m.last_visit_at)::int::text end,
    'business', m.business) || coalesce(p_extra, '{}'::jsonb);
  for r in select regexp_matches(v_out, '\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\s*\}\}', 'g') loop
    v_key := r[1]; v_fb := r[2];
    v_val := v->>v_key;
    if v_val is null or v_val = '' then
      v_val := coalesce(nullif(v_fb, ''), case v_key when 'first_name' then 'there' when 'offer_name' then 'a surprise' when 'treatment' then 'your treatment' when 'days_since_last_visit' then 'a while' else '' end);
    end if;
    v_out := regexp_replace(v_out, '\{\{\s*' || v_key || '\s*(\|[^}]*)?\s*\}\}', v_val, 'g');
  end loop;
  return v_out;
end $$;

-- Condition evaluator (node config as jsonb)
create or replace function public.wf_cond(p_type text, p_cfg jsonb, p_business_id uuid, p_membership_id uuid) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare m record; v_days int; v_last timestamptz; v int;
begin
  select * into m from public.business_memberships where id = p_membership_id;
  if m.id is null then return false; end if;
  case p_type
    when 'c.visited' then
      v_days := coalesce((p_cfg->>'within_days')::int, 30);
      select greatest(m.last_visit_at, max(c.created_at)) into v_last from public.check_in_events c where c.membership_id = p_membership_id;
      return coalesce(v_last, m.last_visit_at) >= now() - (v_days || ' days')::interval;
    when 'c.points' then
      v := coalesce((p_cfg->>'value')::int, 0);
      return case coalesce(p_cfg->>'op','gte') when 'lt' then m.points_balance < v else m.points_balance >= v end;
    when 'c.new_vs_returning' then
      return case coalesce(p_cfg->>'is','new') when 'new' then coalesce(m.visit_count,0) <= 1 else coalesce(m.visit_count,0) > 1 end;
    when 'c.redeemed' then
      v_days := coalesce((p_cfg->>'within_days')::int, 30);
      return exists (select 1 from public.redemptions r where r.membership_id = p_membership_id and r.created_at >= now() - (v_days || ' days')::interval
                       and (p_cfg->>'reward_id' is null or r.reward_id::text = p_cfg->>'reward_id'));
    when 'c.tier' then return lower(coalesce(m.tier,'')) = lower(coalesce(p_cfg->>'tier',''));
    when 'c.tagged' then return exists (select 1 from public.customer_tags t where t.business_id = p_business_id and t.membership_id = p_membership_id and t.tag = p_cfg->>'tag');
    when 'c.eligible' then
      return not exists (select 1 from public.customer_saved_offers s join public.offers o on o.id = s.offer_id
                          where s.membership_id = p_membership_id and o.welcome_config_id::text = p_cfg->>'offer_config_id');
    when 'c.opened' then return false; -- no open tracking yet
    else return false;
  end case;
end $$;

-- Does a trigger node match an event?
create or replace function public.wf_trigger_matches(p_node jsonb, p_type text, p_payload jsonb) returns boolean language sql immutable as $$
  select case p_node->>'type'
    when 't.signup'         then p_type = 'member.enrolled'
    when 't.checkin'        then p_type = 'checkin.recorded'
    when 't.points'         then p_type = 'points.earned' and coalesce((p_payload->>'balance_after')::int, 0) >= coalesce((p_node->'config'->>'min_balance')::int, 0)
    when 't.redeem'         then p_type = 'reward.redeemed'
    when 't.streak_hit'     then p_type = 'streak.milestone'
    when 't.streak_break'   then p_type = 'streak.broken'
    when 't.inactive'       then p_type = 'inactivity.' || coalesce((p_node->'config'->>'days')::int, 14)::text
    when 't.booking'        then p_type = 'booking.' || coalesce(p_node->'config'->>'status', 'created')
    when 't.booking_cancel' then p_type = 'booking.cancelled'
    when 't.purchase'       then p_type = 'purchase.recorded'
    when 't.spend'          then p_type = 'purchase.recorded'
    when 't.birthday'       then p_type = 'birthday'
    when 't.anniversary'    then p_type = 'anniversary'
    when 't.tier'           then p_type = 'tier.changed'
    when 't.recall'         then p_type = 'recall.due'
    when 't.treatment'      then p_type = 'treatment.logged'
    when 't.membership'     then p_type = 'membership.activated'
    when 't.review'         then p_type = 'review.verified'
    when 't.referral'       then p_type = 'referral.completed'
    else false end;
$$;

create or replace function public.wf_log_step(p_run_id uuid, p_node_id text, p_node_type text, p_result text, p_detail jsonb) returns void
language sql security definer set search_path to 'public' as $$
  insert into public.workflow_run_steps (run_id, node_id, node_type, result, detail) values (p_run_id, p_node_id, p_node_type, p_result, coalesce(p_detail,'{}'::jsonb));
$$;

-- Open a run for a member in a workflow (used by the matcher and a.enroll). Returns run id or null.
create or replace function public.wf_open_run(p_workflow_id uuid, p_membership_id uuid, p_event_id bigint, p_reason text) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare w record; g jsonb; t jsonb; v_run uuid; v_reentry int; v_family text;
begin
  select w2.*, v.graph into w from public.workflows w2 join public.workflow_versions v on v.id = w2.current_version_id where w2.id = p_workflow_id;
  if w.id is null or w.status not in ('active','testing') then return null; end if;
  g := w.graph; t := public.wf_trigger_node(g);
  if t is null then return null; end if;
  v_reentry := coalesce((public.wf_node_cfg(g, 'w.no_reentry')->>'days')::int, w.reentry_days, 30);
  v_family := coalesce(w.family, 'wf:' || w.id::text);
  -- one open run per workflow per member
  if exists (select 1 from public.workflow_runs r where r.workflow_id = w.id and r.membership_id = p_membership_id and r.status in ('running','waiting')) then return null; end if;
  -- re-entry window
  if exists (select 1 from public.workflow_runs r where r.workflow_id = w.id and r.membership_id = p_membership_id and r.entered_at > now() - (v_reentry || ' days')::interval) then return null; end if;
  -- family overlap: one open run per family per member across workflows
  if exists (select 1 from public.workflow_runs r join public.workflows w3 on w3.id = r.workflow_id
              where r.membership_id = p_membership_id and r.status in ('running','waiting') and coalesce(w3.family, 'wf:' || w3.id::text) = v_family) then return null; end if;
  insert into public.workflow_runs (workflow_id, version_id, business_id, membership_id, status, current_node_id, wake_at, entry_event_id, goal)
  values (w.id, w.current_version_id, w.business_id, p_membership_id, 'running', t->>'id', now(), p_event_id, public.wf_node_cfg(g, 'w.stop_on_convert')->>'goal')
  on conflict do nothing returning id into v_run;
  if v_run is not null then
    perform public.wf_log_step(v_run, t->>'id', t->>'type', 'ok', jsonb_build_object('entered_by', p_reason, 'event_id', p_event_id));
  end if;
  return v_run;
end $$;

-- AFTER INSERT on customer_events: convert goals, then open runs.
create or replace function public.wf_match_event() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare s record; m record; w record; t jsonb; r record; v_goal_type text;
begin
  begin
    if not public.wf_engine_on() or new.membership_id is null then return new; end if;
    select * into s from public.business_automation_settings where business_id = new.business_id;
    if s.business_id is null or not s.enabled then return new; end if;
    select * into m from public.business_memberships where id = new.membership_id;
    if m.id is null or m.status in ('blocked','canceled') then return new; end if;

    -- goals: stop_on_convert
    for r in select r2.* from public.workflow_runs r2 where r2.membership_id = m.id and r2.status in ('running','waiting') and r2.goal is not null loop
      v_goal_type := case r.goal when 'checkin' then 'checkin.recorded' when 'redeem' then 'reward.redeemed' when 'purchase' then 'purchase.recorded' when 'booking' then 'booking.created' else r.goal end;
      if new.type = v_goal_type then
        update public.workflow_runs set status = 'exited', exited_at = now(), exit_reason = 'converted' where id = r.id;
        perform public.wf_log_step(r.id, coalesce(r.current_node_id,'-'), 'goal', 'exit', jsonb_build_object('converted_by', new.type, 'event_id', new.id));
      end if;
    end loop;

    -- open runs
    for w in select w2.id, w2.status, v.graph from public.workflows w2 join public.workflow_versions v on v.id = w2.current_version_id
              where w2.business_id = new.business_id and w2.status in ('active','testing') loop
      if w.status = 'testing' and not (m.id = any(s.test_membership_ids)) then continue; end if;
      if w.status = 'active' and coalesce(m.is_demo, false) and not (m.id = any(s.test_membership_ids)) then continue; end if;
      t := public.wf_trigger_node(w.graph);
      if t is not null and public.wf_trigger_matches(t, new.type, new.payload) then
        if t->>'type' = 't.spend' then
          if coalesce((select sum(e.amount_cents) from public.events e where e.membership_id = m.id and e.event_type = 'purchase'), 0)
             + coalesce((select sum(o.amount_cents) from public.medspa_shop_orders o where o.business_id = new.business_id and o.user_id = m.user_id and o.status in ('paid','fulfilled')), 0)
             < coalesce((t->'config'->>'min_cents')::int, 0) then continue; end if;
        end if;
        perform public.wf_open_run(w.id, m.id, new.id, 'event:' || new.type);
      end if;
    end loop;
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_match_event after insert on public.customer_events for each row execute function public.wf_match_event();

-- Guardrail: messaging allowed for this member right now? null = yes, else reason
create or replace function public.wf_msg_block(p_business_id uuid, p_membership_id uuid) returns text
language plpgsql stable security definer set search_path to 'public' as $$
declare m record; s record; pr record; v_cnt int;
begin
  select * into m from public.business_memberships where id = p_membership_id;
  if m.id is null or m.status in ('blocked','canceled') then return 'blocked'; end if;
  select * into pr from public.member_comm_prefs where membership_id = p_membership_id;
  if pr.paused_until is not null and pr.paused_until > now() then return 'paused'; end if;
  select * into s from public.business_automation_settings where business_id = p_business_id;
  select count(*) into v_cnt from public.notifications n
   where n.user_id = m.user_id and n.business_id = p_business_id and n.created_at > now() - interval '7 days'
     and (n.source = 'workflow' or n.kind in ('check_in_available','reward_expiration','we_miss_you','customer_offer','automated_offer','streak','review_request','birthday','announcement'));
  if v_cnt >= coalesce(s.max_msgs_per_member_per_week, 3) then return 'frequency_cap'; end if;
  return null;
end $$;

-- Guardrail: quiet hours. Returns null when sending now is fine, else the next allowed moment.
create or replace function public.wf_quiet_until(p_business_id uuid) returns timestamptz
language plpgsql stable security definer set search_path to 'public' as $$
declare s record; v_tz text; v_local timestamp; v_start time; v_end time; v_t time;
begin
  select * into s from public.business_automation_settings where business_id = p_business_id;
  v_start := coalesce(s.quiet_start, time '10:00'); v_end := coalesce(s.quiet_end, time '20:00');
  v_tz := public.business_timezone(p_business_id);
  v_local := now() at time zone v_tz; v_t := v_local::time;
  if v_t >= v_start and v_t < v_end then return null; end if;
  if v_t < v_start then return (v_local::date + v_start) at time zone v_tz; end if;
  return ((v_local::date + 1) + v_start) at time zone v_tz;
end $$;

-- ───────────── adapters: each returns {result, detail} and must be idempotent on run:node ─────────────
create or replace function public.wf_act_push(p_run public.workflow_runs, p_node jsonb, p_family text, p_test boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare m record; v_title text; v_body text; v_key text; v_id uuid;
begin
  select * into m from public.business_memberships where id = p_run.membership_id;
  v_key := 'wf:' || p_run.id || ':' || (p_node->>'id');
  if exists (select 1 from public.notifications where idempotency_key = v_key) then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','already_sent')); end if;
  v_title := public.wf_render(coalesce(p_node->'config'->>'title', 'A message from {{business}}'), p_run.business_id, p_run.membership_id);
  v_body  := public.wf_render(coalesce(p_node->'config'->>'body', ''), p_run.business_id, p_run.membership_id);
  if p_test then v_title := '[TEST] ' || v_title; end if;
  insert into public.notifications (user_id, business_id, kind, title, body, link_path, source, family, workflow_run_id, workflow_node_id, idempotency_key)
  values (m.user_id, p_run.business_id, 'generic', v_title, v_body, coalesce(p_node->'config'->>'link_path', '/app'), 'workflow', p_family, p_run.id, p_node->>'id', v_key)
  on conflict (idempotency_key) where idempotency_key is not null do nothing returning id into v_id;
  if v_id is null then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','gate','title',v_title)); end if;
  return jsonb_build_object('result','ok','detail',jsonb_build_object('channel','push','title',v_title,'body',v_body,'notification_id',v_id));
end $$;

create or replace function public.wf_act_points(p_run public.workflow_runs, p_node jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_pts int; v_key text; v_bal int; v_note text;
begin
  v_pts := coalesce((p_node->'config'->>'points')::int, 0);
  if v_pts <= 0 then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','no_points')); end if;
  v_key := 'wf:' || p_run.id || ':' || (p_node->>'id');
  if exists (select 1 from public.points_ledger where idempotency_key = v_key) then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','already_awarded')); end if;
  v_note := coalesce(nullif(p_node->'config'->>'note',''), 'Bonus points');
  update public.business_memberships set points_balance = points_balance + v_pts, lifetime_points_earned = lifetime_points_earned + v_pts, updated_at = now()
   where id = p_run.membership_id returning points_balance into v_bal;
  insert into public.points_ledger (membership_id, business_id, delta, rule_type, reference_id, idempotency_key, balance_after, notes)
  values (p_run.membership_id, p_run.business_id, v_pts, 'workflow_bonus', p_run.workflow_id, v_key, v_bal, v_note);
  begin perform public.recalc_tier(p_run.membership_id); exception when others then null; end;
  return jsonb_build_object('result','ok','detail',jsonb_build_object('points',v_pts,'balance_after',v_bal));
end $$;

-- Unlock a reward: a free pending redemption with a desk code (shows under Ready to use)
create or replace function public.wf_act_unlock(p_run public.workflow_runs, p_node jsonb, p_family text, p_test boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare m record; rw record; v_code text; v_exp timestamptz; v_key text; v_title text; v_rid uuid;
begin
  select * into m from public.business_memberships where id = p_run.membership_id;
  select * into rw from public.rewards where id = (p_node->'config'->>'reward_id')::uuid and business_id = p_run.business_id;
  if rw.id is null then return jsonb_build_object('result','error','detail',jsonb_build_object('reason','reward_not_found')); end if;
  v_key := 'wf:' || p_run.id || ':' || (p_node->>'id');
  if exists (select 1 from public.notifications where idempotency_key = v_key) then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','already_unlocked')); end if;
  v_exp := now() + (greatest(1, coalesce((p_node->'config'->>'expires_days')::int, 14)) || ' days')::interval;
  v_code := public.generate_redemption_code(p_run.business_id);
  insert into public.redemptions (membership_id, reward_id, business_id, point_cost, code, status, expires_at)
  values (p_run.membership_id, rw.id, p_run.business_id, 0, v_code, 'pending', v_exp) returning id into v_rid;
  v_title := (case when p_test then '[TEST] ' else '' end) || '🎁 ' || rw.name || ' is yours';
  insert into public.notifications (user_id, business_id, kind, title, body, link_path, source, family, workflow_run_id, workflow_node_id, idempotency_key)
  values (m.user_id, p_run.business_id, 'generic', v_title, 'Show the code at the front desk. Expires ' || to_char(v_exp at time zone public.business_timezone(p_run.business_id), 'Mon DD') || '.', '/app/rewards', 'workflow', p_family, p_run.id, p_node->>'id', v_key)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
  return jsonb_build_object('result','ok','detail',jsonb_build_object('reward',rw.name,'redemption_id',v_rid,'expires_at',v_exp,'title',v_title));
end $$;

-- Personalised offer on Home (the win-back banner), same shape as send_winback_v2 without the staff check
create or replace function public.wf_act_offer(p_run public.workflow_runs, p_node jsonb, p_family text, p_test boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare m record; v_title text; v_body text; v_exp timestamptz; v_key text; v_pts int; v_bal int; v_rname text; v_code text; v_rid uuid; v_msg uuid; v_nid uuid;
begin
  select * into m from public.business_memberships where id = p_run.membership_id;
  v_key := 'wf:' || p_run.id || ':' || (p_node->>'id');
  if exists (select 1 from public.notifications where idempotency_key = v_key) then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','already_sent')); end if;
  v_title := (case when p_test then '[TEST] ' else '' end) || public.wf_render(coalesce(p_node->'config'->>'title','We miss you ✨'), p_run.business_id, p_run.membership_id);
  v_body  := public.wf_render(coalesce(p_node->'config'->>'body','Come back soon — something is waiting for you.'), p_run.business_id, p_run.membership_id);
  v_exp := now() + (greatest(1, coalesce((p_node->'config'->>'expires_days')::int, 7)) || ' days')::interval;
  v_pts := coalesce((p_node->'config'->>'bonus_points')::int, 0);
  v_rid := (p_node->'config'->>'reward_id')::uuid;
  insert into public.customer_messages (business_id, membership_id, kind, title, body, bonus_points, expires_at)
  values (p_run.business_id, p_run.membership_id, 'winback', v_title, v_body, nullif(v_pts,0), v_exp) returning id into v_msg;
  if v_rid is not null then
    select name into v_rname from public.rewards where id = v_rid and business_id = p_run.business_id and archived_at is null;
    if v_rname is not null then
      v_code := public.generate_redemption_code(p_run.business_id);
      insert into public.redemptions (membership_id, reward_id, business_id, point_cost, code, status, expires_at)
      values (p_run.membership_id, v_rid, p_run.business_id, 0, v_code, 'pending', v_exp);
    end if;
  end if;
  if v_pts > 0 and not exists (select 1 from public.points_ledger where idempotency_key = v_key) then
    update public.business_memberships set points_balance = points_balance + v_pts, lifetime_points_earned = lifetime_points_earned + v_pts, updated_at = now()
     where id = p_run.membership_id returning points_balance into v_bal;
    insert into public.points_ledger (business_id, membership_id, delta, rule_type, reference_id, idempotency_key, balance_after, notes)
    values (p_run.business_id, p_run.membership_id, v_pts, 'winback_bonus', p_run.workflow_id, v_key, v_bal, v_title);
    begin perform public.recalc_tier(p_run.membership_id); exception when others then null; end;
  end if;
  insert into public.notifications (user_id, business_id, kind, title, body, link_path, source, family, workflow_run_id, workflow_node_id, idempotency_key)
  values (m.user_id, p_run.business_id, 'we_miss_you', v_title,
          case when v_rname is not null and v_pts > 0 then v_rname || ' + ' || v_pts || ' pts are yours — expires ' || to_char(v_exp at time zone public.business_timezone(p_run.business_id), 'Mon DD') || '.'
               when v_rname is not null then v_rname || ' is waiting for you, free — expires ' || to_char(v_exp at time zone public.business_timezone(p_run.business_id), 'Mon DD') || '.'
               when v_pts > 0 then '+' || v_pts || ' pts added. ' || v_body
               else v_body end,
          '/app/rewards', 'workflow', coalesce(p_family,'winback'), p_run.id, p_node->>'id', v_key)
  on conflict (idempotency_key) where idempotency_key is not null do nothing returning id into v_nid;
  return jsonb_build_object('result','ok','detail',jsonb_build_object('channel','offer','title',v_title,'body',v_body,'bonus_points',v_pts,'reward',v_rname,'message_id',v_msg,'notification_id',v_nid));
end $$;

create or replace function public.wf_act_tag(p_run public.workflow_runs, p_node jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_tag text;
begin
  v_tag := nullif(btrim(p_node->'config'->>'tag'), '');
  if v_tag is null then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','no_tag')); end if;
  if coalesce((p_node->'config'->>'remove')::boolean, false) then
    delete from public.customer_tags where business_id = p_run.business_id and membership_id = p_run.membership_id and tag = v_tag;
    return jsonb_build_object('result','ok','detail',jsonb_build_object('removed',v_tag));
  end if;
  insert into public.customer_tags (business_id, membership_id, tag, source_run_id) values (p_run.business_id, p_run.membership_id, v_tag, p_run.id) on conflict do nothing;
  return jsonb_build_object('result','ok','detail',jsonb_build_object('tag',v_tag));
end $$;

create or replace function public.wf_act_notify_admin(p_run public.workflow_runs, p_node jsonb, p_test boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare u record; v_title text; v_body text; v_n int := 0; m record;
begin
  select m2.*, p.full_name into m from public.business_memberships m2 left join public.profiles p on p.id = m2.user_id where m2.id = p_run.membership_id;
  v_title := (case when p_test then '[TEST] ' else '' end) || public.wf_render(coalesce(p_node->'config'->>'title','Automation alert'), p_run.business_id, p_run.membership_id, jsonb_build_object('member', coalesce(m.full_name,'A member')));
  v_body  := public.wf_render(coalesce(p_node->'config'->>'body','{{first_name}} hit this step.'), p_run.business_id, p_run.membership_id, jsonb_build_object('member', coalesce(m.full_name,'A member')));
  for u in select bu.user_id from public.business_users bu where bu.business_id = p_run.business_id and bu.role = 'business_manager' loop
    insert into public.notifications (user_id, business_id, kind, title, body, link_path, source, workflow_run_id, workflow_node_id, idempotency_key)
    values (u.user_id, p_run.business_id, 'generic', v_title, v_body, '/manage', 'workflow', p_run.id, p_node->>'id', 'wf:' || p_run.id || ':' || (p_node->>'id') || ':' || u.user_id)
    on conflict (idempotency_key) where idempotency_key is not null do nothing;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('result', case when v_n > 0 then 'ok' else 'skipped' end, 'detail', jsonb_build_object('managers', v_n, 'title', v_title));
end $$;

create or replace function public.wf_act_enroll(p_run public.workflow_runs, p_node jsonb) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare v_wf uuid; v_run uuid;
begin
  v_wf := (p_node->'config'->>'workflow_id')::uuid;
  if v_wf is null then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','no_workflow')); end if;
  if coalesce((p_node->'config'->>'remove')::boolean, false) then
    update public.workflow_runs set status = 'exited', exited_at = now(), exit_reason = 'removed_by:' || p_run.workflow_id where workflow_id = v_wf and membership_id = p_run.membership_id and status in ('running','waiting');
    return jsonb_build_object('result','ok','detail',jsonb_build_object('removed_from',v_wf));
  end if;
  v_run := public.wf_open_run(v_wf, p_run.membership_id, null, 'enrolled_by:' || p_run.workflow_id);
  return jsonb_build_object('result', case when v_run is null then 'skipped' else 'ok' end, 'detail', jsonb_build_object('workflow_id', v_wf, 'run_id', v_run));
end $$;

-- ───────────── the step loop ─────────────
-- Advances one run up to p_max nodes. p_dry = simulation (waits pass instantly, quiet hours ignored).
create or replace function public.wf_advance_run(p_run_id uuid, p_max int default 50, p_dry boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare r public.workflow_runs; w record; g jsonb; n jsonb; v_type text; v_id text; v_next text; v_res jsonb; v_out jsonb := '[]'::jsonb;
        i int := 0; v_family text; v_test boolean; v_block text; v_quiet timestamptz; v_min int; v_cond boolean; v_until timestamptz; v_branch text;
begin
  select * into r from public.workflow_runs where id = p_run_id for update;
  if r.id is null or r.status not in ('running','waiting') then return v_out; end if;
  select w2.*, v.graph into w from public.workflows w2 join public.workflow_versions v on v.id = r.version_id where w2.id = r.workflow_id;
  g := w.graph; v_family := coalesce(w.family, 'wf:' || w.id::text); v_test := (w.status = 'testing');
  if w.status not in ('active','testing') and not p_dry then return v_out; end if;

  while i < p_max loop
    i := i + 1;
    if r.current_node_id is null then
      update public.workflow_runs set status = 'done', exited_at = now(), exit_reason = 'end' where id = r.id; exit;
    end if;
    n := public.wf_graph_node(g, r.current_node_id);
    if n is null then
      update public.workflow_runs set status = 'error', last_error = 'node not found: ' || r.current_node_id, exited_at = now() where id = r.id;
      perform public.wf_log_step(r.id, r.current_node_id, '?', 'error', jsonb_build_object('error','node_not_found')); exit;
    end if;
    v_type := n->>'type'; v_id := n->>'id';
    if r.steps_taken >= 500 then
      update public.workflow_runs set status = 'error', last_error = 'step limit', exited_at = now() where id = r.id;
      perform public.wf_log_step(r.id, v_id, v_type, 'error', jsonb_build_object('error','step_limit')); exit;
    end if;

    begin
      v_next := null; v_res := null;
      if v_type like 't.%' or v_type in ('w.no_reentry','w.cap') then
        v_next := public.wf_next_node(g, v_id, null);
        if v_type not like 't.%' then perform public.wf_log_step(r.id, v_id, v_type, 'ok', '{}'::jsonb); end if;

      elsif v_type like 'c.%' then
        v_cond := public.wf_cond(v_type, coalesce(n->'config','{}'::jsonb), r.business_id, r.membership_id);
        v_branch := case when v_cond then 'yes' else 'no' end;
        perform public.wf_log_step(r.id, v_id, v_type, v_branch, jsonb_build_object('config', n->'config'));
        v_next := public.wf_next_node(g, v_id, v_branch);

      elsif v_type = 'w.exit' then
        update public.workflow_runs set status = 'done', exited_at = now(), exit_reason = 'exit', current_node_id = v_id where id = r.id;
        perform public.wf_log_step(r.id, v_id, v_type, 'exit', '{}'::jsonb);
        v_out := v_out || jsonb_build_object('node_id', v_id, 'node_type', v_type, 'result', 'exit'); exit;

      elsif v_type = 'w.stop_on_convert' then
        update public.workflow_runs set goal = coalesce(n->'config'->>'goal','checkin') where id = r.id;
        perform public.wf_log_step(r.id, v_id, v_type, 'ok', jsonb_build_object('goal', n->'config'->>'goal'));
        v_next := public.wf_next_node(g, v_id, null);

      elsif v_type = 'w.split' then
        v_next := public.wf_random_next(g, v_id);
        perform public.wf_log_step(r.id, v_id, v_type, 'ok', jsonb_build_object('to', v_next));

      elsif v_type = 'w.wait' then
        v_min := greatest(1, coalesce((n->'config'->>'minutes')::int, 1440));
        if p_dry then
          perform public.wf_log_step(r.id, v_id, v_type, 'ok', jsonb_build_object('simulated_wait_minutes', v_min));
          v_next := public.wf_next_node(g, v_id, null);
        elsif r.waiting_since is null then
          update public.workflow_runs set status = 'waiting', waiting_since = now(), wake_at = now() + (v_min || ' minutes')::interval, steps_taken = steps_taken + 1 where id = r.id;
          perform public.wf_log_step(r.id, v_id, v_type, 'waiting', jsonb_build_object('minutes', v_min, 'until', now() + (v_min || ' minutes')::interval));
          v_out := v_out || jsonb_build_object('node_id', v_id, 'node_type', v_type, 'result', 'waiting'); exit;
        else
          perform public.wf_log_step(r.id, v_id, v_type, 'ok', jsonb_build_object('waited_minutes', v_min));
          v_next := public.wf_next_node(g, v_id, null);
        end if;

      elsif v_type = 'w.until_date' then
        v_until := (n->'config'->>'at')::timestamptz;
        if not p_dry and v_until is not null and v_until > now() and r.waiting_since is null then
          update public.workflow_runs set status = 'waiting', waiting_since = now(), wake_at = v_until, steps_taken = steps_taken + 1 where id = r.id;
          perform public.wf_log_step(r.id, v_id, v_type, 'waiting', jsonb_build_object('until', v_until));
          v_out := v_out || jsonb_build_object('node_id', v_id, 'node_type', v_type, 'result', 'waiting'); exit;
        end if;
        perform public.wf_log_step(r.id, v_id, v_type, 'ok', jsonb_build_object('at', v_until));
        v_next := public.wf_next_node(g, v_id, null);

      elsif v_type = 'w.until' then
        v_cond := public.wf_cond(coalesce(n->'config'->'condition'->>'type','c.visited'), coalesce(n->'config'->'condition'->'config','{}'::jsonb), r.business_id, r.membership_id);
        v_min := greatest(5, coalesce((n->'config'->>'timeout_minutes')::int, 10080));
        if v_cond then
          perform public.wf_log_step(r.id, v_id, v_type, 'yes', '{}'::jsonb); v_next := public.wf_next_node(g, v_id, 'yes');
        elsif p_dry or (r.waiting_since is not null and r.waiting_since + (v_min || ' minutes')::interval < now()) then
          perform public.wf_log_step(r.id, v_id, v_type, 'no', jsonb_build_object('timed_out', true)); v_next := public.wf_next_node(g, v_id, 'no');
        else
          if r.waiting_since is null then perform public.wf_log_step(r.id, v_id, v_type, 'waiting', jsonb_build_object('timeout_minutes', v_min)); end if;
          update public.workflow_runs set status = 'waiting', waiting_since = coalesce(waiting_since, now()), wake_at = now() + interval '15 minutes', steps_taken = steps_taken + 1 where id = r.id;
          v_out := v_out || jsonb_build_object('node_id', v_id, 'node_type', v_type, 'result', 'waiting'); exit;
        end if;

      elsif v_type in ('a.push','a.offer','a.unlock') then
        v_block := public.wf_msg_block(r.business_id, r.membership_id);
        v_quiet := case when p_dry then null else public.wf_quiet_until(r.business_id) end;
        if v_block is not null then
          v_res := jsonb_build_object('result','skipped','detail',jsonb_build_object('reason', v_block));
        elsif v_quiet is not null then
          update public.workflow_runs set status = 'waiting', waiting_since = coalesce(waiting_since, now()), wake_at = v_quiet where id = r.id;
          if r.waiting_since is null then perform public.wf_log_step(r.id, v_id, v_type, 'deferred', jsonb_build_object('until', v_quiet, 'reason','quiet_hours')); end if;
          v_out := v_out || jsonb_build_object('node_id', v_id, 'node_type', v_type, 'result', 'deferred', 'until', v_quiet); exit;
        else
          v_res := case v_type when 'a.push' then public.wf_act_push(r, n, v_family, v_test)
                               when 'a.offer' then public.wf_act_offer(r, n, v_family, v_test)
                               else public.wf_act_unlock(r, n, v_family, v_test) end;
        end if;
        perform public.wf_log_step(r.id, v_id, v_type, v_res->>'result', coalesce(v_res->'detail','{}'::jsonb));
        if v_res->>'result' = 'error' then raise exception 'adapter error: %', v_res->'detail'; end if;
        v_next := public.wf_next_node(g, v_id, null);

      elsif v_type = 'a.points' then
        v_res := public.wf_act_points(r, n);
        perform public.wf_log_step(r.id, v_id, v_type, v_res->>'result', coalesce(v_res->'detail','{}'::jsonb));
        v_next := public.wf_next_node(g, v_id, null);
      elsif v_type = 'a.tag' then
        v_res := public.wf_act_tag(r, n);
        perform public.wf_log_step(r.id, v_id, v_type, v_res->>'result', coalesce(v_res->'detail','{}'::jsonb));
        v_next := public.wf_next_node(g, v_id, null);
      elsif v_type = 'a.notify_admin' then
        v_res := public.wf_act_notify_admin(r, n, v_test);
        perform public.wf_log_step(r.id, v_id, v_type, v_res->>'result', coalesce(v_res->'detail','{}'::jsonb));
        v_next := public.wf_next_node(g, v_id, null);
      elsif v_type = 'a.enroll' then
        v_res := case when p_dry then jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','dry_run')) else public.wf_act_enroll(r, n) end;
        perform public.wf_log_step(r.id, v_id, v_type, v_res->>'result', coalesce(v_res->'detail','{}'::jsonb));
        v_next := public.wf_next_node(g, v_id, null);
      elsif v_type = 'a.email' then
        v_res := jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','needs_setup','note','Email consent + templates are not live yet'));
        perform public.wf_log_step(r.id, v_id, v_type, 'skipped', v_res->'detail'); v_next := public.wf_next_node(g, v_id, null);
      elsif v_type in ('a.sms','a.segment') then
        v_res := jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','coming_soon'));
        perform public.wf_log_step(r.id, v_id, v_type, 'skipped', v_res->'detail'); v_next := public.wf_next_node(g, v_id, null);
      else
        v_res := jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','unknown_node_type'));
        perform public.wf_log_step(r.id, v_id, v_type, 'skipped', v_res->'detail'); v_next := public.wf_next_node(g, v_id, null);
      end if;

      v_out := v_out || jsonb_build_object('node_id', v_id, 'node_type', v_type, 'result', coalesce(v_res->>'result', case when v_type like 'c.%' then v_branch else 'ok' end), 'detail', coalesce(v_res->'detail', '{}'::jsonb), 'next', v_next);
      update public.workflow_runs set current_node_id = v_next, waiting_since = null, attempt = 0, status = 'running', steps_taken = steps_taken + 1,
             wake_at = now(), exited_at = case when v_next is null then now() else null end,
             exit_reason = case when v_next is null then 'end' else null end where id = r.id returning * into r;
      if v_next is null then update public.workflow_runs set status = 'done' where id = r.id; exit; end if;

    exception when others then
      if p_dry then raise; end if;
      update public.workflow_runs set attempt = attempt + 1, last_error = left(sqlerrm, 500),
             wake_at = now() + case attempt when 0 then interval '1 minute' when 1 then interval '10 minutes' else interval '1 hour' end,
             status = case when attempt >= 2 then 'error' else 'waiting' end,
             exited_at = case when attempt >= 2 then now() else null end where id = r.id;
      perform public.wf_log_step(r.id, v_id, v_type, 'error', jsonb_build_object('error', left(sqlerrm, 500), 'attempt', r.attempt + 1));
      v_out := v_out || jsonb_build_object('node_id', v_id, 'node_type', v_type, 'result', 'error', 'detail', jsonb_build_object('error', left(sqlerrm, 500)));
      exit;
    end;
  end loop;
  return v_out;
end $$;

-- The minute job
create or replace function public.wf_tick(p_limit int default 500) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare r record; v_n int := 0;
begin
  if not public.wf_engine_on() then return 0; end if;
  for r in
    select run.id from public.workflow_runs run
      join public.business_automation_settings s on s.business_id = run.business_id and s.enabled
      join public.workflows w on w.id = run.workflow_id and w.status in ('active','testing')
     where run.status in ('running','waiting') and run.wake_at <= now()
     order by run.wake_at limit p_limit
     for update of run skip locked
  loop
    perform public.wf_advance_run(r.id, 50, false);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
