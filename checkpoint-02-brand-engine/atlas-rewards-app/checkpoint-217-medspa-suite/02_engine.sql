-- CP-217 · Med Spa Automation Suite · 02 engine extensions (create or replace only, safe to re-run)
--
-- New node types (all usable in custom workflows too):
--   t.event        {events: [type,...], entry_if?: [...]}      generic trigger on any customer_events type
--   (any trigger)  config.entry_if: [{type: c.*, config?, negate?, on?: event type}]
--                  every listed condition must pass for the run to open ("on" scopes it to one entry event type)
--   c.since_entry  {events: [...], same_item?}   one of these events happened since the member entered
--   c.entry_event  {event: type | [types]}       which event opened this run
--   c.in_journey   {key: system_key}             member has an open run in that suite journey
--   c.paid_member  {}                            paid membership, not expired
--   c.reviewed     {}                            a review submitted (pending or verified)
--   c.visit_count  {op: eq|gte|lt, value}        completed visits
--   c.app_active   {within_days}                 opened the app / read a message / visited within N days
--   c.can_afford   {}                            balance covers at least one active reward
--   c.booked_ahead {}                            has an upcoming booking
--   c.feature      {feature}                     businesses.widget_config->>feature = 'true' (reviews, referrals)
--   every condition accepts negate: true
--   w.at           {anchor: booking | <payload key, e.g. due_at>, offset_minutes, late_minutes?}
--                  waits until the anchor time + offset; branch "no" when the moment has passed (+late) or
--                  the booking was cancelled; "yes" otherwise. Booking anchors re-read bookings.scheduled_at.
--   w.exit         {reason?}  ('converted' counts as a conversion)
--   a.email        {subject, preheader, heading, body, cta_label, cta_path, footnote, hero?: item}  → email_outbox
--   message nodes: transactional: true (skips the weekly cap; family 'booking' is also outside the F11 push budget)
--                  bonus_from: node:<id> | rule:<point_rules key>   resolves {{bonus}}
-- New variables: {{item}} {{price}} {{installment}} {{member_value}} {{bonus}} {{friend_bonus}} {{due_date}} {{appt_time}} {{link}}

-- ───────── audience guard: may this member be reached by an ACTIVE workflow? null = yes ─────────
create or replace function public.wf_member_allowed(p_business_id uuid, p_membership_id uuid) returns text
language plpgsql stable security definer set search_path to 'public' as $$
declare s record; b record; m record; v_aud text;
begin
  select * into m from public.business_memberships where id = p_membership_id;
  if m.id is null then return 'no_member'; end if;
  select * into s from public.business_automation_settings where business_id = p_business_id;
  if m.id = any(coalesce(s.test_membership_ids, '{}')) then return null; end if;
  if coalesce(m.is_demo, false) then return 'demo_member'; end if;
  select is_demo, medspa_config into b from public.businesses where id = p_business_id;
  v_aud := case coalesce(s.audience, 'auto')
             when 'live' then 'live' when 'test' then 'test'
             else case when coalesce(b.is_demo, false) or coalesce(b.medspa_config->>'example', '') = 'true' then 'test' else 'live' end end;
  if v_aud = 'test' then return 'test_audience'; end if;
  return null;
end $$;

-- ───────── points shown in a message ({{bonus}}) ─────────
create or replace function public.wf_msg_bonus(p_node jsonb, p_graph jsonb, p_business_id uuid) returns int
language plpgsql stable security definer set search_path to 'public' as $$
declare v_src text; v_n jsonb; v int;
begin
  v_src := p_node->'config'->>'bonus_from';
  if v_src like 'node:%' then
    v_n := public.wf_graph_node(p_graph, substr(v_src, 6));
    v := coalesce((v_n->'config'->>'points')::int, (v_n->'config'->>'bonus_points')::int);
  elsif v_src like 'rule:%' then
    select (point_rules->>substr(v_src, 6))::int into v from public.businesses where id = p_business_id;
  end if;
  return coalesce(v, (p_node->'config'->>'bonus')::int);
end $$;

