-- CP-220 · part 3 — points expire after 180 days of inactivity (entertainment
-- apps only), with a five-step reminder series, plus gift-expiry reminders on
-- the new per-member expiry.
--
-- Policy (same shape as Domino's Rewards: points expire after 180 days of
-- account inactivity; earning or redeeming resets the clock):
--   · "activity" = a visit, any points earned, or a reward redeemed;
--   · applies where businesses.points_expiry_days > 0 — set to 180 for every
--     layout_preset = 'entertainment' business (and automatically for new ones);
--     med spas and everything else: off (NULL);
--   · launch grace: nobody's points expire sooner than 30 days after the
--     policy was switched on for their business (points_expiry_since), so
--     every member gets the full reminder series first;
--   · reminders at 30, 14, 7, 3 and 1 day(s) before, 10:00–20:00 local, as
--     'reward_expiration' notifications (bell + push; honours the business's
--     "gift expiration reminders" switch), family 'points_expiry';
--   · demo businesses, demo members and blocked members are never touched.

alter table public.businesses add column if not exists points_expiry_days integer;
alter table public.businesses add column if not exists points_expiry_since timestamptz;

update public.businesses
   set points_expiry_days = 180, points_expiry_since = now()
 where layout_preset = 'entertainment' and points_expiry_days is null;

create or replace function public._points_expiry_default()
returns trigger language plpgsql as $$
begin
  if new.layout_preset = 'entertainment' then
    if new.points_expiry_days is null then
      new.points_expiry_days := 180;
      new.points_expiry_since := now();
    end if;
  elsif tg_op = 'UPDATE' and old.layout_preset = 'entertainment' then
    new.points_expiry_days := null;      -- left entertainment → policy off
    new.points_expiry_since := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_points_expiry_default on public.businesses;
-- runs after trg_pin_layout_preset (alphabetical), so it sees the final preset
create trigger trg_points_expiry_default before insert or update of layout_preset on public.businesses
  for each row execute function public._points_expiry_default();

-- Last activity: visit, earn (anything but the expiry itself), or redemption.
create or replace function public.points_last_activity(p_membership_id uuid)
returns timestamptz language sql stable security definer set search_path to 'public' as $$
  select greatest(
           m.last_visit_at, m.joined_at, m.created_at,
           (select max(l.created_at) from public.points_ledger l
             where l.membership_id = m.id
               and ((l.delta > 0 and l.rule_type <> 'points_expired') or l.rule_type = 'redemption')))
    from public.business_memberships m where m.id = p_membership_id
$$;

-- When this member's points expire (NULL = never / policy off).
create or replace function public.points_expire_at(p_membership_id uuid)
returns timestamptz language sql stable security definer set search_path to 'public' as $$
  select case when coalesce(b.points_expiry_days, 0) > 0 and not coalesce(b.is_demo, false)
              then greatest(public.points_last_activity(m.id) + make_interval(days => b.points_expiry_days),
                            coalesce(b.points_expiry_since, now()) + interval '30 days')
         end
    from public.business_memberships m join public.businesses b on b.id = m.business_id
   where m.id = p_membership_id
$$;
revoke execute on function public.points_last_activity(uuid) from public, anon;
revoke execute on function public.points_expire_at(uuid) from public, anon;

