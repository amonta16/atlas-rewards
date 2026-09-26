-- CP-161 · notifications in line: one gate, no doubles, feature-aware,
-- expiry reminders that actually run (and stop once redeemed). Safe to re-run.

-- ── 1. reward_unlocked: the DB trigger now writes ONE coalesced row ────────
-- It used to write one row per crossed reward AND the desk route wrote a
-- coalesced row → the bell showed "Reward unlocked ×3" + "You unlocked 3".
create or replace function public._notif_reward_unlocked()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name  text; v_names text[]; v_n int; v_title text; v_body text;
begin
  if new.points_balance <= old.points_balance then return new; end if;
  select name into v_name from public.businesses where id = new.business_id;

  select array_agg(r.name order by r.point_cost desc), count(*)
    into v_names, v_n
    from public.rewards r
   where r.business_id = new.business_id
     and r.is_active = true
     and coalesce(r.show_in_store, true) = true
     and r.archived_at is null
     and r.point_cost <= new.points_balance
     and r.point_cost >  old.points_balance;
  if coalesce(v_n, 0) = 0 then return new; end if;

  v_title := case when v_n = 1 then 'Reward unlocked! 🎁' else 'You unlocked ' || v_n || ' rewards! 🎁' end;
  v_body  := 'You can now redeem ' || array_to_string(v_names[1:3], ', ')
             || case when v_n > 3 then ' and ' || (v_n - 3) || ' more' else '' end
             || ' at ' || coalesce(v_name, 'your spot') || '.';

  -- Stamped push_sent_at: the desk route sends the single phone push itself.
  insert into public.notifications (user_id, business_id, kind, title, body, link_path, push_sent_at)
  values (new.user_id, new.business_id, 'reward_unlocked', v_title, v_body, '/app/rewards', now());
  return new;
end $$;

-- ── 2. The gate: BEFORE INSERT on notifications ────────────────────────────
create or replace function public._notif_gate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s          public.business_notification_settings%rowtype;
  v_streaks  boolean := false;
  v_spin     boolean := false;
  v_reviews  boolean := false;
  v_dupe_win interval := interval '90 seconds';
begin
  if new.business_id is null then return new; end if;

  select * into s from public.business_notification_settings where business_id = new.business_id;
  select coalesce(is_enabled, false) into v_streaks from public.streak_config where business_id = new.business_id;
  select coalesce(is_enabled, false) into v_spin    from public.business_mystery_config where business_id = new.business_id;
  select coalesce((widget_config ->> 'reviews')::boolean, false) into v_reviews from public.businesses where id = new.business_id;

  -- a) business-level toggles (agency settings panel). Missing row = all on.
  begin
    if new.kind = 'streak'             and not coalesce(s.streak_reminders, true)              then return null; end if;
    if new.kind = 'reward_expiration'  and not coalesce(s.gift_expiration_reminders, true)     then return null; end if;
    if new.kind = 'customer_offer'     and not coalesce(s.customer_offer_announcements, true)  then return null; end if;
    if new.kind = 'check_in_available' and not coalesce(s.check_in_available, true)            then return null; end if;
    if new.kind = 'we_miss_you'        and not coalesce(s.we_miss_you, true)                   then return null; end if;
    if new.kind = 'reward_unlocked'    and not coalesce(s.reward_unlocked, true)               then return null; end if;
    if new.kind = 'birthday'           and not coalesce(s.birthday, true)                      then return null; end if;
    if new.kind = 'review_request'     and not coalesce(s.review_request, true)                then return null; end if;
  end;

  -- b) feature toggles in the app builder
  if new.kind = 'streak' and not v_streaks then return null; end if;
  if new.kind = 'review_request' and not v_reviews then return null; end if;
  if new.kind in ('daily_check', 'check_in_available') then
    if not v_streaks and not v_spin then return null; end if;       -- nothing to come back for
    if not v_streaks then
      -- streaks are off: never mention them; talk about the spin instead
      if new.kind = 'daily_check' then
        new.body := 'Your daily spin is unlocked — tap to play.';
        new.link_path := '/app/scan';
      end if;
      if new.kind = 'check_in_available' and new.body ilike '%streak%' then
        new.title := '🎰 Your spin is ready';
        new.body  := 'Come back and spin for a surprise reward.';
      end if;
    end if;
  end if;

  -- c) de-dupe: same person, same business, same kind inside 90s → drop.
  --    Expiry reminders are per gift, so they de-dupe on kind + title.
  if new.kind = 'reward_expiration' then
    if exists (
      select 1 from public.notifications n
       where n.user_id = new.user_id and n.business_id = new.business_id
         and n.kind = new.kind and n.title = new.title
         and n.created_at > now() - v_dupe_win
    ) then return null; end if;
  elsif new.kind in ('reward_unlocked','daily_check','check_in_available','streak','review_request','birthday','automated_offer') then
    if exists (
      select 1 from public.notifications n
       where n.user_id = new.user_id and n.business_id = new.business_id and n.kind = new.kind
         and n.created_at > now() - v_dupe_win
    ) then return null; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_notif_gate on public.notifications;
create trigger trg_notif_gate before insert on public.notifications
  for each row execute function public._notif_gate();

-- ── 3. Expiry reminders for everything short-lived ─────────────────────────
-- Wheel prizes + store redemptions (redemptions.expires_at), unclaimed
-- streak gifts (member_streak_gifts.expires_at) and saved offers/gifts
-- (offers.expires_at). Two nudges each: ~48h out and ~3h out ("last call").
-- Skipped the moment the thing is redeemed / claimed / expired.
create table if not exists public.expiry_reminders_sent (
  ref_kind text not null, ref_id uuid not null, stage text not null,
  sent_at timestamptz not null default now(),
  primary key (ref_kind, ref_id, stage)
);

create or replace function public.notify_expiring_gifts()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int := 0; r record; v_stage text; v_hours numeric; v_biz text;
begin
  for r in
    -- pending redemptions (wheel prizes, store)
    select 'redemption' as ref_kind, d.id as ref_id, m.user_id, d.business_id, d.expires_at,
           coalesce(rw.name, 'your reward') as what, '/app/rewards' as link
      from public.redemptions d
      join public.business_memberships m on m.id = d.membership_id
      left join public.rewards rw on rw.id = d.reward_id
     where d.status = 'pending' and d.expires_at is not null
       and d.expires_at between now() and now() + interval '48 hours'
    union all
    -- unclaimed streak gifts
    select 'streak_gift', g.id, m.user_id, g.business_id, g.expires_at,
           coalesce(g.label, 'your streak gift'), '/app/streaks'
      from public.member_streak_gifts g
      join public.business_memberships m on m.id = g.membership_id
     where g.claimed_at is null and g.expires_at is not null
       and g.expires_at between now() and now() + interval '48 hours'
    union all
    -- saved offers / gifts whose offer expires
    select 'saved_offer', c.id, m.user_id, c.business_id, o.expires_at,
           o.title, '/app/rewards'
      from public.customer_saved_offers c
      join public.business_memberships m on m.id = c.membership_id
      join public.offers o on o.id = c.offer_id
     where c.fulfilled_at is null and c.redeem_code is not null
       and o.expires_at is not null
       and o.expires_at between now() and now() + interval '48 hours'
  loop
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
end $$;
revoke all on function public.notify_expiring_gifts() from public, anon, authenticated;

do $$ begin perform cron.unschedule('atlas-expiry-reminders'); exception when others then null; end $$;
select cron.schedule('atlas-expiry-reminders', '23 * * * *', $$ select public.notify_expiring_gifts(); $$);