-- ───────── run context: variables that come from the entry event / business ─────────
create or replace function public.wf_run_ctx(p_run public.workflow_runs, p_node jsonb, p_graph jsonb) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare e record; b record; m record; v jsonb; it jsonb; v_amt int; v_tz text; v_bk record; v_c int; v_t text; v_bonus int;
begin
  select type, payload into e from public.customer_events where id = p_run.entry_event_id;
  select * into b from public.businesses where id = p_run.business_id;
  select * into m from public.business_memberships where id = p_run.membership_id;
  v_tz := public.business_timezone(p_run.business_id);
  v := jsonb_strip_nulls(jsonb_build_object(
    'item',       coalesce(e.payload->>'item', e.payload->>'item_name'),
    'treatment',  coalesce(e.payload->>'treatment', e.payload->>'service'),
    'offer_name', coalesce(e.payload->>'offer_name', e.payload->>'title'),
    'link',       e.payload->>'link_path'));
  if v->>'treatment' is null then
    select l.treatment_name into v_t from public.medspa_treatment_log l
     where l.business_id = p_run.business_id and l.user_id = m.user_id order by l.performed_at desc limit 1;
    if v_t is not null then v := v || jsonb_build_object('treatment', v_t); end if;
  end if;
  if e.payload ? 'item_id' then
    select x into it from jsonb_array_elements(coalesce(b.medspa_config->'shop'->'items', '[]'::jsonb)) x where x->>'id' = e.payload->>'item_id' limit 1;
    if it is not null then
      v := v || jsonb_strip_nulls(jsonb_build_object('item', coalesce(v->>'item', it->>'name'), 'item_image', it->>'image_url'));
    end if;
  end if;
  v_amt := coalesce((e.payload->>'amount_cents')::int, (it->>'price_cents')::int);
  if coalesce(v_amt, 0) > 0 then
    v := v || jsonb_build_object(
      'price', '$' || case when v_amt % 100 = 0 then to_char(v_amt / 100, 'FM999,999') else to_char(v_amt / 100.0, 'FM999,990.00') end,
      'installment', '$' || case when v_amt % 400 = 0 then to_char(v_amt / 400, 'FM999,999') else to_char(v_amt / 400.0, 'FM999,990.00') end);
  end if;
  if v->>'offer_name' is null then
    select r.name into v_t from public.rewards r where r.business_id = p_run.business_id and r.is_active and r.archived_at is null
       and r.point_cost <= coalesce(m.points_balance, 0) order by r.point_cost desc limit 1;
    if v_t is not null then v := v || jsonb_build_object('offer_name', v_t); end if;
  end if;
  v_c := coalesce((b.medspa_config->'credits'->>'monthly_credit_cents')::int, 0);
  v := v || jsonb_build_object('member_value',
    case when coalesce((b.medspa_config->'credits'->>'enabled')::boolean, false) and v_c > 0
         then '$' || to_char(v_c / 100, 'FM999,999') || ' in treatment credit every month ($' || to_char(v_c * 12 / 100, 'FM999,999') || ' a year), plus member pricing'
         else 'member pricing on every treatment, plus members-only perks' end);
  if e.payload ? 'due_at' then
    v := v || jsonb_build_object('due_date', to_char((e.payload->>'due_at')::timestamptz at time zone v_tz, 'FMMon FMDD'));
  end if;
  if e.payload ? 'booking_id' then
    select scheduled_at into v_bk from public.bookings where id = (e.payload->>'booking_id')::uuid;
    if v_bk.scheduled_at is not null then
      v := v || jsonb_build_object('appt_time', to_char(v_bk.scheduled_at at time zone v_tz, 'FMDay "at" FMHH12:MI am'));
    end if;
  end if;
  v_bonus := public.wf_msg_bonus(p_node, p_graph, p_run.business_id);
  if v_bonus is not null then v := v || jsonb_build_object('bonus', v_bonus::text); end if;
  v := v || jsonb_build_object('friend_bonus', coalesce((b.point_rules->>'referral_referee')::int, 0)::text);
  return v;
end $$;

-- ───────── stateless conditions (CP-216 set + CP-217 additions) ─────────
create or replace function public.wf_cond(p_type text, p_cfg jsonb, p_business_id uuid, p_membership_id uuid) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare m record; v_days int; v_last timestamptz; v int; v_op text;
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
    when 'c.opened' then return false;
    -- CP-217
    when 'c.paid_member' then
      return m.membership_payment_status = 'paid' and (m.membership_expires_at is null or m.membership_expires_at > now());
    when 'c.reviewed' then
      return exists (select 1 from public.reviews r where r.membership_id = p_membership_id and r.status in ('pending','verified'));
    when 'c.visit_count' then
      v := greatest(coalesce(m.visit_count, 0),
                    (select count(*)::int from public.customer_events e where e.membership_id = p_membership_id and e.type = 'visit.completed'));
      v_op := coalesce(p_cfg->>'op', 'gte');
      return case v_op when 'eq' then v = (p_cfg->>'value')::int when 'lt' then v < (p_cfg->>'value')::int else v >= coalesce((p_cfg->>'value')::int, 1) end;
    when 'c.app_active' then
      v_days := coalesce((p_cfg->>'within_days')::int, 14);
      return exists (select 1 from public.customer_events e where e.membership_id = p_membership_id and e.type = 'app.opened' and e.occurred_at > now() - (v_days || ' days')::interval)
          or exists (select 1 from public.notifications n where n.user_id = m.user_id and n.business_id = p_business_id and n.read_at > now() - (v_days || ' days')::interval)
          or exists (select 1 from public.check_in_events c where c.membership_id = p_membership_id and c.created_at > now() - (v_days || ' days')::interval);
    when 'c.can_afford' then
      return exists (select 1 from public.rewards r where r.business_id = p_business_id and r.is_active and r.archived_at is null and r.point_cost > 0 and r.point_cost <= m.points_balance);
    when 'c.booked_ahead' then
      return exists (select 1 from public.bookings bk where bk.business_id = p_business_id and (bk.membership_id = p_membership_id or bk.user_id = m.user_id)
                       and bk.scheduled_at > now() and coalesce(bk.status, '') not in ('cancelled','no_show','completed'));
    when 'c.feature' then
      return coalesce((select (b.widget_config->>(p_cfg->>'feature'))::boolean from public.businesses b where b.id = p_business_id), false);
    else return false;
  end case;
end $$;

