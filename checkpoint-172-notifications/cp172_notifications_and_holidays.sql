-- CP-172 · Notification audit fixes + Memorial Day / Labor Day + the two
--          automated offers that never fired (Come Back & Save, Anniversary)
--
-- Findings from the audit (each fixed below):
--   F1  "Your spin is ready" fired exactly 12 h after a visit — a 3 pm visit
--       buzzed the phone at 3 am. Now lands inside 10:00–20:00 local.
--   F2  Same reminder had no frequency cap: a 3×/week regular got 3 pushes a
--       week saying the same thing. Now at most one per 3 days per business.
--   F3  Expiry reminders ("⏰ last call") ran every hour incl. overnight.
--       Now only 09:00–20:00 local per business.
--   F4  Verifying an Instagram / Facebook follow sent "Your Google review was
--       verified". Platform-aware now.
--   F5  Review request after a reward pickup was sent to members who had
--       ALREADY left a verified Google review (every 14 days, forever), and to
--       businesses with no Google link. Both gated now.
--   F6  "Checked in ✓" pushed the phone while the member was standing at the
--       counter. Bell-only now unless the spin is on (then it's the hook:
--       "your spin is unlocked — tap to play").
--   F7  Holiday (date) automated offers were never scheduled — no cron called
--       trigger_automated_offers. Scheduled daily at 10 am Pacific, and a
--       fired holiday offer now also notifies members (kind customer_offer,
--       respects the business + member opt-outs).
--   F8  "Come Back & Save" (inactivity) and "Client Anniversary" templates
--       were selectable in the builder but had NO processor. Both fire now
--       (hourly cron, 10:00–19:00 local, idempotent).
--   F9  The nightly birthday-points cron (process_birthdays) has been FAILING
--       whenever someone actually had a birthday: it calls award_points(),
--       whose CP-44 gate rejects a caller with no auth.uid() (cron). Sep 26 at
--       Flippo's: "permission denied: cannot award points here" → no points.
--       Credits inline now (same pattern as the welcome/birthday gifts), and
--       runs hourly gated to 09:00–20:00 local instead of 2 am Pacific.
--   F10 process_dormancy has failed every day since it was written — it sets
--       status = 'dormant' but the check constraint didn't allow it.
--   F11 No ceiling on pushes: a member could get a spin reminder, an expiry
--       reminder, a holiday offer and a birthday in one afternoon. Now at most
--       2 marketing pushes per business per day; the rest stay bell-only.
--   NEW Memorial Day (last Monday of May) and Labor Day (first Monday of
--       September) templates — floating-date rules.
--
-- Idempotent. Safe to re-run.

-- ───────────── F1 · check-in reminder lands in waking hours ─────────────
create or replace function public._land_in_waking_hours(p_at timestamptz, p_tz text)
returns timestamptz language plpgsql stable as $$
declare v_local timestamp; v_hour int;
begin
  v_local := p_at at time zone p_tz;
  v_hour  := extract(hour from v_local)::int;
  if v_hour >= 20 then
    -- after 8 pm → 10:00 tomorrow
    return ((v_local::date + 1) + time '10:00') at time zone p_tz;
  elsif v_hour < 10 then
    -- before 10 am → 10:00 today
    return (v_local::date + time '10:00') at time zone p_tz;
  end if;
  return p_at;
end $$;

create or replace function public._queue_checkin_available_notif()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user uuid; v_business uuid; v_business_name text; v_dedupe text; v_has_spin boolean;
  v_fire timestamptz;
begin
  select m.user_id, m.business_id, b.name
    into v_user, v_business, v_business_name
    from public.business_memberships m
    join public.businesses b on b.id = m.business_id
   where m.id = new.membership_id;
  if v_user is null then return new; end if;

  v_dedupe := 'checkin_avail:' || v_business::text;
  -- CP-172 F1: 12 h cooldown, then pushed into 10:00–20:00 local.
  v_fire := public._land_in_waking_hours(now() + interval '12 hours', public.business_timezone(v_business));

  update public.notification_queue
     set fire_at = v_fire, created_at = now()
   where user_id = v_user and dedupe_key = v_dedupe and fired_at is null;
  if found then return new; end if;

  select coalesce(is_enabled, false) into v_has_spin
    from public.business_mystery_config where business_id = v_business;

  begin
    insert into public.notification_queue
      (fire_at, user_id, business_id, kind, title, body, link_path, dedupe_key)
    values (
      v_fire, v_user, v_business, 'check_in_available',
      case when v_has_spin then '🎰 Your spin is ready at ' || coalesce(v_business_name, 'your spot')
           else '✨ You can check in again' end,
      case when v_has_spin then 'Come back and spin for a surprise reward.'
           else 'Stop by and scan to keep your streak going.' end,
      '/app/scan', v_dedupe);
  exception when unique_violation then null;
  end;
  return new;
