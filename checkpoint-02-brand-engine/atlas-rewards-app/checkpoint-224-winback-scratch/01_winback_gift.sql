-- CP-224 · win-back = a scratch-card gift, one tap from the notification
--
-- Flow: staff send "We miss you" → push links to /app/gift/<message id> →
-- the app opens straight onto a scratch card → scratch → the reward is shown
-- and the bonus points land at that moment (what the desk modal already
-- promised: "Awarded the moment they tap the notification").
--
--   · customer_messages gets redemption_id (the free reward created at send,
--     so the front desk sees it and expiry reminders still work),
--     revealed_at, and points_credited_at;
--   · rows from before CP-224 already had their points credited at send →
--     backfilled points_credited_at so a claim never double-credits;
--   · send_winback_v2 no longer credits points at send; claim_gift does, once
--     (points_ledger idempotency key 'winback:<message id>').

alter table public.customer_messages add column if not exists redemption_id uuid references public.redemptions(id) on delete set null;
alter table public.customer_messages add column if not exists revealed_at timestamptz;
alter table public.customer_messages add column if not exists points_credited_at timestamptz;

update public.customer_messages
   set points_credited_at = created_at
 where points_credited_at is null and coalesce(bonus_points, 0) > 0
   and created_at < now();

CREATE OR REPLACE FUNCTION public.send_winback_v2(p_business_id uuid, p_membership_id uuid, p_title text, p_body text, p_bonus_points integer DEFAULT NULL::integer, p_reward_id uuid DEFAULT NULL::uuid, p_expires_days integer DEFAULT 7)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_id uuid; v_user uuid; v_exp timestamptz; v_reward_name text; v_biz text; v_code text; v_red uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  select m.user_id into v_user from public.business_memberships m where m.id = p_membership_id and m.business_id = p_business_id;
  if v_user is null then raise exception 'membership not found'; end if;
  select name into v_biz from public.businesses where id = p_business_id;
  v_exp := now() + (greatest(1, coalesce(p_expires_days, 7)) || ' days')::interval;

  if p_reward_id is not null then
    select name into v_reward_name from public.rewards where id = p_reward_id and business_id = p_business_id and archived_at is null;
    if v_reward_name is null then raise exception 'reward not found'; end if;
    v_code := public.generate_redemption_code(p_business_id);
    insert into public.redemptions (membership_id, reward_id, business_id, point_cost, code, status, expires_at)
    values (p_membership_id, p_reward_id, p_business_id, 0, v_code, 'pending', v_exp)
    returning id into v_red;
  end if;

  insert into public.customer_messages (business_id, membership_id, kind, title, body, bonus_points, expires_at, redemption_id)
  values (p_business_id, p_membership_id, 'winback', coalesce(p_title, 'We miss you ✨'),
          coalesce(p_body, 'Come back soon — something is waiting for you.'), nullif(greatest(coalesce(p_bonus_points, 0), 0), 0), v_exp, v_red)
  returning id into v_id;

  -- CP-224: no points yet — they land when the member scratches the gift (claim_gift).
  insert into public.notifications (user_id, business_id, kind, title, body, link_path)
  values (v_user, p_business_id, 'we_miss_you',
          coalesce(p_title, 'We miss you ✨'),
          case when p_reward_id is not null or coalesce(p_bonus_points, 0) > 0
               then '🎁 You have a gift waiting — tap to unwrap it.'
               else coalesce(p_body, 'Come back soon.') end,
          '/app/gift/' || v_id::text);
  return v_id;
end $function$;

-- The gift card, for its owner.
create or replace function public.my_gift(p_message_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r record;
begin
  select cm.*, m.user_id, b.slug, b.name as biz, rw.name as reward_name, rw.image_url as reward_image, rw.description as reward_desc,
         d.code, d.status as red_status, d.expires_at as red_expires
    into r
    from public.customer_messages cm
    join public.business_memberships m on m.id = cm.membership_id
    join public.businesses b on b.id = cm.business_id
    left join public.redemptions d on d.id = cm.redemption_id
    left join public.rewards rw on rw.id = d.reward_id
   where cm.id = p_message_id;
  if r.id is null or r.user_id is distinct from auth.uid() then return null; end if;
  return jsonb_build_object(
    'id', r.id, 'business_id', r.business_id, 'slug', r.slug, 'business_name', btrim(r.biz),
    'title', r.title, 'body', r.body, 'bonus_points', coalesce(r.bonus_points, 0),
    'reward_name', r.reward_name, 'reward_image', r.reward_image, 'reward_description', r.reward_desc,
    'code', r.code, 'reward_status', r.red_status,
    'expires_at', coalesce(r.red_expires, r.expires_at),
    'expired', coalesce(r.expires_at < now(), false),
    'revealed_at', r.revealed_at, 'points_credited', r.points_credited_at is not null);
end $$;
revoke execute on function public.my_gift(uuid) from public, anon;
grant execute on function public.my_gift(uuid) to authenticated;

-- Scratched → reveal + credit the bonus points (once).
create or replace function public.claim_gift(p_message_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r record; v_bal int; v_led uuid;
begin
  select cm.*, m.user_id into r
    from public.customer_messages cm join public.business_memberships m on m.id = cm.membership_id
   where cm.id = p_message_id for update of cm;
  if r.id is null or r.user_id is distinct from auth.uid() then raise exception 'not your gift' using errcode = '42501'; end if;
  if r.expires_at is not null and r.expires_at < now() and r.revealed_at is null then raise exception 'this gift has expired'; end if;

  if coalesce(r.bonus_points, 0) > 0 and r.points_credited_at is null then
    insert into public.points_ledger (business_id, membership_id, delta, rule_type, notes, idempotency_key, created_by)
    values (r.business_id, r.membership_id, r.bonus_points, 'winback_bonus', 'Win-back gift', 'winback:' || r.id::text, auth.uid())
    on conflict (idempotency_key) do nothing
    returning id into v_led;
    if v_led is not null then
      update public.business_memberships
         set points_balance = points_balance + r.bonus_points,
             lifetime_points_earned = lifetime_points_earned + r.bonus_points, updated_at = now()
       where id = r.membership_id returning points_balance into v_bal;
      update public.points_ledger set balance_after = v_bal where id = v_led;
    end if;
  end if;

  update public.customer_messages
     set revealed_at = coalesce(revealed_at, now()),
         points_credited_at = case when coalesce(bonus_points, 0) > 0 then coalesce(points_credited_at, now()) else points_credited_at end
   where id = r.id;

  select points_balance into v_bal from public.business_memberships where id = r.membership_id;
  return public.my_gift(p_message_id) || jsonb_build_object('new_balance', v_bal);
end $$;
revoke execute on function public.claim_gift(uuid) from public, anon;
grant execute on function public.claim_gift(uuid) to authenticated;