-- ───────── run-aware conditions (+ negate) ─────────
create or replace function public.wf_cond_run(p_type text, p_cfg jsonb, p_run public.workflow_runs, p_graph jsonb) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare v boolean; v_events text[]; v_entry record;
begin
  p_cfg := coalesce(p_cfg, '{}'::jsonb);
  select id, type, payload into v_entry from public.customer_events where id = p_run.entry_event_id;
  case p_type
    when 'c.since_entry' then
      v_events := array(select jsonb_array_elements_text(coalesce(p_cfg->'events', '["booking.created"]'::jsonb)));
      v := exists (select 1 from public.customer_events ce
                    where ce.membership_id = p_run.membership_id and ce.type = any(v_events)
                      and ce.occurred_at >= coalesce(p_run.entered_at, now()) and ce.id is distinct from p_run.entry_event_id
                      and (not coalesce((p_cfg->>'same_item')::boolean, false) or ce.payload->>'item_id' is not distinct from v_entry.payload->>'item_id'));
    when 'c.entry_event' then
      v := v_entry.type = any(array(select jsonb_array_elements_text(case jsonb_typeof(p_cfg->'event') when 'array' then p_cfg->'event' else jsonb_build_array(p_cfg->>'event') end)));
    when 'c.in_journey' then
      v := exists (select 1 from public.workflow_runs r join public.workflows w on w.id = r.workflow_id
                    where r.membership_id = p_run.membership_id and r.status in ('running','waiting') and w.system_key = p_cfg->>'key' and r.id is distinct from p_run.id);
    else
      v := public.wf_cond(p_type, p_cfg, p_run.business_id, p_run.membership_id);
  end case;
  v := coalesce(v, false);
  if coalesce((p_cfg->>'negate')::boolean, false) then v := not v; end if;
  return v;
end $$;

-- ───────── triggers ─────────
create or replace function public.wf_trigger_matches(p_node jsonb, p_type text, p_payload jsonb) returns boolean language sql immutable set search_path = public as $$
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
    when 't.visit'          then p_type = 'visit.completed'
    when 't.event'          then p_type in (select jsonb_array_elements_text(coalesce(p_node->'config'->'events', '[]'::jsonb)))
    else false end;
$$;

-- AFTER INSERT on customer_events: convert goals, then open runs (entry_if + audience guard).
create or replace function public.wf_match_event() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare s record; m record; w record; t jsonb; r record; v_goal_type text; ei jsonb; v_ok boolean; v_pr public.workflow_runs;
begin
  begin
    if not public.wf_engine_on() or new.membership_id is null then return new; end if;
    select * into s from public.business_automation_settings where business_id = new.business_id;
    if s.business_id is null or not s.enabled then return new; end if;
    select * into m from public.business_memberships where id = new.membership_id;
    if m.id is null or m.status in ('blocked','canceled') then return new; end if;

    for r in select r2.* from public.workflow_runs r2 where r2.membership_id = m.id and r2.status in ('running','waiting') and r2.goal is not null loop
      v_goal_type := case r.goal when 'checkin' then 'checkin.recorded' when 'redeem' then 'reward.redeemed' when 'purchase' then 'purchase.recorded'
                                 when 'booking' then 'booking.created' when 'membership' then 'membership.activated' when 'order' then 'order.paid' else r.goal end;
      if new.type = v_goal_type then
        update public.workflow_runs set status = 'exited', exited_at = now(), exit_reason = 'converted' where id = r.id;
        perform public.wf_log_step(r.id, coalesce(r.current_node_id,'-'), 'goal', 'exit', jsonb_build_object('converted_by', new.type, 'event_id', new.id));
      end if;
    end loop;

    for w in select w2.id, w2.status, v.graph from public.workflows w2 join public.workflow_versions v on v.id = w2.current_version_id
              where w2.business_id = new.business_id and w2.status in ('active','testing') loop
      if w.status = 'testing' and not (m.id = any(coalesce(s.test_membership_ids, '{}'))) then continue; end if;
      if w.status = 'active' and public.wf_member_allowed(new.business_id, m.id) is not null then continue; end if;
      t := public.wf_trigger_node(w.graph);
      if t is null or not public.wf_trigger_matches(t, new.type, new.payload) then continue; end if;
      if t->>'type' = 't.spend' then
        if coalesce((select sum(e.amount_cents) from public.events e where e.membership_id = m.id and e.event_type = 'purchase'), 0)
           + coalesce((select sum(o.amount_cents) from public.medspa_shop_orders o where o.business_id = new.business_id and o.user_id = m.user_id and o.status in ('paid','fulfilled')), 0)
           < coalesce((t->'config'->>'min_cents')::int, 0) then continue; end if;
      end if;
      if jsonb_typeof(t->'config'->'entry_if') = 'array' then
        v_pr := null;
        v_pr.id := gen_random_uuid(); v_pr.workflow_id := w.id; v_pr.business_id := new.business_id; v_pr.membership_id := m.id;
        v_pr.entry_event_id := new.id; v_pr.entered_at := now();
        v_ok := true;
        for ei in select x from jsonb_array_elements(t->'config'->'entry_if') x loop
          if ei ? 'on' and ei->>'on' is distinct from new.type then continue; end if;
          if not public.wf_cond_run(ei->>'type', coalesce(ei->'config', '{}'::jsonb) || jsonb_build_object('negate', coalesce(ei->'negate', 'false'::jsonb)), v_pr, w.graph) then
            v_ok := false; exit;
          end if;
        end loop;
        if not v_ok then continue; end if;
      end if;
      perform public.wf_open_run(w.id, m.id, new.id, 'event:' || new.type);
    end loop;
  exception when others then null; end;
  return new;