end $$;

-- ───────────── F2 · one check-in reminder per 3 days ─────────────
create or replace function public.fire_due_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count int := 0;
begin
  with due as (
    select q.id, q.user_id, q.business_id, q.kind, q.title, q.body, q.link_path
      from public.notification_queue q
     where q.fired_at is null and q.fire_at <= now()
     limit 200 for update skip locked
  ),
  deliverable as (
    select d.* from due d
     where exists (select 1 from public.business_memberships m where m.user_id = d.user_id and m.business_id = d.business_id)
       and (
         d.kind <> 'check_in_available'
         or (
           -- they haven't been back since the cooldown started
           not exists (
             select 1 from public.check_in_events c
             join public.business_memberships m2 on m2.id = c.membership_id
            where m2.user_id = d.user_id and m2.business_id = d.business_id
              and c.created_at > now() - interval '12 hours')
           -- CP-172 F2: and we haven't nudged them about this in the last 3 days
           and not exists (
             select 1 from public.notifications n
              where n.user_id = d.user_id and n.business_id = d.business_id
                and n.kind = 'check_in_available'
                and n.created_at > now() - interval '3 days')
         )
       )
  ),
  ins as (
    insert into public.notifications (user_id, business_id, kind, title, body, link_path)
    select user_id, business_id, kind, title, body, link_path from deliverable
    returning 1
  ),
  upd as (
    update public.notification_queue set fired_at = now() where id in (select id from due) returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end $$;

-- ───────────── F3 · expiry reminders only in waking hours ─────────────
create or replace function public.notify_expiring_gifts()
returns integer language plpgsql security definer set search_path = public as $$
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
    select 'saved_offer', c.id, m.user_id, c.business_id, o.expires_at,
           o.title, '/app/rewards'
      from public.customer_saved_offers c
      join public.business_memberships m on m.id = c.membership_id
      join public.offers o on o.id = c.offer_id
     where c.fulfilled_at is null and c.redeem_code is not null
       and o.expires_at is not null
       and o.expires_at between now() and now() + interval '48 hours'
  loop
    -- CP-172 F3: 09:00–20:00 local only; the hourly cron picks it up later.
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
end $$;

-- ───────────── F4 · platform-aware "verified" message ─────────────
create or replace function public._notif_review_verified()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_business uuid; v_name text; v_what text;
begin
  if NEW.status = 'verified' and (OLD is null or OLD.status is distinct from 'verified') then
    select m.user_id, m.business_id, b.name into v_user, v_business, v_name
      from public.business_memberships m join public.businesses b on b.id = m.business_id
     where m.id = NEW.membership_id;
    if v_user is not null then
      v_what := case NEW.platform when 'instagram' then 'Instagram follow'
                                  when 'facebook'  then 'Facebook follow'
                                  else 'Google review' end;
      insert into public.notifications (user_id, business_id, kind, title, body, link_path)
      values (v_user, v_business, 'review',
              'Your ' || v_what || ' was verified 🎉',
              'Points have been added to your account at ' || v_name || '.',
              '/app/rewards');
    end if;
  end if;
  return NEW;
end $$;

-- ───────────── F5 · don't ask reviewers for a review ─────────────
create or replace function public._notif_review_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_business uuid; v_name text; v_url text; v_recent int;
begin
  if NEW.status <> 'fulfilled' or (OLD.status = 'fulfilled') then return NEW; end if;

  select m.user_id, m.business_id, b.name, b.google_review_url
    into v_user, v_business, v_name, v_url
    from public.business_memberships m join public.businesses b on b.id = m.business_id
   where m.id = NEW.membership_id;
  if v_user is null then return NEW; end if;
  -- CP-172 F5: no Google link → nothing to ask for.
  if coalesce(btrim(v_url), '') = '' then return NEW; end if;
  -- CP-172 F5: already reviewed (verified or pending) → never ask again.
  if exists (select 1 from public.reviews r where r.membership_id = NEW.membership_id
              and r.platform = 'google' and r.status in ('verified','pending')) then return NEW; end if;

  select count(*) into v_recent from public.notifications n
   where n.user_id = v_user and n.business_id = v_business
     and n.kind = 'review_request' and n.created_at > now() - interval '14 days';
  if v_recent > 0 then return NEW; end if;

  insert into public.notifications (user_id, business_id, kind, title, body, link_path)
  values (v_user, v_business, 'review_request',
          'Enjoyed it? Leave a quick Google review ⭐',
          'It takes 30 seconds and helps ' || coalesce(v_name, 'them') || ' a ton.',
          '/app/rewards?focus=review');
  return NEW;
end $$;

-- ───────────── F6 · "Checked in ✓" is bell-only unless the spin is on ─────────────
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
    -- CP-172 F6: the member is at the counter. Only buzz the phone when there
    -- is something to DO right now (the spin); otherwise bell only.
    if new.kind = 'daily_check' and not v_spin and new.push_sent_at is null then
      new.push_sent_at := now();
    end if;
  end if;

  -- CP-172 F11 · daily push budget. A member gets at most TWO marketing-style
  -- pushes per business per local day (reminders, offers, win-backs,
  -- birthdays, review asks). Anything past that still lands in the bell but
  -- does not buzz the phone. Transactional messages (verified, raffle won,
  -- referral, pass activated) and "last call" expiries are exempt.
  if new.kind in ('check_in_available','reward_expiration','we_miss_you','customer_offer','automated_offer','streak','review_request','birthday','announcement')
     and new.push_sent_at is null
     and new.title not ilike '%last call%' then
    if (select count(*) from public.notifications n
         where n.user_id = new.user_id and n.business_id = new.business_id
           and n.kind in ('check_in_available','reward_expiration','we_miss_you','customer_offer','automated_offer','streak','review_request','birthday','announcement')
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
end $$;

-- ───────────── NEW · Memorial Day + Labor Day templates ─────────────
insert into public.automated_offer_templates (slug, name, emoji, description, trigger_type, trigger_config)
select 'memorial_day', 'Memorial Day', '🇺🇸', 'Long-weekend promo — last Monday of May.', 'date',
       '{"rule":"last_monday","month":5,"window_days":4}'::jsonb
 where not exists (select 1 from public.automated_offer_templates where slug = 'memorial_day');
insert into public.automated_offer_templates (slug, name, emoji, description, trigger_type, trigger_config)
select 'labor_day', 'Labor Day', '🛠️', 'End-of-summer promo — first Monday of September.', 'date',
       '{"rule":"first_monday","month":9,"window_days":4}'::jsonb
 where not exists (select 1 from public.automated_offer_templates where slug = 'labor_day');

/** Resolve a date-template config to this year's calendar date. */
create or replace function public._automated_offer_date(p_cfg jsonb, p_year int)
returns date language plpgsql immutable as $$
declare v_month int; v_d date; v_rule text;
begin
  v_month := (p_cfg->>'month')::int;
  v_rule  := p_cfg->>'rule';
  if v_month is null then return null; end if;
  if v_rule = 'last_monday' then
    v_d := (make_date(p_year, v_month, 1) + interval '1 month - 1 day')::date;   -- last day of month
    return v_d - ((extract(isodow from v_d)::int + 6) % 7);                     -- back to Monday
  elsif v_rule = 'first_monday' then
    v_d := make_date(p_year, v_month, 1);
    return v_d + ((8 - extract(isodow from v_d)::int) % 7);                      -- forward to Monday
  elsif (p_cfg->>'day') is not null then
    return make_date(p_year, v_month, (p_cfg->>'day')::int);
  end if;
  return null;
end $$;

-- ───────────── F7 · holiday offers fire AND tell members ─────────────
create or replace function public.trigger_automated_offers()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_row record; v_cfg jsonb; v_window int; v_date date; v_diff int; v_count int := 0;
  v_expires_at timestamptz; v_offer uuid; v_title text; v_tz text; v_today date;
begin
  for v_row in
    select o.id as config_id, o.business_id, o.custom_title, o.custom_description,
           o.custom_image_url, o.discount_type, o.discount_value, o.gift_reward_id,
           o.expires_after_days, o.voice_message_url, o.last_triggered_at, o.custom_trigger_config,
           t.slug, t.name, t.emoji, t.default_image_url, t.trigger_config
      from public.business_automated_offers o
      join public.automated_offer_templates t on t.id = o.template_id
     where o.is_active and t.trigger_type = 'date'
  loop
    v_tz    := public.business_timezone(v_row.business_id);
    v_today := (now() at time zone v_tz)::date;
    -- the business's own date wins; template date (or rule) is the fallback
    v_cfg := case when v_row.custom_trigger_config ? 'month' then v_row.custom_trigger_config else v_row.trigger_config end;
    v_date := public._automated_offer_date(v_cfg, extract(year from v_today)::int);
    continue when v_date is null;
    v_window := coalesce((v_cfg->>'window_days')::int, 0);
    v_diff := abs(v_today - v_date);
    continue when v_diff > v_window;
    continue when v_row.last_triggered_at is not null and v_row.last_triggered_at > now() - interval '30 days';

    v_title := coalesce(v_row.custom_title, v_row.emoji || ' ' || v_row.name);
    v_expires_at := now() + (coalesce(v_row.expires_after_days, 7) || ' days')::interval;

    insert into public.offers
      (business_id, title, description, image_url, voice_message_url,
       discount_type, discount_value, gift_reward_id, expires_at, is_active, is_featured, is_automated)
    values
      (v_row.business_id, v_title, v_row.custom_description,
       coalesce(v_row.custom_image_url, v_row.default_image_url), v_row.voice_message_url,
       coalesce(v_row.discount_type, 'none'), v_row.discount_value, v_row.gift_reward_id,
       v_expires_at, true, true, true)
    returning id into v_offer;

    update public.business_automated_offers set last_triggered_at = now() where id = v_row.config_id;

    -- CP-172 F7: tell the members (kind customer_offer → business + member opt-outs apply)
    insert into public.notifications (user_id, business_id, kind, title, body, link_path)
    select m.user_id, m.business_id, 'customer_offer', v_title,
           coalesce(nullif(v_row.custom_description, ''), 'A limited-time offer just went live — tap to see it.')
             || ' Ends ' || to_char(v_expires_at at time zone v_tz, 'Mon DD') || '.',
           '/app/offers'
      from public.business_memberships m
     where m.business_id = v_row.business_id
       and coalesce(m.is_demo, false) = false
       and m.status <> 'blocked';

    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ───────────── F8 · Come Back & Save + Anniversary actually fire ─────────────
/** Grant one automated-offer config to one member: master offer row,
 *  points (if points_bonus), per-member saved row (fresh code), notification. */
create or replace function public._grant_automated_offer(
  p_config_id uuid, p_membership_id uuid, p_kind text, p_title_fallback text, p_body_fallback text, p_idem text)
returns boolean language plpgsql security definer set search_path = public as $$
declare o record; v_user uuid; v_master uuid; v_title text; v_expires timestamptz; v_points boolean; v_bal int;
begin
  select bao.*, t.name as template_name, t.emoji as template_emoji, t.default_image_url
    into o from public.business_automated_offers bao join public.automated_offer_templates t on t.id = bao.template_id
   where bao.id = p_config_id;
  if o.id is null then return false; end if;
  select user_id into v_user from public.business_memberships where id = p_membership_id;
  if v_user is null then return false; end if;

  v_title   := coalesce(o.custom_title, o.template_emoji || ' ' || o.template_name);
  v_expires := now() + (coalesce(o.expires_after_days, 7) || ' days')::interval;
  v_points  := (o.discount_type = 'points_bonus' and coalesce(o.discount_value, 0) > 0);

  select id into v_master from public.offers where welcome_config_id = o.id;
  if v_master is null then
    insert into public.offers (business_id, title, description, image_url, voice_message_url, expires_at,
                               is_active, is_featured, is_automated, welcome_config_id, discount_type, discount_value, gift_reward_id)
    values (o.business_id, v_title, o.custom_description, coalesce(o.custom_image_url, o.default_image_url),
            o.voice_message_url, v_expires, true, false, true, o.id,
            coalesce(o.discount_type, 'none'), o.discount_value, o.gift_reward_id)
    returning id into v_master;
  else
    update public.offers set title = v_title, description = o.custom_description,
           image_url = coalesce(o.custom_image_url, o.default_image_url), voice_message_url = o.voice_message_url,
           expires_at = v_expires, is_active = true, discount_type = coalesce(o.discount_type, 'none'),
           discount_value = o.discount_value, gift_reward_id = o.gift_reward_id
     where id = v_master;
  end if;

  if v_points and not exists (select 1 from public.points_ledger where idempotency_key = p_idem) then
    update public.business_memberships
       set points_balance = points_balance + o.discount_value,
           lifetime_points_earned = lifetime_points_earned + o.discount_value, updated_at = now()
     where id = p_membership_id returning points_balance into v_bal;
    insert into public.points_ledger (membership_id, business_id, delta, rule_type, reference_id, idempotency_key, balance_after, notes, created_by)
    values (p_membership_id, o.business_id, o.discount_value, 'automated_offer', o.id, p_idem, v_bal, v_title, v_user);
    begin perform public.recalc_tier(p_membership_id); exception when others then null; end;
  end if;

  insert into public.customer_saved_offers (membership_id, offer_id, business_id, fulfilled_at)
  values (p_membership_id, v_master, o.business_id, case when v_points then now() else null end)
  on conflict (membership_id, offer_id) do update
    set saved_at = now(), revealed_at = null,
        fulfilled_at = case when v_points then now() else null end,
        redeem_code = case when v_points then customer_saved_offers.redeem_code
                           else upper(substring(translate(md5(random()::text || clock_timestamp()::text), 'oOiIlL01', '') from 1 for 7)) end;

  begin
    insert into public.notifications (user_id, business_id, kind, title, body, link_path)
    values (v_user, o.business_id, p_kind,
            case when v_points then v_title || ' · +' || o.discount_value || ' pts' else coalesce(nullif(o.custom_title,''), p_title_fallback) end,
            coalesce(nullif(o.custom_description, ''), p_body_fallback), '/app');
  exception when others then null; end;
  return true;
end $$;

create or replace function public.process_member_date_offers()
returns integer language plpgsql security definer set search_path = public as $$
declare o record; m record; v_tz text; v_local timestamp; v_hour int; v_days int; v_count int := 0; v_biz text;
begin
  for o in
    select bao.id as config_id, bao.business_id, t.trigger_type, t.trigger_config, bao.custom_trigger_config
      from public.business_automated_offers bao
      join public.automated_offer_templates t on t.id = bao.template_id
     where bao.is_active and t.trigger_type in ('inactivity', 'anniversary')
  loop
    v_tz := public.business_timezone(o.business_id);
    v_local := now() at time zone v_tz;
    v_hour := extract(hour from v_local)::int;
    continue when v_hour < 10 or v_hour >= 19;          -- waking hours only
    select name into v_biz from public.businesses where id = o.business_id;

    if o.trigger_type = 'inactivity' then
      v_days := coalesce((o.custom_trigger_config->>'days')::int, (o.trigger_config->>'days')::int, 14);
      for m in
        select bm.id from public.business_memberships bm
         where bm.business_id = o.business_id and coalesce(bm.is_demo,false) = false and bm.status <> 'blocked'
           and bm.last_visit_at is not null
           and bm.last_visit_at < now() - (v_days || ' days')::interval
           and bm.last_visit_at > now() - ((v_days + 30) || ' days')::interval          -- give up after a month past the mark
           -- once per lapse: nothing granted since their last visit
           and not exists (select 1 from public.customer_saved_offers s join public.offers ofr on ofr.id = s.offer_id
                            where s.membership_id = bm.id and ofr.welcome_config_id = o.config_id and s.saved_at > bm.last_visit_at)
           -- and staff didn't just send a manual win-back
           and not exists (select 1 from public.notifications n where n.user_id = bm.user_id and n.business_id = bm.business_id
                            and n.kind = 'we_miss_you' and n.created_at > now() - interval '14 days')
      loop
        if public._grant_automated_offer(o.config_id, m.id, 'we_miss_you',
             'We miss you at ' || coalesce(v_biz, 'your spot') || ' 👋',
             'It''s been a minute — a little something is waiting on your Home tab.',
             'comeback:' || m.id || ':' || o.config_id || ':' || to_char(v_local, 'YYYY-MM-DD')) then
          v_count := v_count + 1;
        end if;
      end loop;

    elsif o.trigger_type = 'anniversary' then
      for m in
        select bm.id from public.business_memberships bm
         where bm.business_id = o.business_id and coalesce(bm.is_demo,false) = false and bm.status <> 'blocked'
           and to_char(bm.joined_at at time zone v_tz, 'MM-DD') = to_char(v_local, 'MM-DD')
           and bm.joined_at < now() - interval '300 days'
           and not exists (select 1 from public.customer_saved_offers s join public.offers ofr on ofr.id = s.offer_id
                            where s.membership_id = bm.id and ofr.welcome_config_id = o.config_id
                              and s.saved_at >= date_trunc('year', v_local))
      loop
        if public._grant_automated_offer(o.config_id, m.id, 'automated_offer',
             '🥳 Happy Atlas-versary — a gift is waiting',
             'One year with ' || coalesce(v_biz, 'us') || '. Thanks for sticking around — tap to open your gift.',
             'anniv:' || m.id || ':' || o.config_id || ':' || to_char(v_local, 'YYYY')) then
          v_count := v_count + 1;
        end if;
      end loop;
    end if;

    if v_count > 0 then update public.business_automated_offers set last_triggered_at = now() where id = o.config_id; end if;
  end loop;
  return v_count;
end $$;

-- ───────────── F9 · birthday points that actually land ─────────────
create or replace function public.process_birthdays()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count int := 0; r record; v_bonus int; v_tz text; v_local timestamp; v_idem text; v_bal int;
begin
  for r in
    select m.id as membership_id, m.business_id, m.user_id, p.birthday
      from public.business_memberships m
      join public.profiles p on p.id = m.user_id
     where p.birthday is not null and coalesce(m.is_demo, false) = false
  loop
    v_tz := public.business_timezone(r.business_id);
    v_local := now() at time zone v_tz;
    continue when extract(hour from v_local) < 9 or extract(hour from v_local) >= 20;
    continue when to_char(r.birthday, 'MM-DD') <> to_char(v_local, 'MM-DD');

    select coalesce((point_rules->>'birthday')::int, 0) into v_bonus from public.businesses where id = r.business_id;
    continue when v_bonus <= 0;

    v_idem := 'birthday_' || r.membership_id || '_' || to_char(v_local, 'YYYY');
    continue when exists (select 1 from public.points_ledger where idempotency_key = v_idem);

    update public.business_memberships
       set points_balance = points_balance + v_bonus,
           lifetime_points_earned = lifetime_points_earned + v_bonus, updated_at = now()
     where id = r.membership_id returning points_balance into v_bal;
    insert into public.points_ledger (membership_id, business_id, delta, rule_type, idempotency_key, balance_after, notes, created_by)
    values (r.membership_id, r.business_id, v_bonus, 'birthday', v_idem, v_bal, 'Birthday bonus 🎂', r.user_id);
    begin perform public.recalc_tier(r.membership_id); exception when others then null; end;

    insert into public.notifications (user_id, business_id, kind, title, body, link_path)
    values (r.user_id, r.business_id, 'birthday', '🎂 Happy birthday! +' || v_bonus || ' points',
            'On us. Come celebrate — your points are already in your account.', '/app/rewards');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ───────────── F10 · let dormancy actually mark members dormant ─────────────
alter table public.business_memberships drop constraint if exists business_memberships_status_check;
alter table public.business_memberships add constraint business_memberships_status_check
  check (status = any (array['active','paused','canceled','pending','dormant','blocked']));

-- ───────────── crons ─────────────
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('atlas-holiday-offers', 'atlas-member-date-offers', 'atlas-birthday');
  perform cron.schedule('atlas-birthday',          '13 * * * *', 'select public.process_birthdays();');            -- hourly, gated to 9–20 local
  perform cron.schedule('atlas-holiday-offers',     '0 17 * * *', 'select public.trigger_automated_offers();');   -- 10:00 Pacific
  perform cron.schedule('atlas-member-date-offers', '37 * * * *', 'select public.process_member_date_offers();'); -- hourly, gated to 10–19 local
end $$;

select jobname, schedule from cron.job order by 1;
