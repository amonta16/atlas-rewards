-- CP-216 · Automation Hub · 06 legacy bridge
-- APPLIED to production Oct 23 2026 (migration cp216_06_legacy_bridge). Safe to re-run.
--
-- What changes (and nothing else):
--  1. _notif_gate (BEFORE INSERT on notifications) — same body as before, plus:
--     a. source defaults to 'legacy' and family is derived from kind when the writer didn't set them
--        (we_miss_you→winback, birthday→birthday, review_request→review, streak→streak, automated_offer→promo).
--     b. Family-overlap rule: if a notification of the same family reached the same user+business in the
--        last 7 days from a DIFFERENT source (legacy vs workflow), the new one is dropped. Same-source
--        rows don't block each other, so a multi-step workflow is never self-blocked and legacy keeps its
--        own behaviour exactly as before.
--     c. The F11 daily push budget (2 marketing pushes / member / business / 20 h) now also counts
--        workflow pushes (source='workflow'), in both directions.
--  2. _grant_automated_offer — identical, except the notification insert now sets source='legacy' and a
--     family derived from the template's trigger_type (signup→welcome, inactivity→winback, birthday,
--     anniversary, date→promo).
-- Other legacy writers (send_winback_v2, birthday points cron, streak, review, expiry) are untouched; the
-- gate stamps their source/family for them.

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
      or new.source = 'workflow')
     and new.push_sent_at is null
     and new.title not ilike '%last call%' then
    if (select count(*) from public.notifications n
         where n.user_id = new.user_id and n.business_id = new.business_id
           and (n.kind in ('check_in_available','reward_expiration','we_miss_you','customer_offer','automated_offer','streak','review_request','birthday','announcement')
                or n.source = 'workflow')
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

create or replace function public._grant_automated_offer(p_config_id uuid, p_membership_id uuid, p_kind text, p_title_fallback text, p_body_fallback text, p_idem text)
returns boolean language plpgsql security definer set search_path to 'public' as $function$
declare o record; v_user uuid; v_master uuid; v_title text; v_expires timestamptz; v_points boolean; v_bal int; v_family text;
begin
  select bao.*, t.name as template_name, t.emoji as template_emoji, t.default_image_url, t.trigger_type as template_trigger
    into o from public.business_automated_offers bao join public.automated_offer_templates t on t.id = bao.template_id
   where bao.id = p_config_id;
  if o.id is null then return false; end if;
  select user_id into v_user from public.business_memberships where id = p_membership_id;
  if v_user is null then return false; end if;

  v_title   := coalesce(o.custom_title, o.template_emoji || ' ' || o.template_name);
  v_expires := now() + (coalesce(o.expires_after_days, 7) || ' days')::interval;
  v_points  := (o.discount_type = 'points_bonus' and coalesce(o.discount_value, 0) > 0);
  v_family  := case o.template_trigger when 'signup' then 'welcome' when 'inactivity' then 'winback'
                 when 'birthday' then 'birthday' when 'anniversary' then 'anniversary' else 'promo' end;

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
    insert into public.notifications (user_id, business_id, kind, title, body, link_path, source, family)
    values (v_user, o.business_id, p_kind,
            case when v_points then v_title || ' · +' || o.discount_value || ' pts' else coalesce(nullif(o.custom_title,''), p_title_fallback) end,
            coalesce(nullif(o.custom_description, ''), p_body_fallback), '/app', 'legacy', v_family);
  exception when others then null; end;
  return true;
end $function$;
