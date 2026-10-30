-- CP-217 · Med Spa Automation Suite · 03 events: app tracking RPC, server emitters, content fan-out, nightly evaluator
-- Every emitter is wrapped so it can never fail the host insert/update. Safe to re-run.

-- ───────── client tracking (member-authenticated) ─────────
-- Allowed: app.opened, shop.item_viewed, checkout.started, membership.viewed.
-- Dedupe: one event per member + type + item per 10 minutes. Returns true when a new event was recorded.
create or replace function public.track_event(p_business_id uuid, p_type text, p_payload jsonb default '{}'::jsonb) returns boolean
language plpgsql security definer set search_path to 'public' as $$
declare v_m uuid; v_p jsonb; v_item text; v_id bigint;
begin
  if auth.uid() is null or p_business_id is null then return false; end if;
  if p_type not in ('app.opened','shop.item_viewed','checkout.started','membership.viewed') then return false; end if;
  select id into v_m from public.business_memberships
   where business_id = p_business_id and user_id = auth.uid() and status not in ('blocked','canceled') limit 1;
  if v_m is null then return false; end if;
  p_payload := coalesce(p_payload, '{}'::jsonb);
  v_p := jsonb_strip_nulls(jsonb_build_object(
    'item',         left(p_payload->>'item', 120),
    'item_id',      left(p_payload->>'item_id', 64),
    'kind',         left(p_payload->>'kind', 32),
    'path',         left(p_payload->>'path', 200),
    'amount_cents', case when (p_payload->>'amount_cents') ~ '^\d{1,9}$' then (p_payload->>'amount_cents')::int end,
    'source',       'app'));
  v_item := coalesce(v_p->>'item_id', v_p->>'item', '');
  insert into public.customer_events (business_id, membership_id, type, payload, dedupe_key)
  values (p_business_id, v_m, p_type, v_p, v_m::text || ':' || p_type || ':' || v_item || ':' || floor(extract(epoch from now()) / 600)::bigint::text)
  on conflict (business_id, type, dedupe_key) do nothing returning id into v_id;
  return v_id is not null;
end $$;

-- ───────── medspa_shop_orders: checkout.started (pending = Stripe checkout opened), order.reserved (pay at desk) ─────────
create or replace function public._wf_ev_shop_checkout() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_m uuid; v_p jsonb;
begin
  begin
    if new.status in ('pending','reserved') then
      select id into v_m from public.business_memberships where business_id = new.business_id and user_id = new.user_id limit 1;
      if v_m is not null then
        v_p := jsonb_strip_nulls(jsonb_build_object('item', new.item_name, 'item_id', new.item_id, 'amount_cents', new.amount_cents, 'kind', new.kind, 'order_id', new.id, 'source', 'shop'));
        perform public.wf_emit(new.business_id, v_m, case new.status when 'pending' then 'checkout.started' else 'order.reserved' end, v_p, 'order:' || new.id::text);
      end if;
    end if;
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_ev_shop_checkout after insert on public.medspa_shop_orders for each row execute function public._wf_ev_shop_checkout();

-- order.paid now carries item_id (for {{item}} / same-item checks)
create or replace function public._wf_ev_order() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_m uuid;
begin
  begin
    if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
      select id into v_m from public.business_memberships where business_id = new.business_id and user_id = new.user_id limit 1;
      if v_m is not null then
        perform public.wf_emit(new.business_id, v_m, 'order.paid', jsonb_strip_nulls(jsonb_build_object('amount_cents', new.amount_cents, 'kind', new.kind, 'item', new.item_name, 'item_id', new.item_id, 'order_id', new.id)), new.id::text);
        perform public.wf_emit(new.business_id, v_m, 'purchase.recorded', jsonb_build_object('amount_cents', new.amount_cents, 'source', 'shop'), 'order:' || new.id::text);
      end if;
    end if;
  exception when others then null; end;
  return new;
end $$;