end $$;

-- ───────── guardrails ─────────
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
     and ((n.source = 'workflow' and n.family is distinct from 'booking')
          or n.kind in ('check_in_available','reward_expiration','we_miss_you','customer_offer','automated_offer','streak','review_request','birthday','announcement'));
  v_cnt := v_cnt + (select count(*) from public.email_outbox o where o.membership_id = p_membership_id and o.status in ('queued','sending','sent') and o.created_at > now() - interval '7 days');
  if v_cnt >= coalesce(s.max_msgs_per_member_per_week, 3) then return 'frequency_cap'; end if;
  return null;
end $$;

-- w.at target time (null = anchor missing, or the booking is gone/cancelled)
create or replace function public.wf_at_target(p_run public.workflow_runs, p_node jsonb) returns timestamptz
language plpgsql stable security definer set search_path to 'public' as $$
declare p jsonb; v_t timestamptz; bk record; v_anchor text;
begin
  select payload into p from public.customer_events where id = p_run.entry_event_id;
  v_anchor := coalesce(p_node->'config'->>'anchor', 'booking');
  if v_anchor = 'booking' then
    select scheduled_at, status into bk from public.bookings where id = nullif(p->>'booking_id','')::uuid;
    if bk.scheduled_at is null or bk.status in ('cancelled','no_show') then return null; end if;
    v_t := bk.scheduled_at;
  else
    v_t := nullif(p->>v_anchor, '')::timestamptz;
  end if;
  return v_t + (coalesce((p_node->'config'->>'offset_minutes')::int, 0) || ' minutes')::interval;
exception when others then return null;
end $$;

