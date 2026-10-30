-- CP-171 · Insights v3 (one RPC, all real numbers) + desk sees welcome gifts
--
-- PART 1 — desk_member_store: the "Waiting to be handed over" list only read
--   `redemptions` (wheel prizes). Welcome gifts, birthday gifts and win-back
--   gifts live in customer_saved_offers, so the desk never saw the member's
--   welcome gift as something to hand over. Now they come through as
--   kind = 'gift' (code = the saved offer's redeem code) and the desk marks
--   them handed over with fulfill_saved_offer (already staff-gated).
--
-- PART 2 — atlas_insights_v3(p_business_id) → jsonb. Everything the Insights
--   tab shows, from the tables the app actually writes to:
--     visits            check_in_events           (auto check-in on award, cp159)
--     revenue           events.amount_cents       (purchase awards at the desk)
--     new members       business_memberships.joined_at
--     social pillars    reviews (platform google / instagram / facebook)
--     spins / gifts     points_ledger mystery_bonus · customer_saved_offers
--     bookings          bookings
--     waivers           waiver_submissions
--   Demo members are excluded everywhere. Each 30-day number carries its
--   previous-30-day twin so the UI can show a real delta, not an estimate.
--
-- Idempotent. Safe to re-run.

-- ───────────────────────── PART 1 ─────────────────────────
create or replace function public.desk_member_store(p_membership_id uuid)
returns table(kind text, id uuid, name text, category text, description text, image_url text,
              point_cost integer, affordable boolean, expires_at timestamptz, code text)
language sql stable security definer set search_path = public as $$
  with m as (
    select bm.id, bm.business_id, bm.points_balance
      from public.business_memberships bm where bm.id = p_membership_id
  )
  select * from (
  -- wheel prizes / point redemptions not yet handed over
  select 'pending'::text as kind, d.id, coalesce(r.name, 'Reward') as name, r.category, r.description, r.image_url,
         0 as point_cost, true as affordable, d.expires_at, d.code
    from public.redemptions d join m on m.id = d.membership_id
    left join public.rewards r on r.id = d.reward_id
   where d.status = 'pending' and (d.expires_at is null or d.expires_at > now())
     and public.staffs_business(m.business_id)
  union all
  -- CP-171: welcome / birthday / win-back gifts saved to the member, not yet picked up
  select 'gift'::text, c.id,
         coalesce(rw.name, o.title) as name,
         'Gift'::text as category,
         case when rw.name is not null then o.title else o.description end as description,
         coalesce(rw.image_url, o.image_url) as image_url,
         0, true, o.expires_at, c.redeem_code
    from public.customer_saved_offers c join m on m.id = c.membership_id
    join public.offers o on o.id = c.offer_id
    left join public.rewards rw on rw.id = o.gift_reward_id
   where c.fulfilled_at is null
     and c.redeem_code is not null
     and o.is_active
     and (o.expires_at is null or o.expires_at > now())
     and public.staffs_business(m.business_id)
  union all
  select 'reward'::text, r.id, r.name, r.category, r.description, r.image_url,
         r.point_cost, (m.points_balance >= r.point_cost), null::timestamptz, null::text
    from public.rewards r join m on m.business_id = r.business_id
   where r.is_active and coalesce(r.show_in_store, true) and r.archived_at is null
     and public.staffs_business(m.business_id)
  ) x
   order by (x.kind in ('pending','gift')) desc, x.affordable desc, x.point_cost asc;
$$;
grant execute on function public.desk_member_store(uuid) to authenticated;

-- ───────────────────────── PART 2 ─────────────────────────
create or replace function public.atlas_insights_v3(p_business_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (
    select id, user_id, joined_at
      from public.business_memberships
     where business_id = p_business_id and coalesce(is_demo, false) = false
  ),
  ci as (
    select e.membership_id, e.created_at
      from public.check_in_events e
     where e.business_id = p_business_id and e.membership_id in (select id from m)
  ),
  ev as (
    select e.membership_id, e.amount_cents, e.created_at
      from public.events e
     where e.business_id = p_business_id and e.event_type = 'purchase'
       and e.amount_cents is not null and e.amount_cents > 0
       and e.membership_id in (select id from m)
  ),
  rv as (
    select r.platform, r.status, r.membership_id,
           coalesce(r.verified_at, r.submitted_at) as at
      from public.reviews r
     where r.business_id = p_business_id and r.membership_id in (select id from m)
  ),
  led as (
    select l.membership_id, l.rule_type, l.delta, l.created_at
      from public.points_ledger l
     where l.business_id = p_business_id and l.membership_id in (select id from m)
  ),
  last_visit as (
    select membership_id, max(created_at) as at from ci group by 1
  ),
  pillar as (
    select p.platform,
           (select count(*) from rv where rv.platform = p.platform and rv.status = 'verified')                                                        as verified_total,
           (select count(*) from rv where rv.platform = p.platform and rv.status = 'verified' and rv.at > now() - interval '30 days')                as verified_30d,
           (select count(*) from rv where rv.platform = p.platform and rv.status = 'verified' and rv.at between now() - interval '60 days' and now() - interval '30 days') as verified_prev_30d,
           (select count(*) from rv where rv.platform = p.platform and rv.status in ('pending','submitted'))                                          as pending,
           (select count(*) from rv where rv.platform = p.platform and rv.status = 'rejected')                                                        as rejected
      from (values ('google'), ('instagram'), ('facebook')) as p(platform)
  ),
  weekday as (
    select extract(isodow from created_at)::int as dow, count(*)::int as n
      from ci where created_at > now() - interval '8 weeks' group by 1
  ),
  top_rewards as (
    select r.name, r.image_url, count(*)::int as n
      from public.redemptions d join public.rewards r on r.id = d.reward_id
     where d.business_id = p_business_id and d.created_at > now() - interval '90 days'
       and d.membership_id in (select id from m)
     group by r.id, r.name, r.image_url order by n desc limit 5
  )
  select jsonb_build_object(
    'members_total',        (select count(*) from m),
    'new_members_30d',      (select count(*) from m where joined_at > now() - interval '30 days'),
    'new_members_prev_30d', (select count(*) from m where joined_at between now() - interval '60 days' and now() - interval '30 days'),
    'active_30d',           (select count(distinct membership_id) from ci where created_at > now() - interval '30 days'),
    'repeat_members',       (select count(*) from (select membership_id from ci group by 1 having count(*) >= 2) x),
    'visited_ever',         (select count(*) from last_visit),
    'lapsed_60d',           (select count(*) from last_visit where at < now() - interval '60 days'),
    'paid_members',         (select count(*) from public.business_memberships bm where bm.business_id = p_business_id and coalesce(bm.is_demo,false) = false and bm.membership_payment_status in ('active','paid','trialing','past_due')),
    'birthdays_on_file',    (select count(*) from m join public.profiles p on p.id = m.user_id where p.birthday is not null),
    'push_opted_in',        (select count(distinct ps.user_id) from public.push_subscriptions ps where ps.user_id in (select user_id from m)),

    'visits_30d',           (select count(*) from ci where created_at > now() - interval '30 days'),
    'visits_prev_30d',      (select count(*) from ci where created_at between now() - interval '60 days' and now() - interval '30 days'),
    'unique_visitors_30d',  (select count(distinct membership_id) from ci where created_at > now() - interval '30 days'),

    'revenue_30d_cents',    (select coalesce(sum(amount_cents),0) from ev where created_at > now() - interval '30 days'),
    'revenue_prev_30d_cents',(select coalesce(sum(amount_cents),0) from ev where created_at between now() - interval '60 days' and now() - interval '30 days'),
    'purchases_30d',        (select count(*) from ev where created_at > now() - interval '30 days'),
    'avg_ticket_cents',     (select coalesce(avg(amount_cents),0)::int from ev where created_at > now() - interval '30 days'),

    'points_awarded_30d',   (select coalesce(sum(delta),0) from led where delta > 0 and created_at > now() - interval '30 days'),
    'points_redeemed_30d',  (select coalesce(abs(sum(delta)),0) from led where rule_type = 'redemption' and created_at > now() - interval '30 days'),
    'redemptions_30d',      (select count(*) from public.redemptions d where d.business_id = p_business_id and d.created_at > now() - interval '30 days' and d.membership_id in (select id from m)),
    'redemptions_prev_30d', (select count(*) from public.redemptions d where d.business_id = p_business_id and d.created_at between now() - interval '60 days' and now() - interval '30 days' and d.membership_id in (select id from m)),
    'points_outstanding',   (select coalesce(sum(points_balance),0) from public.business_memberships bm where bm.business_id = p_business_id and coalesce(bm.is_demo,false) = false),

    'spins_30d',            (select count(*) from led where rule_type = 'mystery_bonus' and created_at > now() - interval '30 days'),
    'spins_prev_30d',       (select count(*) from led where rule_type = 'mystery_bonus' and created_at between now() - interval '60 days' and now() - interval '30 days'),
    'spin_points_30d',      (select coalesce(sum(delta),0) from led where rule_type = 'mystery_bonus' and created_at > now() - interval '30 days'),

    'gifts_issued_30d',     (select count(*) from public.customer_saved_offers c where c.business_id = p_business_id and c.saved_at > now() - interval '30 days' and c.membership_id in (select id from m)),
    'gifts_revealed_30d',   (select count(*) from public.customer_saved_offers c where c.business_id = p_business_id and c.revealed_at > now() - interval '30 days' and c.membership_id in (select id from m)),
    'gifts_redeemed_30d',   (select count(*) from public.customer_saved_offers c where c.business_id = p_business_id and c.fulfilled_at > now() - interval '30 days' and c.membership_id in (select id from m)),
    'gifts_waiting',        (select count(*) from public.customer_saved_offers c join public.offers o on o.id = c.offer_id where c.business_id = p_business_id and c.fulfilled_at is null and o.is_active and (o.expires_at is null or o.expires_at > now()) and c.membership_id in (select id from m)),

    'bookings_30d',         (select count(*) from public.bookings b where b.business_id = p_business_id and b.created_at > now() - interval '30 days' and b.status <> 'cancelled'),
    'bookings_prev_30d',    (select count(*) from public.bookings b where b.business_id = p_business_id and b.created_at between now() - interval '60 days' and now() - interval '30 days' and b.status <> 'cancelled'),
    'bookings_upcoming',    (select count(*) from public.bookings b where b.business_id = p_business_id and b.scheduled_at > now() and b.status in ('pending','confirmed')),
    'bookings_pending',     (select count(*) from public.bookings b where b.business_id = p_business_id and b.scheduled_end > now() and b.status = 'pending'),
    'bookings_noshow_30d',  (select count(*) from public.bookings b where b.business_id = p_business_id and b.scheduled_at > now() - interval '30 days' and b.status = 'no_show'),
    'waivers_total',        (select count(*) from public.waiver_submissions s where s.business_id = p_business_id),
    'waivers_30d',          (select count(*) from public.waiver_submissions s where s.business_id = p_business_id and s.signed_at > now() - interval '30 days'),

    'social',               (select jsonb_agg(to_jsonb(pillar) order by case platform when 'google' then 1 when 'instagram' then 2 else 3 end) from pillar),
    'social_pending_total', (select count(*) from rv where status in ('pending','submitted')),
    'weekday_visits',       (select jsonb_agg(coalesce(w.n,0) order by d.dow) from generate_series(1,7) d(dow) left join weekday w on w.dow = d.dow),
    'top_rewards',          (select coalesce(jsonb_agg(to_jsonb(top_rewards)), '[]'::jsonb) from top_rewards)
  )
  where public.manages_business(p_business_id);
$$;
grant execute on function public.atlas_insights_v3(uuid) to authenticated;

select 'cp171 ok' as status;