-- ───────── visit.completed: booking completed, treatment logged, or check-in (med spas only, one per member per local day) ─────────
create or replace function public._wf_ev_visit() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_m uuid; v_t text; v_src text; v_user uuid;
begin
  begin
    if not exists (select 1 from public.businesses b where b.id = new.business_id and b.layout_preset = 'medspa') then return new; end if;
    if tg_table_name = 'bookings' then
      if not (new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed')) then return new; end if;
      v_m := new.membership_id; v_user := new.user_id; v_t := new.tag_name; v_src := 'booking';
    elsif tg_table_name = 'medspa_treatment_log' then
      v_user := new.user_id; v_t := new.treatment_name; v_src := 'treatment';
    elsif tg_table_name = 'check_in_events' then
      v_m := new.membership_id; v_src := 'checkin';
    else
      return new;
    end if;
    if v_m is null and v_user is not null then
      select id into v_m from public.business_memberships where business_id = new.business_id and user_id = v_user limit 1;
    end if;
    if v_m is not null then
      perform public.wf_emit(new.business_id, v_m, 'visit.completed', jsonb_strip_nulls(jsonb_build_object('treatment', v_t, 'source', v_src)),
                             v_m::text || ':' || to_char(now() at time zone public.business_timezone(new.business_id), 'YYYYMMDD'));
    end if;
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_ev_visit_booking after insert or update on public.bookings for each row execute function public._wf_ev_visit();
create or replace trigger trg_wf_ev_visit_treatment after insert on public.medspa_treatment_log for each row execute function public._wf_ev_visit();
create or replace trigger trg_wf_ev_visit_checkin after insert on public.check_in_events for each row execute function public._wf_ev_visit();

-- ───────── content.published: fan out to members (only when the business runs the app check-in journey) ─────────
create or replace function public.wf_fanout_content(p_business_id uuid, p_key text, p_payload jsonb) returns integer
language plpgsql security definer set search_path to 'public' as $$
declare v_n int := 0; m record;
begin
  if not public.wf_engine_on() then return 0; end if;
  if not exists (select 1 from public.business_automation_settings s where s.business_id = p_business_id and s.enabled) then return 0; end if;
  if not exists (select 1 from public.workflows w where w.business_id = p_business_id and w.system_key = 'ms.app_checkin' and w.status in ('active','testing')) then return 0; end if;
  for m in select id from public.business_memberships where business_id = p_business_id and status not in ('blocked','canceled') loop
    perform public.wf_emit(p_business_id, m.id, 'content.published', p_payload, p_key || ':' || m.id::text);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public._wf_ev_content() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare it jsonb;
begin
  begin
    if tg_table_name = 'rewards' then
      if new.is_active and new.archived_at is null and coalesce(new.show_in_store, true) then
        perform public.wf_fanout_content(new.business_id, 'reward:' || new.id::text, jsonb_build_object('title', new.name, 'kind', 'reward', 'link_path', '/app/rewards'));
      end if;
    elsif tg_table_name = 'news_posts' then
      if new.is_published and (tg_op = 'INSERT' or not coalesce(old.is_published, false)) then
        perform public.wf_fanout_content(new.business_id, 'news:' || new.id::text, jsonb_build_object('title', new.title, 'kind', 'news', 'link_path', '/app'));
      end if;
    elsif tg_table_name = 'businesses' then
      if new.layout_preset = 'medspa' and new.medspa_config is distinct from old.medspa_config then
        for it in
          select x from jsonb_array_elements(coalesce(new.medspa_config->'shop'->'items', '[]'::jsonb)) x
           where coalesce((x->>'featured')::boolean, false) and coalesce((x->>'is_active')::boolean, true)
             and not exists (select 1 from jsonb_array_elements(coalesce(old.medspa_config->'shop'->'items', '[]'::jsonb)) o
                              where o->>'id' = x->>'id' and coalesce((o->>'featured')::boolean, false) and coalesce((o->>'is_active')::boolean, true))
        loop
          perform public.wf_fanout_content(new.id, 'shop:' || (it->>'id'), jsonb_build_object('title', it->>'name', 'kind', 'shop', 'item_id', it->>'id', 'link_path', '/app/shop'));
        end loop;
      end if;
    end if;
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_ev_content_reward after insert on public.rewards for each row execute function public._wf_ev_content();
create or replace trigger trg_wf_ev_content_news after insert or update on public.news_posts for each row execute function public._wf_ev_content();
create or replace trigger trg_wf_ev_content_shop after update of medspa_config on public.businesses for each row execute function public._wf_ev_content();

-- ───────── nightly evaluator (CP-216 + inactivity.N from t.event triggers + recall.due 10 days ahead) ─────────
create or replace function public.wf_evaluate_time_events() returns integer language plpgsql security definer set search_path to 'public' as $$
declare b record; v_tz text; v_today date; v_n int := 0; v_days int; v_period interval; r record;
begin
  if coalesce((select value from public.app_settings where key = 'automation_engine'), 'off') <> 'on' then return 0; end if;
  for b in
    select s.business_id from public.business_automation_settings s
     where s.enabled and exists (select 1 from public.workflows w where w.business_id = s.business_id and w.status in ('active','testing'))
  loop
    v_tz := public.business_timezone(b.business_id);
    v_today := (now() at time zone v_tz)::date;

    -- inactivity.N for every N an active trigger asks for (t.inactive {days} or t.event {events: ['inactivity.N']})
    for v_days in
      select distinct d from (
        select coalesce((n->'config'->>'days')::int, 14) d
          from public.workflows w join public.workflow_versions v on v.id = w.current_version_id, jsonb_array_elements(v.graph->'nodes') n
         where w.business_id = b.business_id and w.status in ('active','testing') and n->>'type' = 't.inactive'
        union
        select substring(ev from '^inactivity\.(\d+)$')::int
          from public.workflows w join public.workflow_versions v on v.id = w.current_version_id, jsonb_array_elements(v.graph->'nodes') n,
               jsonb_array_elements_text(coalesce(n->'config'->'events','[]'::jsonb)) ev
         where w.business_id = b.business_id and w.status in ('active','testing') and n->>'type' = 't.event' and ev ~ '^inactivity\.\d+$'
      ) q where d is not null
    loop
      for r in
        select m.id, m.last_visit_at from public.business_memberships m
         where m.business_id = b.business_id and coalesce(m.is_demo,false) = false and m.status not in ('blocked','canceled')
           and coalesce(m.last_visit_at, m.joined_at) < now() - (v_days || ' days')::interval
           and coalesce(m.last_visit_at, m.joined_at) >= now() - ((v_days + 1) || ' days')::interval
      loop
        perform public.wf_emit(b.business_id, r.id, 'inactivity.' || v_days, jsonb_build_object('days', v_days, 'last_visit_at', r.last_visit_at),
                               r.id::text || ':' || coalesce(r.last_visit_at::text, 'never'));
        v_n := v_n + 1;
      end loop;
    end loop;

    for r in
      select m.id, p.birthday, m.joined_at from public.business_memberships m join public.profiles p on p.id = m.user_id
       where m.business_id = b.business_id and coalesce(m.is_demo,false) = false and m.status not in ('blocked','canceled')
    loop
      if r.birthday is not null and to_char(r.birthday,'MMDD') = to_char(v_today,'MMDD') then
        perform public.wf_emit(b.business_id, r.id, 'birthday', jsonb_build_object('year', extract(year from v_today)), r.id::text || ':' || to_char(v_today,'YYYY'));
        v_n := v_n + 1;
      end if;
      if r.joined_at is not null and to_char(r.joined_at at time zone v_tz,'MMDD') = to_char(v_today,'MMDD') and (r.joined_at at time zone v_tz)::date < v_today then
        perform public.wf_emit(b.business_id, r.id, 'anniversary', jsonb_build_object('years', extract(year from v_today) - extract(year from r.joined_at at time zone v_tz)), r.id::text || ':' || to_char(v_today,'YYYY'));
        v_n := v_n + 1;
      end if;
    end loop;

    for r in
      select ms.membership_id, ms.current_streak, ms.last_checkin_at, sc.period_type, coalesce(sc.reset_grace_hours, 0) grace
        from public.member_streaks ms join public.streak_config sc on sc.business_id = ms.business_id
       where ms.business_id = b.business_id and sc.is_enabled and ms.current_streak > 0 and ms.last_checkin_at is not null
    loop
      v_period := case r.period_type when 'daily' then interval '1 day' when 'monthly' then interval '31 days' else interval '7 days' end;
      if r.last_checkin_at + v_period + (r.grace || ' hours')::interval < now() then
        perform public.wf_emit(b.business_id, r.membership_id, 'streak.broken', jsonb_build_object('streak', r.current_streak), r.membership_id::text || ':' || r.last_checkin_at::text);
        v_n := v_n + 1;
      end if;
    end loop;

    -- recall.due (med spa): fires 10 days before the due date (catch-up until the due date), once per treatment log,
    -- for the member's latest log of that treatment. recall_weeks from the log, else from the treatment menu.
    for r in
      select l.id, l.treatment_name, l.treatment_id, m.id membership_id,
             l.performed_at + (coalesce(l.recall_weeks, tc.recall_weeks) || ' weeks')::interval as due_at
        from public.medspa_treatment_log l
        join public.business_memberships m on m.business_id = l.business_id and m.user_id = l.user_id
        join public.businesses bz on bz.id = l.business_id
        left join lateral (select (x->>'recall_weeks')::int recall_weeks from jsonb_array_elements(coalesce(bz.medspa_config->'treatments','[]'::jsonb)) x
                            where x->>'id' = l.treatment_id limit 1) tc on true
       where l.business_id = b.business_id and coalesce(l.recall_weeks, tc.recall_weeks, 0) > 0
         and l.performed_at > now() - interval '2 years'
         and not exists (select 1 from public.medspa_treatment_log l2 where l2.business_id = l.business_id and l2.user_id = l.user_id
                            and l2.performed_at > l.performed_at and (l2.treatment_id = l.treatment_id or l2.treatment_name = l.treatment_name))
    loop
      if (r.due_at at time zone v_tz)::date - 10 <= v_today and (r.due_at at time zone v_tz)::date > v_today then
        perform public.wf_emit(b.business_id, r.membership_id, 'recall.due',
          jsonb_strip_nulls(jsonb_build_object('treatment', r.treatment_name, 'treatment_id', r.treatment_id, 'log_id', r.id, 'due_at', r.due_at)), r.id::text);
        v_n := v_n + 1;
      end if;
    end loop;

    for r in
      select m.id, m.membership_expires_at from public.business_memberships m
       where m.business_id = b.business_id and m.membership_payment_status = 'paid' and m.membership_expires_at is not null
         and m.membership_expires_at between now() and now() + interval '7 days'
    loop
      perform public.wf_emit(b.business_id, r.id, 'membership.expiring', jsonb_build_object('expires_at', r.membership_expires_at), r.id::text || ':' || r.membership_expires_at::date::text);
      v_n := v_n + 1;
    end loop;
  end loop;
  return v_n;
end $$;
