-- CP-216 · Automation Hub · 02 customer events: emitters + nightly time-based evaluator
-- APPLIED to production Oct 23 2026 (migration cp216_02_events). Safe to re-run.
-- Every emitter is wrapped so a problem here can never fail the host insert/update.

create or replace function public.wf_emit(p_business_id uuid, p_membership_id uuid, p_type text, p_payload jsonb, p_dedupe_key text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if p_business_id is null or p_type is null then return; end if;
  insert into public.customer_events (business_id, membership_id, type, payload, dedupe_key)
  values (p_business_id, p_membership_id, p_type, coalesce(p_payload, '{}'::jsonb), coalesce(p_dedupe_key, gen_random_uuid()::text))
  on conflict (business_id, type, dedupe_key) do nothing;
exception when others then null;
end $$;

-- business_memberships: enrolled, tier change, membership activated
create or replace function public._wf_ev_membership() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform public.wf_emit(new.business_id, new.id, 'member.enrolled', jsonb_build_object('joined_at', new.joined_at), new.id::text);
    else
      if new.tier is distinct from old.tier then
        perform public.wf_emit(new.business_id, new.id, 'tier.changed', jsonb_build_object('from', old.tier, 'to', new.tier), new.id::text || ':' || coalesce(new.tier,'') || ':' || to_char(now(),'YYYYMMDD'));
      end if;
      if new.membership_payment_status = 'paid' and (old.membership_payment_status is distinct from 'paid' or new.membership_paid_at is distinct from old.membership_paid_at) then
        perform public.wf_emit(new.business_id, new.id, 'membership.activated', jsonb_build_object('plan', new.membership_plan_label, 'expires_at', new.membership_expires_at), new.id::text || ':' || coalesce(new.membership_paid_at::text, now()::text));
      end if;
    end if;
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_ev_membership after insert or update on public.business_memberships
  for each row execute function public._wf_ev_membership();

-- check_in_events: checkin.recorded
create or replace function public._wf_ev_checkin() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    perform public.wf_emit(new.business_id, new.membership_id, 'checkin.recorded',
      jsonb_build_object('streak_after', new.streak_after, 'is_milestone', new.is_milestone, 'awarded_points', new.awarded_points), new.id::text);
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_ev_checkin after insert on public.check_in_events for each row execute function public._wf_ev_checkin();

-- points_ledger: points.earned (positive deltas)
create or replace function public._wf_ev_points() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if new.delta > 0 then
      perform public.wf_emit(new.business_id, new.membership_id, 'points.earned',
        jsonb_build_object('delta', new.delta, 'balance_after', new.balance_after, 'rule_type', new.rule_type), new.id::text);
    end if;
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_ev_points after insert on public.points_ledger for each row execute function public._wf_ev_points();

-- events (desk-recorded purchases): purchase.recorded
create or replace function public._wf_ev_purchase() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if new.event_type = 'purchase' and new.membership_id is not null then
      perform public.wf_emit(new.business_id, new.membership_id, 'purchase.recorded',
        jsonb_build_object('amount_cents', new.amount_cents, 'source', new.source), new.id::text);
    end if;
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_ev_purchase after insert on public.events for each row execute function public._wf_ev_purchase();

-- medspa_shop_orders: order.paid (also counts as a purchase)
create or replace function public._wf_ev_order() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_m uuid;
begin
  begin
    if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
      select id into v_m from public.business_memberships where business_id = new.business_id and user_id = new.user_id limit 1;
      if v_m is not null then
        perform public.wf_emit(new.business_id, v_m, 'order.paid', jsonb_build_object('amount_cents', new.amount_cents, 'kind', new.kind, 'item', new.item_name), new.id::text);
        perform public.wf_emit(new.business_id, v_m, 'purchase.recorded', jsonb_build_object('amount_cents', new.amount_cents, 'source', 'shop'), 'order:' || new.id::text);
      end if;
    end if;
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_ev_order after insert or update on public.medspa_shop_orders for each row execute function public._wf_ev_order();

-- redemptions: reward.redeemed / reward.fulfilled
create or replace function public._wf_ev_redemption() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if tg_op = 'INSERT' then
      perform public.wf_emit(new.business_id, new.membership_id, 'reward.redeemed', jsonb_build_object('reward_id', new.reward_id, 'point_cost', new.point_cost), new.id::text);
    elsif new.status = 'fulfilled' and old.status is distinct from 'fulfilled' then
      perform public.wf_emit(new.business_id, new.membership_id, 'reward.fulfilled', jsonb_build_object('reward_id', new.reward_id), new.id::text);
    end if;
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_ev_redemption after insert or update on public.redemptions for each row execute function public._wf_ev_redemption();

-- member_streak_gifts: streak.milestone
create or replace function public._wf_ev_streak_gift() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    perform public.wf_emit(new.business_id, new.membership_id, 'streak.milestone', jsonb_build_object('milestone', new.milestone_count, 'label', new.label, 'gift_kind', new.gift_kind), new.id::text);
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_ev_streak_gift after insert on public.member_streak_gifts for each row execute function public._wf_ev_streak_gift();

-- bookings: booking.created / confirmed / completed / cancelled / no_show
create or replace function public._wf_ev_booking() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_m uuid;
begin
  begin
    v_m := new.membership_id;
    if v_m is null and new.user_id is not null then
      select id into v_m from public.business_memberships where business_id = new.business_id and user_id = new.user_id limit 1;
    end if;
    if v_m is not null then
      if tg_op = 'INSERT' then
        perform public.wf_emit(new.business_id, v_m, 'booking.created', jsonb_build_object('booking_id', new.id, 'scheduled_at', new.scheduled_at, 'service', new.tag_name), new.id::text);
        if new.status in ('confirmed') then
          perform public.wf_emit(new.business_id, v_m, 'booking.confirmed', jsonb_build_object('booking_id', new.id, 'scheduled_at', new.scheduled_at, 'service', new.tag_name), new.id::text);
        end if;
      elsif new.status is distinct from old.status and new.status in ('confirmed','completed','cancelled','no_show') then
        perform public.wf_emit(new.business_id, v_m, 'booking.' || new.status, jsonb_build_object('booking_id', new.id, 'scheduled_at', new.scheduled_at, 'service', new.tag_name), new.id::text);
      end if;
    end if;
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_ev_booking after insert or update on public.bookings for each row execute function public._wf_ev_booking();

-- reviews: review.verified
create or replace function public._wf_ev_review() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if new.status = 'verified' and old.status is distinct from 'verified' then
      perform public.wf_emit(new.business_id, new.membership_id, 'review.verified', jsonb_build_object('platform', new.platform), new.id::text);
    end if;
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_ev_review after update on public.reviews for each row execute function public._wf_ev_review();

-- referrals: referral.completed (for the referrer)
create or replace function public._wf_ev_referral() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if new.status = 'completed' and old.status is distinct from 'completed' and new.referrer_membership_id is not null then
      perform public.wf_emit(new.business_id, new.referrer_membership_id, 'referral.completed', jsonb_build_object('referee_membership_id', new.referee_membership_id), new.id::text);
    end if;
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_ev_referral after update on public.referrals for each row execute function public._wf_ev_referral();

-- medspa_treatment_log: treatment.logged
create or replace function public._wf_ev_treatment() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_m uuid;
begin
  begin
    select id into v_m from public.business_memberships where business_id = new.business_id and user_id = new.user_id limit 1;
    if v_m is not null then
      perform public.wf_emit(new.business_id, v_m, 'treatment.logged', jsonb_build_object('treatment', new.treatment_name, 'recall_weeks', new.recall_weeks, 'performed_at', new.performed_at), new.id::text);
    end if;
  exception when others then null; end;
  return new;
end $$;
create or replace trigger trg_wf_ev_treatment after insert on public.medspa_treatment_log for each row execute function public._wf_ev_treatment();

-- Nightly time-based events. Runs for every business with the engine on; dedupe keys make it idempotent.
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

    -- inactivity.N for every N an active trigger asks for
    for v_days in
      select distinct coalesce((n->'config'->>'days')::int, 14)
        from public.workflows w join public.workflow_versions v on v.id = w.current_version_id,
             jsonb_array_elements(v.graph->'nodes') n
       where w.business_id = b.business_id and w.status in ('active','testing') and n->>'type' = 't.inactive'
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

    -- birthday + anniversary (today, local)
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

    -- streak.broken: an active streak whose period (plus grace) has lapsed without a check-in
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

    -- recall.due (med spa): treatment due date is today
    for r in
      select l.id, l.treatment_name, l.recall_weeks, l.performed_at, m.id membership_id
        from public.medspa_treatment_log l join public.business_memberships m on m.business_id = l.business_id and m.user_id = l.user_id
       where l.business_id = b.business_id and l.recall_weeks is not null
         and (l.performed_at + (l.recall_weeks || ' weeks')::interval) at time zone v_tz >= v_today
         and (l.performed_at + (l.recall_weeks || ' weeks')::interval) at time zone v_tz < v_today + 1
    loop
      perform public.wf_emit(b.business_id, r.membership_id, 'recall.due', jsonb_build_object('treatment', r.treatment_name, 'log_id', r.id), r.id::text);
      v_n := v_n + 1;
    end loop;

    -- membership.expiring: within 7 days
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