-- ───────── adapters ─────────
create or replace function public.wf_act_push(p_run public.workflow_runs, p_node jsonb, p_family text, p_test boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare m record; v_title text; v_body text; v_key text; v_id uuid; x jsonb; v_link text;
begin
  select * into m from public.business_memberships where id = p_run.membership_id;
  x := coalesce(p_node->'config'->'_ctx', '{}'::jsonb);
  v_key := 'wf:' || p_run.id || ':' || (p_node->>'id');
  if exists (select 1 from public.notifications where idempotency_key = v_key) then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','already_sent')); end if;
  v_title := public.wf_render(coalesce(p_node->'config'->>'title', 'A message from {{business}}'), p_run.business_id, p_run.membership_id, x);
  v_body  := public.wf_render(coalesce(p_node->'config'->>'body', ''), p_run.business_id, p_run.membership_id, x);
  v_link  := nullif(public.wf_render(coalesce(p_node->'config'->>'link_path', '/app'), p_run.business_id, p_run.membership_id, x), '');
  if v_link is null or left(v_link, 1) <> '/' then v_link := '/app'; end if;
  if p_test then v_title := '[TEST] ' || v_title; end if;
  insert into public.notifications (user_id, business_id, kind, title, body, link_path, source, family, workflow_run_id, workflow_node_id, idempotency_key)
  values (m.user_id, p_run.business_id, 'generic', v_title, v_body, v_link, 'workflow', p_family, p_run.id, p_node->>'id', v_key)
  on conflict (idempotency_key) where idempotency_key is not null do nothing returning id into v_id;
  if v_id is null then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','gate','title',v_title)); end if;
  return jsonb_build_object('result','ok','detail',jsonb_build_object('channel','push','title',v_title,'body',v_body,'link_path',v_link,'notification_id',v_id));
end $$;

create or replace function public.wf_act_offer(p_run public.workflow_runs, p_node jsonb, p_family text, p_test boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare m record; v_title text; v_body text; v_exp timestamptz; v_key text; v_pts int; v_bal int; v_rname text; v_code text; v_rid uuid; v_msg uuid; v_nid uuid; x jsonb;
begin
  select * into m from public.business_memberships where id = p_run.membership_id;
  x := coalesce(p_node->'config'->'_ctx', '{}'::jsonb);
  v_key := 'wf:' || p_run.id || ':' || (p_node->>'id');
  if exists (select 1 from public.notifications where idempotency_key = v_key) then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','already_sent')); end if;
  v_title := (case when p_test then '[TEST] ' else '' end) || public.wf_render(coalesce(p_node->'config'->>'title','We miss you'), p_run.business_id, p_run.membership_id, x);
  v_body  := public.wf_render(coalesce(p_node->'config'->>'body','Come back soon, something is waiting for you.'), p_run.business_id, p_run.membership_id, x);
  v_exp := now() + (greatest(1, coalesce((p_node->'config'->>'expires_days')::int, 7)) || ' days')::interval;
  v_pts := coalesce((p_node->'config'->>'bonus_points')::int, 0);
  v_rid := nullif(p_node->'config'->>'reward_id', '')::uuid;
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
          case when v_rname is not null and v_pts > 0 then v_rname || ' + ' || v_pts || ' pts are yours. Expires ' || to_char(v_exp at time zone public.business_timezone(p_run.business_id), 'Mon DD') || '.'
               when v_rname is not null then v_rname || ' is waiting for you, free. Expires ' || to_char(v_exp at time zone public.business_timezone(p_run.business_id), 'Mon DD') || '.'
               when v_pts > 0 then '+' || v_pts || ' pts added. ' || v_body
               else v_body end,
          '/app/rewards', 'workflow', coalesce(p_family,'winback'), p_run.id, p_node->>'id', v_key)
  on conflict (idempotency_key) where idempotency_key is not null do nothing returning id into v_nid;
  return jsonb_build_object('result','ok','detail',jsonb_build_object('channel','offer','title',v_title,'body',v_body,'bonus_points',v_pts,'reward',v_rname,'message_id',v_msg,'notification_id',v_nid));
end $$;

-- Email: enqueue one branded email. The dispatcher route renders + sends it.
create or replace function public.wf_act_email(p_run public.workflow_runs, p_node jsonb, p_family text, p_test boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare m record; v_key text; v_to text; c jsonb; x jsonb; v_subject text; v_id uuid; v_hero text;
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
  insert into public.email_outbox (business_id, membership_id, user_id, to_email, subject, preheader, heading, body, cta_label, cta_url, footnote, hero_url,
                                   workflow_run_id, node_id, idempotency_key)
  values (p_run.business_id, p_run.membership_id, m.user_id, v_to, v_subject,
          nullif(public.wf_render(c->>'preheader', p_run.business_id, p_run.membership_id, x), ''),
          nullif(public.wf_render(c->>'heading', p_run.business_id, p_run.membership_id, x), ''),
          public.wf_render(coalesce(c->>'body', ''), p_run.business_id, p_run.membership_id, x),
          nullif(public.wf_render(c->>'cta_label', p_run.business_id, p_run.membership_id, x), ''),
          nullif(public.wf_render(c->>'cta_path', p_run.business_id, p_run.membership_id, x), ''),
          nullif(public.wf_render(c->>'footnote', p_run.business_id, p_run.membership_id, x), ''),
          v_hero, p_run.id, p_node->>'id', v_key)
  on conflict (idempotency_key) do nothing returning id into v_id;
  if v_id is null then return jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','already_sent')); end if;
  return jsonb_build_object('result','ok','detail',jsonb_build_object('channel','email','subject',v_subject,'email_id',v_id));
end $$;

-- ───────── the step loop (CP-216 + w.at, a.email, run-aware conditions, audience guard, transactional) ─────────
create or replace function public.wf_advance_run(p_run_id uuid, p_max int default 50, p_dry boolean default false) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare r public.workflow_runs; w record; g jsonb; n jsonb; v_type text; v_id text; v_next text; v_res jsonb; v_out jsonb := '[]'::jsonb;
        i int := 0; v_family text; v_test boolean; v_block text; v_quiet timestamptz; v_min int; v_cond boolean; v_until timestamptz; v_branch text; v_late int;
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
      v_next := null; v_res := null; v_branch := null;
      if v_type like 't.%' or v_type in ('w.no_reentry','w.cap') then
        v_next := public.wf_next_node(g, v_id, null);
        if v_type not like 't.%' then perform public.wf_log_step(r.id, v_id, v_type, 'ok', '{}'::jsonb); end if;

      elsif v_type like 'c.%' then
        v_cond := public.wf_cond_run(v_type, coalesce(n->'config','{}'::jsonb), r, g);
        v_branch := case when v_cond then 'yes' else 'no' end;
        perform public.wf_log_step(r.id, v_id, v_type, v_branch, jsonb_build_object('config', n->'config'));
        v_next := public.wf_next_node(g, v_id, v_branch);

      elsif v_type = 'w.exit' then
        update public.workflow_runs set status = case when n->'config'->>'reason' = 'converted' then 'exited' else 'done' end,
               exited_at = now(), exit_reason = coalesce(nullif(n->'config'->>'reason',''), 'exit'), current_node_id = v_id where id = r.id;
        perform public.wf_log_step(r.id, v_id, v_type, 'exit', jsonb_build_object('reason', coalesce(n->'config'->>'reason','exit')));
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

      elsif v_type = 'w.at' then
        v_until := public.wf_at_target(r, n);
        v_late := coalesce((n->'config'->>'late_minutes')::int, 60);
        if v_until is null then
          v_branch := 'no';
        elsif p_dry then
          v_branch := 'yes';
        elsif now() > v_until + (v_late || ' minutes')::interval then
          v_branch := 'no';
        elsif now() < v_until then
          update public.workflow_runs set status = 'waiting', waiting_since = coalesce(waiting_since, now()),
                 wake_at = case when coalesce(n->'config'->>'anchor','booking') = 'booking' then least(v_until, now() + interval '6 hours') else v_until end,
                 steps_taken = steps_taken + 1 where id = r.id;
          if r.waiting_since is null then perform public.wf_log_step(r.id, v_id, v_type, 'waiting', jsonb_build_object('until', v_until)); end if;
          v_out := v_out || jsonb_build_object('node_id', v_id, 'node_type', v_type, 'result', 'waiting', 'until', v_until); exit;
        else
          v_branch := 'yes';
        end if;
        perform public.wf_log_step(r.id, v_id, v_type, v_branch, jsonb_build_object('at', v_until));
        v_next := public.wf_next_node(g, v_id, v_branch);

      elsif v_type = 'w.until' then
        v_cond := public.wf_cond_run(coalesce(n->'config'->'condition'->>'type','c.visited'), coalesce(n->'config'->'condition'->'config','{}'::jsonb), r, g);
        v_min := greatest(5, coalesce((n->'config'->>'timeout_minutes')::int, 10080));
        if v_cond then
          v_branch := 'yes';
          perform public.wf_log_step(r.id, v_id, v_type, 'yes', '{}'::jsonb); v_next := public.wf_next_node(g, v_id, 'yes');
        elsif p_dry or (r.waiting_since is not null and r.waiting_since + (v_min || ' minutes')::interval < now()) then
          v_branch := 'no';
          perform public.wf_log_step(r.id, v_id, v_type, 'no', jsonb_build_object('timed_out', true)); v_next := public.wf_next_node(g, v_id, 'no');
        else
          if r.waiting_since is null then perform public.wf_log_step(r.id, v_id, v_type, 'waiting', jsonb_build_object('timeout_minutes', v_min)); end if;
          update public.workflow_runs set status = 'waiting', waiting_since = coalesce(waiting_since, now()), wake_at = now() + interval '15 minutes', steps_taken = steps_taken + 1 where id = r.id;
          v_out := v_out || jsonb_build_object('node_id', v_id, 'node_type', v_type, 'result', 'waiting'); exit;
        end if;

      elsif v_type in ('a.push','a.offer','a.unlock','a.email') then
        v_block := case when v_test then null else public.wf_member_allowed(r.business_id, r.membership_id) end;
        if v_block is null then
          v_block := public.wf_msg_block(r.business_id, r.membership_id);
          if v_block = 'frequency_cap' and coalesce((n->'config'->>'transactional')::boolean, false) then v_block := null; end if;
        end if;
        v_quiet := case when p_dry then null else public.wf_quiet_until(r.business_id) end;
        if v_block is not null then
          v_res := jsonb_build_object('result','skipped','detail',jsonb_build_object('reason', v_block));
        elsif v_quiet is not null then
          update public.workflow_runs set status = 'waiting', waiting_since = coalesce(waiting_since, now()), wake_at = v_quiet where id = r.id;
          if r.waiting_since is null then perform public.wf_log_step(r.id, v_id, v_type, 'deferred', jsonb_build_object('until', v_quiet, 'reason','quiet_hours')); end if;
          v_out := v_out || jsonb_build_object('node_id', v_id, 'node_type', v_type, 'result', 'deferred', 'until', v_quiet); exit;
        else
          n := jsonb_set(n, '{config,_ctx}', public.wf_run_ctx(r, n, g), true);
          v_res := case v_type when 'a.push' then public.wf_act_push(r, n, v_family, v_test)
                               when 'a.offer' then public.wf_act_offer(r, n, v_family, v_test)
                               when 'a.email' then public.wf_act_email(r, n, v_family, v_test)
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
      elsif v_type in ('a.sms','a.segment') then
        v_res := jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','coming_soon'));
        perform public.wf_log_step(r.id, v_id, v_type, 'skipped', v_res->'detail'); v_next := public.wf_next_node(g, v_id, null);
      else
        v_res := jsonb_build_object('result','skipped','detail',jsonb_build_object('reason','unknown_node_type'));
        perform public.wf_log_step(r.id, v_id, v_type, 'skipped', v_res->'detail'); v_next := public.wf_next_node(g, v_id, null);
      end if;

      v_out := v_out || jsonb_build_object('node_id', v_id, 'node_type', v_type, 'result', coalesce(v_res->>'result', v_branch, 'ok'), 'detail', coalesce(v_res->'detail', '{}'::jsonb), 'next', v_next);
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

-- ───────── validator: a.email is publishable now; new node types and variables ─────────
create or replace function public.wf_validate(p_graph jsonb) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare v jsonb := '[]'::jsonb; n jsonb; v_triggers int; v_trig text; v_type text; v_id text; v_txt text; r text[]; v_reach text[];
        v_vars text[] := array['first_name','points','points_remaining','days_since_last_visit','offer_name','business','treatment','member',
                               'item','price','installment','member_value','bonus','friend_bonus','due_date','appt_time','link'];
begin
  select count(*) into v_triggers from jsonb_array_elements(coalesce(p_graph->'nodes','[]'::jsonb)) x where x->>'type' like 't.%';
  if v_triggers = 0 then v := v || jsonb_build_object('node_id', null, 'level', 'error', 'message', 'Add a trigger: every workflow starts with one.'); end if;
  if v_triggers > 1 then v := v || jsonb_build_object('node_id', null, 'level', 'error', 'message', 'Only one trigger per workflow.'); end if;
  v_trig := (public.wf_trigger_node(p_graph))->>'id';
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
    if v_type like 'c.%' or v_type in ('w.until','w.at') then
      if not exists (select 1 from jsonb_array_elements(coalesce(p_graph->'edges','[]'::jsonb)) e where e->>'from' = v_id and e->>'branch' = 'yes') then
        v := v || jsonb_build_object('node_id', v_id, 'level', 'warn', 'message', 'No "Yes" branch: members who match will exit here.'); end if;
      if not exists (select 1 from jsonb_array_elements(coalesce(p_graph->'edges','[]'::jsonb)) e where e->>'from' = v_id and e->>'branch' = 'no') then
        v := v || jsonb_build_object('node_id', v_id, 'level', 'warn', 'message', 'No "No" branch: members who don''t match will exit here.'); end if;
    end if;
    if v_type = 't.event' and jsonb_array_length(coalesce(n->'config'->'events','[]'::jsonb)) = 0 then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Pick the event that starts this flow.'); end if;
    if v_type = 'c.opened' then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Open tracking isn''t available yet. Use "Visited" or "Redeemed" instead.'); end if;
    if v_type = 'a.email' and (nullif(btrim(n->'config'->>'subject'),'') is null or nullif(btrim(n->'config'->>'body'),'') is null) then
      v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Emails need a subject and a message.'); end if;
    if v_type in ('a.sms','a.segment') then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Coming soon: remove this step to publish.'); end if;
    if v_type = 'a.unlock' and nullif(n->'config'->>'reward_id','') is null then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Pick the reward to unlock.'); end if;
    if v_type = 'a.points' and coalesce((n->'config'->>'points')::int, 0) <= 0 then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Set how many points to award.'); end if;
    if v_type = 'a.tag' and nullif(btrim(n->'config'->>'tag'),'') is null then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Name the tag.'); end if;
    if v_type = 'a.enroll' and nullif(n->'config'->>'workflow_id','') is null then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Pick the workflow to add them to.'); end if;
    if v_type in ('a.push','a.offer') and nullif(btrim(n->'config'->>'body'),'') is null then v := v || jsonb_build_object('node_id', v_id, 'level', 'warn', 'message', 'The message is empty.'); end if;
    if v_type = 'w.wait' and coalesce((n->'config'->>'minutes')::int, 0) <= 0 then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Set how long to wait.'); end if;
    v_txt := concat_ws(' ', n->'config'->>'title', n->'config'->>'body', n->'config'->>'subject', n->'config'->>'preheader', n->'config'->>'heading', n->'config'->>'footnote', n->'config'->>'cta_label');
    for r in select regexp_matches(v_txt, '\{\{\s*([a-z_]+)', 'g') loop
      if not (r[1] = any(v_vars)) then v := v || jsonb_build_object('node_id', v_id, 'level', 'error', 'message', 'Unknown variable {{' || r[1] || '}}.'); end if;
    end loop;
  end loop;

  if exists (
    with recursive walk(start_id, cur, path, has_wait) as (
      select e->>'from', e->>'to', array[e->>'from'], false from jsonb_array_elements(coalesce(p_graph->'edges','[]'::jsonb)) e
      union all
      select walk.start_id, e->>'to', walk.path || (e->>'from'),
             walk.has_wait or (select x->>'type' in ('w.wait','w.until','w.until_date','w.at') from jsonb_array_elements(coalesce(p_graph->'nodes','[]'::jsonb)) x where x->>'id' = e->>'from')
        from walk join jsonb_array_elements(coalesce(p_graph->'edges','[]'::jsonb)) e on e->>'from' = walk.cur
       where not (e->>'from' = any(walk.path)) and array_length(walk.path, 1) < 60
    ) select 1 from walk where walk.cur = walk.start_id and not walk.has_wait)
  then v := v || jsonb_build_object('node_id', null, 'level', 'error', 'message', 'This flow loops back on itself without a wait, which would run forever.'); end if;
  return v;
end $$;

-- Dry run: emails count as "would send" now.
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
    'would_send', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_path) x where x->>'node_type' in ('a.push','a.offer','a.unlock','a.notify_admin','a.email') and x->>'result' = 'ok'));
