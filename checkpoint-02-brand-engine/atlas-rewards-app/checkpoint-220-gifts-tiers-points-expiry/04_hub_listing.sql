-- CP-220 · part 4 — the Automation Hub lists the new points-expiry series and
-- keeps gift-expiry counts separate from it.
CREATE OR REPLACE FUNCTION public.wf_legacy_automations(p_business_id uuid)
 RETURNS TABLE(key text, name text, kind text, trigger_text text, action_text text, channel text, enabled boolean, sent_30d integer, last_fired_at timestamp with time zone, controlled_by text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s record; b record; v_streaks boolean; v_spin boolean;
begin
  perform public.wf_assert_admin();
  select * into s from public.business_notification_settings where business_id = p_business_id;
  select * into b from public.businesses where id = p_business_id;
  select coalesce(is_enabled,false) into v_streaks from public.streak_config where business_id = p_business_id;
  select coalesce(is_enabled,false) into v_spin from public.business_mystery_config where business_id = p_business_id;

  return query
  select 'offer:' || t.slug, coalesce(c.custom_title, t.emoji || ' ' || t.name),
         case t.trigger_type when 'signup' then 'trigger' else 'cron' end,
         case t.trigger_type when 'signup' then 'Member enrols (after the required waiver, if any)' when 'birthday' then 'Member''s birthday (hourly job)' when 'anniversary' then 'Signup anniversary (hourly job)'
                             when 'inactivity' then 'No visit in ' || coalesce((t.trigger_config->>'days')::text, '14') || ' days (hourly job)' else 'Date window (daily job)' end,
         case coalesce(c.discount_type,'none') when 'points_bonus' then '+' || coalesce(c.discount_value,0) || ' points' when 'reward' then 'Gift: ' || coalesce(rw.name,'reward') else 'Offer + notification' end,
         'push', coalesce(c.is_active,false),
         (select count(*)::int from public.customer_saved_offers so join public.offers o on o.id = so.offer_id where o.welcome_config_id = c.id and so.saved_at > now() - interval '30 days')
           + case when t.trigger_type = 'date' then (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'customer_offer' and n.created_at > now() - interval '30 days' and c.last_triggered_at > now() - interval '30 days') else 0 end,
         coalesce(c.last_triggered_at, (select max(so.saved_at) from public.customer_saved_offers so join public.offers o on o.id = so.offer_id where o.welcome_config_id = c.id)),
         'Offers → Automated'
    from public.automated_offer_templates t
    left join public.business_automated_offers c on c.template_id = t.id and c.business_id = p_business_id
    left join public.rewards rw on rw.id = c.gift_reward_id
   where c.id is not null or t.trigger_type <> 'date'
  union all
  select 'sys:birthday_points', '🎂 Birthday points', 'cron', 'Member''s birthday (hourly job)', '+' || coalesce((b.point_rules->>'birthday')::int, 0) || ' points + push', 'push',
         coalesce(s.birthday, true) and coalesce((b.point_rules->>'birthday')::int, 0) > 0,
         (select count(*)::int from public.points_ledger l where l.business_id = p_business_id and l.rule_type = 'birthday' and l.created_at > now() - interval '30 days'),
         (select max(l.created_at) from public.points_ledger l where l.business_id = p_business_id and l.rule_type = 'birthday'), 'Settings → Notifications · Birthday'
  union all
  select 'sys:reward_unlocked', '🎁 Reward unlocked', 'trigger', 'Balance crosses a reward''s cost', 'Push: "you unlocked …"', 'push', coalesce(s.reward_unlocked, true),
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'reward_unlocked' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'reward_unlocked'), 'Settings → Notifications'
  union all
  select 'sys:daily_check', '✅ Check-in confirmation', 'trigger', 'First check-in of the day', 'Bell: streak / spin status', 'in-app', v_streaks or v_spin,
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'daily_check' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'daily_check'), 'Streaks / Spin settings'
  union all
  select 'sys:check_in_available', '⏰ Check-in available again', 'trigger', '12 h after a check-in (lands 10–20 h local)', 'Push reminder', 'push', coalesce(s.check_in_available, true) and (v_streaks or v_spin),
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'check_in_available' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'check_in_available'), 'Settings → Notifications'
  union all
  select 'sys:streak', '🔥 Streak reminders & milestones', 'trigger', 'Streak events', 'Push', 'push', coalesce(s.streak_reminders, true) and v_streaks,
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'streak' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'streak'), 'Streaks'
  union all
  select 'sys:review_request', '⭐ Review request', 'trigger', 'Reward fulfilled, no review yet, none asked in 14 d', 'Push: leave a Google review', 'push', coalesce(s.review_request, true) and coalesce((b.widget_config->>'reviews')::boolean, false),
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'review_request' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'review_request'), 'Settings → Notifications'
  union all
  select 'sys:review_verified', '✔ Review verified', 'trigger', 'Desk verifies a review', 'Push: points added', 'push', coalesce((b.widget_config->>'reviews')::boolean, false),
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'review' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'review'), 'Desk → Reviews'
  union all
  select 'sys:expiring', '⌛ Gift expiring', 'cron', 'Each member''s gift / redemption expires in < 48 h (hourly job)', 'Push: "expires tomorrow" + "last call" at 3 h', 'push', coalesce(s.gift_expiration_reminders, true),
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'reward_expiration' and n.family is distinct from 'points_expiry' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'reward_expiration' and n.family is distinct from 'points_expiry'), 'Settings → Notifications'
  union all
  select 'sys:points_expiry', '⏳ Points expiring', 'cron',
         case when coalesce(b.points_expiry_days, 0) > 0
              then 'Points expire after ' || b.points_expiry_days || ' days with no visit, earn or redemption (hourly job)'
              else 'Off — points never expire for this business' end,
         'Push at 30 · 14 · 7 · 3 · 1 days before, then the balance expires', 'push',
         coalesce(b.points_expiry_days, 0) > 0 and coalesce(s.gift_expiration_reminders, true),
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.family = 'points_expiry' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.family = 'points_expiry'),
         'Entertainment apps · Settings → Notifications'
  union all
  select 'sys:referral', '👥 Referral payout', 'trigger', 'Referred friend''s first qualifying purchase', 'Points to both members', 'points', coalesce((b.widget_config->>'referrals')::boolean, false),
         (select count(*)::int from public.points_ledger l where l.business_id = p_business_id and l.rule_type = 'referral_referrer' and l.created_at > now() - interval '30 days'),
         (select max(l.created_at) from public.points_ledger l where l.business_id = p_business_id and l.rule_type = 'referral_referrer'), 'Settings → Features'
  union all
  select 'sys:winback_manual', '💌 Win-back (desk)', 'route', 'Staff sends from Insights', 'Home banner + push + bonus', 'push', coalesce(s.we_miss_you, true),
         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = 'we_miss_you' and n.source is distinct from 'workflow' and n.created_at > now() - interval '30 days'),
         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = 'we_miss_you' and n.source is distinct from 'workflow'), 'Insights → member'
  union all
  select 'sys:dormancy', '😴 Dormancy flag', 'cron', 'No visit in 60 days (daily job)', 'Member status → dormant (no message)', 'status', true,
         (select count(*)::int from public.business_memberships m where m.business_id = p_business_id and m.status = 'dormant' and m.updated_at > now() - interval '30 days'),
         (select max(m.updated_at) from public.business_memberships m where m.business_id = p_business_id and m.status = 'dormant'), 'always on';
end $function$;
