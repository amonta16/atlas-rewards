-- CP-160 · waivers expire: a signature is good for `valid_days` (default 365),
-- then the member is asked to sign again on their next open. Safe to re-run.
alter table public.business_waivers add column if not exists valid_days int not null default 365;

drop function if exists public.set_waiver_validity(uuid, uuid, int);
create or replace function public.set_waiver_validity(p_id uuid, p_business_id uuid, p_valid_days int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.manages_business(p_business_id) then raise exception 'permission denied'; end if;
  -- 0 / null = never expires
  update public.business_waivers set valid_days = coalesce(nullif(p_valid_days, 0), 0), updated_at = now()
   where id = p_id and business_id = p_business_id;
end $$;
revoke all on function public.set_waiver_validity(uuid, uuid, int) from public, anon;
grant execute on function public.set_waiver_validity(uuid, uuid, int) to authenticated;

-- Gate: same as CP-137, plus "and it hasn't expired".
create or replace function public.my_waiver_gate(p_business_id uuid)
returns table(state text, waiver_id uuid, waiver_title text, version_id uuid, version_no integer, body_text text, document_url text, min_account_age integer, minors_enabled boolean, guardian_email text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_mem      uuid;
  w          record;
  v_pending  record;
  v_cutoff   timestamptz;
begin
  if auth.uid() is null then
    return query select 'ok'::text, null::uuid, null::text, null::uuid, null::int, null::text, null::text, null::int, null::boolean, null::text;
    return;
  end if;

  select m.id into v_mem from public.business_memberships m
   where m.business_id = p_business_id and m.user_id = auth.uid();
  if v_mem is null then
    return query select 'ok'::text, null::uuid, null::text, null::uuid, null::int, null::text, null::text, null::int, null::boolean, null::text;
    return;
  end if;

  select w2.id, w2.title, w2.current_version_id, w2.min_account_age, w2.minors_enabled, w2.valid_days
    into w
    from public.business_waivers w2
   where w2.business_id = p_business_id
     and w2.is_active and w2.required_for_signup
     and w2.current_version_id is not null
   order by w2.created_at limit 1;

  if not found then
    return query select 'ok'::text, null::uuid, null::text, null::uuid, null::int, null::text, null::text, null::int, null::boolean, null::text;
    return;
  end if;

  -- CP-160: signatures older than valid_days no longer count (0 = forever).
  v_cutoff := case when coalesce(w.valid_days, 0) > 0 then now() - (w.valid_days || ' days')::interval else '-infinity'::timestamptz end;

  if exists (
    select 1 from public.waiver_submissions s
     where s.membership_id = v_mem and s.waiver_id = w.id and s.version_id = w.current_version_id
       and s.signed_at > v_cutoff
  ) then
    return query select 'ok'::text, null::uuid, null::text, null::uuid, null::int, null::text, null::text, null::int, null::boolean, null::text;
    return;
  end if;

  if exists (
    select 1 from public.waiver_coverage c
     where c.membership_id = v_mem and c.waiver_id = w.id and c.version_id = w.current_version_id
       and c.created_at > v_cutoff
  ) then
    return query select 'ok'::text, null::uuid, null::text, null::uuid, null::int, null::text, null::text, null::int, null::boolean, null::text;
    return;
  end if;

  select g.guardian_email into v_pending
    from public.waiver_guardian_requests g
   where g.membership_id = v_mem and g.waiver_id = w.id
     and g.status = 'pending' and g.expires_at > now()
   order by g.created_at desc limit 1;

  return query
    select case when v_pending.guardian_email is not null then 'awaiting_guardian' else 'needs_signature' end,
           w.id, w.title, w.current_version_id, v.version_no, v.body_text, v.document_url,
           w.min_account_age, w.minors_enabled, v_pending.guardian_email
      from public.waiver_versions v where v.id = w.current_version_id;
end $$;

-- ── CP-160 · Insights: engagement rollup + 12-week trend ───────────────────
drop function if exists public.atlas_engagement_rollup(uuid);
create or replace function public.atlas_engagement_rollup(p_business_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with m as (select id from public.business_memberships where business_id = p_business_id and coalesce(is_demo,false) = false)
  select jsonb_build_object(
    'visits_30d',        (select count(*) from public.check_in_events e where e.business_id = p_business_id and e.created_at > now() - interval '30 days' and e.membership_id in (select id from m)),
    'visits_prev_30d',   (select count(*) from public.check_in_events e where e.business_id = p_business_id and e.created_at between now() - interval '60 days' and now() - interval '30 days' and e.membership_id in (select id from m)),
    'unique_visitors_30d',(select count(distinct e.membership_id) from public.check_in_events e where e.business_id = p_business_id and e.created_at > now() - interval '30 days' and e.membership_id in (select id from m)),
    'spins_30d',         (select count(*) from public.points_ledger l where l.business_id = p_business_id and l.rule_type = 'mystery_bonus' and l.created_at > now() - interval '30 days' and l.membership_id in (select id from m)),
    'spin_points_30d',   (select coalesce(sum(delta),0) from public.points_ledger l where l.business_id = p_business_id and l.rule_type = 'mystery_bonus' and l.created_at > now() - interval '30 days' and l.membership_id in (select id from m)),
    'bookings_30d',      (select count(*) from public.bookings b where b.business_id = p_business_id and b.created_at > now() - interval '30 days' and b.status <> 'cancelled'),
    'bookings_upcoming', (select count(*) from public.bookings b where b.business_id = p_business_id and b.scheduled_at > now() and b.status in ('pending','confirmed')),
    'bookings_noshow_30d',(select count(*) from public.bookings b where b.business_id = p_business_id and b.scheduled_at > now() - interval '30 days' and b.status = 'no_show'),
    'google_reviews',    (select count(*) from public.reviews r where r.business_id = p_business_id and r.platform = 'google' and r.status = 'verified'),
    'ig_follows',        (select count(*) from public.reviews r where r.business_id = p_business_id and r.platform = 'instagram' and r.status = 'verified'),
    'fb_follows',        (select count(*) from public.reviews r where r.business_id = p_business_id and r.platform = 'facebook' and r.status = 'verified'),
    'paid_members',      (select count(*) from public.business_memberships bm where bm.business_id = p_business_id and bm.membership_payment_status in ('active','paid','trialing','past_due')),
    'waivers_signed',    (select count(*) from public.waiver_submissions s where s.business_id = p_business_id),
    'gifts_revealed',    (select count(*) from public.customer_saved_offers c where c.business_id = p_business_id and c.revealed_at is not null),
    'gifts_redeemed',    (select count(*) from public.customer_saved_offers c where c.business_id = p_business_id and c.fulfilled_at is not null and c.redeem_code is not null),
    'birthdays_on_file', (select count(*) from public.business_memberships bm join public.profiles p on p.id = bm.user_id where bm.business_id = p_business_id and p.birthday is not null),
    'members_total',     (select count(*) from m)
  )
  where public.manages_business(p_business_id);
$$;
revoke all on function public.atlas_engagement_rollup(uuid) from public, anon;
grant execute on function public.atlas_engagement_rollup(uuid) to authenticated;

drop function if exists public.atlas_weekly_trend(uuid);
create or replace function public.atlas_weekly_trend(p_business_id uuid)
returns table (week_start date, visits int, new_members int, redemptions int, bookings int)
language sql stable security definer set search_path = public as $$
  with weeks as (
    select generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '1 week')::date as ws
  )
  select w.ws,
         (select count(*)::int from public.check_in_events e where e.business_id = p_business_id and e.created_at >= w.ws and e.created_at < w.ws + 7),
         (select count(*)::int from public.business_memberships m where m.business_id = p_business_id and coalesce(m.is_demo,false) = false and m.joined_at >= w.ws and m.joined_at < w.ws + 7),
         (select count(*)::int from public.redemptions r where r.business_id = p_business_id and r.created_at >= w.ws and r.created_at < w.ws + 7),
         (select count(*)::int from public.bookings b where b.business_id = p_business_id and b.created_at >= w.ws and b.created_at < w.ws + 7 and b.status <> 'cancelled')
    from weeks w
   where public.manages_business(p_business_id)
   order by w.ws;
$$;
revoke all on function public.atlas_weekly_trend(uuid) from public, anon;
grant execute on function public.atlas_weekly_trend(uuid) to authenticated;