end $$;

-- Summary strip: email count comes from the outbox now.
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
    (select count(*)::int from public.email_outbox o where o.business_id = p_business_id and o.status = 'sent' and o.sent_at > now() - interval '30 days'),
    (select count(*)::int from public.workflow_runs r where r.business_id = p_business_id and r.exit_reason = 'converted' and r.exited_at > now() - interval '30 days'),
    (select count(distinct n.user_id)::int from public.notifications n
       join public.business_memberships m on m.user_id = n.user_id and m.business_id = n.business_id
       join public.customer_events e on e.membership_id = m.id and e.type in ('checkin.recorded','visit.completed') and e.occurred_at > n.created_at and e.occurred_at < n.created_at + interval '7 days'
      where n.business_id = p_business_id and n.source = 'workflow' and n.created_at > now() - interval '30 days'),
    (public.wf_engine_on() and coalesce((select s.enabled from public.business_automation_settings s where s.business_id = p_business_id), false)),
    coalesce((select to_jsonb(s) - 'business_id' from public.business_automation_settings s where s.business_id = p_business_id),
             jsonb_build_object('enabled', false, 'quiet_start', '10:00:00', 'quiet_end', '20:00:00', 'max_msgs_per_member_per_week', 3, 'test_membership_ids', '[]'::jsonb, 'audience', 'auto'))
    || jsonb_build_object('engine_global', public.wf_engine_on());