-- Customer app: my balance's expiry for this business.
create or replace function public.my_points_expiry(p_business_id uuid)
returns table(enabled boolean, expiry_days integer, points integer, expires_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select coalesce(b.points_expiry_days, 0) > 0 and not coalesce(b.is_demo, false),
         b.points_expiry_days, m.points_balance,
         case when m.points_balance > 0 then public.points_expire_at(m.id) end
    from public.business_memberships m join public.businesses b on b.id = m.business_id
   where m.business_id = p_business_id and m.user_id = auth.uid()
$$;

-- Front desk: the same answer for the member on screen.
create or replace function public.member_points_expiry(p_membership_id uuid)
returns table(enabled boolean, expiry_days integer, points integer, expires_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
declare v_biz uuid;
begin
  select business_id into v_biz from public.business_memberships where id = p_membership_id;
  if v_biz is null or not public.staffs_business(v_biz) then return; end if;
  return query
  select coalesce(b.points_expiry_days, 0) > 0 and not coalesce(b.is_demo, false),
         b.points_expiry_days, m.points_balance,
         case when m.points_balance > 0 then public.points_expire_at(m.id) end
    from public.business_memberships m join public.businesses b on b.id = m.business_id
   where m.id = p_membership_id;
end $$;

create table if not exists public.points_expiry_reminders (
  membership_id uuid not null references public.business_memberships(id) on delete cascade,
  deadline      date not null,
  stage         integer not null,
  sent_at       timestamptz not null default now(),
  primary key (membership_id, deadline, stage)
);
alter table public.points_expiry_reminders enable row level security;   -- jobs only

create or replace function public.process_points_expiry()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  r record; v_left integer; v_stage integer; v_hour integer; v_reward text; v_date text;
  v_title text; v_body text; v_n integer := 0; v_id uuid; v_cur integer;
begin
  for r in
    select m.id, m.user_id, m.business_id, m.points_balance, btrim(b.name) as biz, b.points_expiry_days as days,
           public.points_expire_at(m.id) as deadline,
           coalesce(public.business_timezone(b.id), 'America/Los_Angeles') as tz
      from public.business_memberships m
      join public.businesses b on b.id = m.business_id
     where coalesce(b.points_expiry_days, 0) > 0
       and not coalesce(b.is_demo, false)
       and not coalesce(m.is_demo, false)
       and m.status is distinct from 'blocked'
       and m.points_balance > 0
  loop
    continue when r.deadline is null;

    -- ── expire ──
    if r.deadline <= now() then
      -- ledger row first (idempotent per deadline), then the balance — so a
      -- balance is never zeroed without its history line.
      -- re-check under a row lock: a visit in the last moment wins
      select points_balance into v_cur from public.business_memberships where id = r.id for update;
      continue when coalesce(v_cur, 0) <= 0 or public.points_expire_at(r.id) > now();
      v_id := null;
      insert into public.points_ledger (membership_id, business_id, delta, rule_type, idempotency_key,
                                        balance_after, notes)
      values (r.id, r.business_id, -v_cur, 'points_expired',
              'points_expired:' || r.id::text || ':' || to_char(r.deadline, 'YYYYMMDD'), 0,
              v_cur || ' points expired after ' || r.days || ' days without a visit')
      on conflict (idempotency_key) do nothing
      returning id into v_id;
      if v_id is not null then
        update public.business_memberships
           set points_balance = 0, updated_at = now()
         where id = r.id;
        v_n := v_n + 1;
      end if;
      continue;
    end if;

    -- ── remind: the tightest stage that applies, once per deadline ──
    v_left := ceil(extract(epoch from (r.deadline - now())) / 86400)::int;
    v_stage := case when v_left <= 1 then 1 when v_left <= 3 then 3 when v_left <= 7 then 7
                    when v_left <= 14 then 14 when v_left <= 30 then 30 end;
    continue when v_stage is null;
    v_hour := extract(hour from (now() at time zone r.tz))::int;
    continue when v_hour < 10 or v_hour >= 20;
    continue when exists (select 1 from public.points_expiry_reminders e
                           where e.membership_id = r.id and e.deadline = r.deadline::date and e.stage = v_stage);

    select rw.name into v_reward from public.rewards rw
     where rw.business_id = r.business_id and rw.is_active and rw.archived_at is null
       and coalesce(rw.show_in_store, true) and rw.point_cost > 1 and rw.point_cost <= r.points_balance
     order by rw.point_cost desc limit 1;
    v_date := to_char(r.deadline at time zone r.tz, 'FMMon FMDD');

    v_title := case v_stage
      when 30 then '⏳ Your ' || to_char(r.points_balance, 'FM999,999,999') || ' points expire in ' || v_left || ' days'
      when 14 then '🎟️ ' || to_char(r.points_balance, 'FM999,999,999') || ' points still waiting for you'
      when 7  then '⏰ 1 week left on your ' || to_char(r.points_balance, 'FM999,999,999') || ' points'
      when 3  then '⚠️ Your ' || to_char(r.points_balance, 'FM999,999,999') || ' points expire in 3 days'
      else         '🚨 Last call: your ' || to_char(r.points_balance, 'FM999,999,999') || ' points expire within a day' end;
    v_body := case v_stage
      when 30 then 'Points at ' || r.biz || ' stay active with any visit. Stop by before ' || v_date || ' to keep them.'
      when 14 then 'They expire ' || v_date || '. Any visit or reward at ' || r.biz || ' resets the clock.'
      when 7  then 'Come play at ' || r.biz || ' before ' || v_date || ' — a visit keeps every point.'
      when 3  then 'Visit ' || r.biz || ' by ' || v_date || ' or they''re gone.'
      else         'Swing by ' || r.biz || ' today or tomorrow to save them.' end
      || coalesce(' That''s enough for ' || v_reward || '!', '');

    insert into public.notifications (user_id, business_id, kind, title, body, link_path, source, family)
    values (r.user_id, r.business_id, 'reward_expiration', v_title, v_body, '/app/rewards', 'legacy', 'points_expiry');
    insert into public.points_expiry_reminders (membership_id, deadline, stage)
    values (r.id, r.deadline::date, v_stage) on conflict do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.process_points_expiry() from public, anon, authenticated;

select cron.schedule('atlas-points-expiry', '41 * * * *', 'select public.process_points_expiry();');

-- ───────── gift-expiry reminders read the per-member expiry (part 1) ─────────
create or replace function public.notify_expiring_gifts()
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare v_n int := 0; r record; v_stage text; v_hours numeric; v_biz text; v_hour int;
begin
  for r in
    select 'redemption' as ref_kind, d.id as ref_id, m.user_id, d.business_id, d.expires_at,
           coalesce(rw.name, 'your reward') as what, '/app/rewards' as link
      from public.redemptions d
      join public.business_memberships m on m.id = d.membership_id
      left join public.rewards rw on rw.id = d.reward_id
     where d.status = 'pending' and d.expires_at is not null
       and d.expires_at between now() and now() + interval '48 hours'
    union all
    select 'streak_gift', g.id, m.user_id, g.business_id, g.expires_at,
           coalesce(g.label, 'your streak gift'), '/app/streaks'
      from public.member_streak_gifts g
      join public.business_memberships m on m.id = g.membership_id
     where g.claimed_at is null and g.expires_at is not null
       and g.expires_at between now() and now() + interval '48 hours'
    union all
    select 'saved_offer', c.id, m.user_id, c.business_id, public.saved_offer_expires_at(c, o.expires_at),
           o.title, '/app/rewards'
      from public.customer_saved_offers c
      join public.business_memberships m on m.id = c.membership_id
      join public.offers o on o.id = c.offer_id
     where c.fulfilled_at is null and c.redeem_code is not null and o.is_active
       and coalesce(o.discount_type, 'none') <> 'points_bonus'
       and public.saved_offer_expires_at(c, o.expires_at) between now() and now() + interval '48 hours'
  loop
    v_hour := extract(hour from (now() at time zone public.business_timezone(r.business_id)))::int;
    continue when v_hour < 9 or v_hour >= 20;

    v_hours := extract(epoch from (r.expires_at - now())) / 3600;
    v_stage := case when v_hours <= 3 then 'last_call' else 'soon' end;
    continue when exists (select 1 from public.expiry_reminders_sent e where e.ref_kind = r.ref_kind and e.ref_id = r.ref_id and e.stage = v_stage);
    select name into v_biz from public.businesses where id = r.business_id;

    insert into public.notifications (user_id, business_id, kind, title, body, link_path)
    values (r.user_id, r.business_id, 'reward_expiration',
            case when v_stage = 'last_call'
                 then '⏰ Last call: ' || r.what || ' expires in ' || greatest(1, round(v_hours))::int || 'h'
                 else '⏰ ' || r.what || ' expires ' || case when v_hours < 24 then 'today' else 'tomorrow' end end,
            case when v_stage = 'last_call'
                 then 'Show it at the desk at ' || coalesce(v_biz, 'your spot') || ' before it''s gone.'
                 else 'Don''t let it slip — it''s waiting at ' || coalesce(v_biz, 'your spot') || '.' end,
            r.link);
    insert into public.expiry_reminders_sent (ref_kind, ref_id, stage) values (r.ref_kind, r.ref_id, v_stage)
      on conflict do nothing;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;