end $$;

-- Settings: also accepts audience ('auto' | 'live' | 'test').
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
    audience = case when p_settings->>'audience' in ('auto','live','test') then p_settings->>'audience' else audience end,
    updated_at = now()
   where business_id = p_business_id returning * into s;
  return to_jsonb(s) || jsonb_build_object('engine_global', public.wf_engine_on());
end $$;

-- _notif_gate: identical to CP-216 except appointment reminders (family 'booking', transactional) are outside the F11 2-push/20h marketing budget.
create or replace function public._notif_gate() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare
  s          public.business_notification_settings%rowtype;
  v_streaks  boolean := false;
  v_spin     boolean := false;
  v_reviews  boolean := false;
  v_dupe_win interval := interval '90 seconds';
begin
  if new.business_id is null then return new; end if;

  -- CP-216: stamp source / family for legacy writers that don't know about them
  new.source := coalesce(new.source, 'legacy');
  if new.family is null then
    new.family := case new.kind
      when 'we_miss_you'     then 'winback'
      when 'birthday'        then 'birthday'
      when 'review_request'  then 'review'
      when 'streak'          then 'streak'
      when 'automated_offer' then 'promo'
      else null end;
  end if;

  select * into s from public.business_notification_settings where business_id = new.business_id;
  select coalesce(is_enabled, false) into v_streaks from public.streak_config where business_id = new.business_id;
  select coalesce(is_enabled, false) into v_spin    from public.business_mystery_config where business_id = new.business_id;
  select coalesce((widget_config ->> 'reviews')::boolean, false) into v_reviews from public.businesses where id = new.business_id;

  if new.kind = 'streak'             and not coalesce(s.streak_reminders, true)              then return null; end if;
  if new.kind = 'reward_expiration'  and not coalesce(s.gift_expiration_reminders, true)     then return null; end if;
  if new.kind = 'customer_offer'     and not coalesce(s.customer_offer_announcements, true)  then return null; end if;
  if new.kind = 'check_in_available' and not coalesce(s.check_in_available, true)            then return null; end if;
  if new.kind = 'we_miss_you'        and not coalesce(s.we_miss_you, true)                   then return null; end if;
  if new.kind = 'reward_unlocked'    and not coalesce(s.reward_unlocked, true)               then return null; end if;
  if new.kind = 'birthday'           and not coalesce(s.birthday, true)                      then return null; end if;
  if new.kind = 'review_request'     and not coalesce(s.review_request, true)                then return null; end if;

  if new.kind = 'streak' and not v_streaks then return null; end if;
  if new.kind = 'review_request' and not v_reviews then return null; end if;
  if new.kind in ('daily_check', 'check_in_available') then
    if not v_streaks and not v_spin then return null; end if;
    if not v_streaks then
      if new.kind = 'daily_check' then
        new.body := 'Your daily spin is unlocked — tap to play.';
        new.link_path := '/app/scan';
      end if;
      if new.kind = 'check_in_available' and new.body ilike '%streak%' then
        new.title := '🎰 Your spin is ready';
        new.body  := 'Come back and spin for a surprise reward.';
      end if;
    end if;
    -- F6: at the counter → bell only unless the spin is the hook
    if new.kind = 'daily_check' and not v_spin and new.push_sent_at is null then
      new.push_sent_at := now();
    end if;
  end if;

  -- CP-216: family overlap — one owner per family per member per week (legacy vs workflow)
  if new.family is not null and new.user_id is not null then
    if exists (select 1 from public.notifications n
                where n.user_id = new.user_id and n.business_id = new.business_id
                  and n.family = new.family
                  and coalesce(n.source, 'legacy') is distinct from new.source
                  and n.created_at > now() - interval '7 days') then
      return null;
    end if;
  end if;

  -- F11: daily push budget — max 2 marketing pushes per member per business per day
  if (new.kind in ('check_in_available','reward_expiration','we_miss_you','customer_offer','automated_offer','streak','review_request','birthday','announcement')
      or (new.source = 'workflow' and new.family is distinct from 'booking'))
     and new.push_sent_at is null
     and new.title not ilike '%last call%' then
    if (select count(*) from public.notifications n
         where n.user_id = new.user_id and n.business_id = new.business_id
           and (n.kind in ('check_in_available','reward_expiration','we_miss_you','customer_offer','automated_offer','streak','review_request','birthday','announcement')
                or (n.source = 'workflow' and n.family is distinct from 'booking'))
           and n.push_sent_at is not null
           and n.created_at > now() - interval '20 hours') >= 2 then
      new.push_sent_at := now();
    end if;
  end if;

  if new.kind = 'reward_expiration' then
    if exists (select 1 from public.notifications n
                where n.user_id = new.user_id and n.business_id = new.business_id
                  and n.kind = new.kind and n.title = new.title
                  and n.created_at > now() - v_dupe_win) then return null; end if;
  elsif new.kind in ('reward_unlocked','daily_check','check_in_available','streak','review_request','birthday','automated_offer','customer_offer','we_miss_you') then
    if exists (select 1 from public.notifications n
                where n.user_id = new.user_id and n.business_id = new.business_id and n.kind = new.kind
                  and n.created_at > now() - v_dupe_win) then return null; end if;
  end if;
  return new;
end $function$;
