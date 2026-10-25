-- CP-220 · part 1 — security lock, per-member gift expiry, welcome gift after
-- the required waiver, one push registration per device.

-- ───────────────────────────── 1. security ─────────────────────────────
-- _grant_automated_offer is an internal helper (only caller: the
-- process_member_date_offers cron, which runs as postgres). It was executable
-- by PUBLIC/anon/authenticated with no caller check → any member could re-arm
-- a used gift or mint points through /rest/v1/rpc.
revoke execute on function public._grant_automated_offer(uuid,uuid,text,text,text,text) from public, anon, authenticated;

-- ─────────────────────── 2. per-member gift expiry ──────────────────────
-- Automated gifts (welcome / birthday / anniversary / win-back) all point at
-- ONE shared master offer per config, and every grant reset that master's
-- expires_at — so "7 days" really meant "7 days after the latest signup" for
-- everyone. Each member's gift now carries its own expiry.
alter table public.customer_saved_offers add column if not exists expires_at timestamptz;

create or replace function public._saved_offer_set_expiry()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_cfg uuid; v_days int; v_trig text;
begin
  if tg_op = 'UPDATE' and new.saved_at is not distinct from old.saved_at then return new; end if;
  select o.welcome_config_id into v_cfg from public.offers o where o.id = new.offer_id;
  if v_cfg is null then return new; end if;            -- ordinary offers keep the offer's own expiry
  select bao.expires_after_days, t.trigger_type into v_days, v_trig
    from public.business_automated_offers bao
    join public.automated_offer_templates t on t.id = bao.template_id
   where bao.id = v_cfg;
  -- same defaults the grant functions used: signup gifts 30 days, others 7
  new.expires_at := coalesce(new.saved_at, now())
                    + make_interval(days => coalesce(v_days, case when v_trig = 'signup' then 30 else 7 end));
  return new;
end $$;

drop trigger if exists trg_saved_offer_expiry on public.customer_saved_offers;
create trigger trg_saved_offer_expiry
  before insert or update of saved_at on public.customer_saved_offers
  for each row execute function public._saved_offer_set_expiry();

-- Backfill: keep what each member can see today (nobody loses a gift tonight);
-- from here on every new grant gets its own clock.
update public.customer_saved_offers c
   set expires_at = coalesce(
         o.expires_at,
         c.saved_at + make_interval(days => coalesce(bao.expires_after_days, case when t.trigger_type = 'signup' then 30 else 7 end)))
  from public.offers o
  join public.business_automated_offers bao on bao.id = o.welcome_config_id
  join public.automated_offer_templates t on t.id = bao.template_id
 where o.id = c.offer_id and c.expires_at is null;

-- Effective expiry: the member's own, else the offer's, else 30 days from save.
create or replace function public.saved_offer_expires_at(p_saved public.customer_saved_offers, p_offer_expires timestamptz)
returns timestamptz language sql immutable as $$
  select coalesce(p_saved.expires_at, p_offer_expires, p_saved.saved_at + interval '30 days')
$$;

create or replace function public.my_saved_offers(p_business_id uuid)
 returns table(saved_id uuid, offer_id uuid, title text, description text, image_url text, discount_type text, discount_value integer, expires_at timestamp with time zone, voice_message_url text, redeem_code text, fulfilled_at timestamp with time zone, saved_at timestamp with time zone, gift_reward_id uuid, gift_reward_name text)
 language sql stable security definer set search_path to 'public'
as $function$
  select c.id, o.id, o.title, o.description, o.image_url,
         coalesce(o.discount_type, 'none')::text, o.discount_value,
         public.saved_offer_expires_at(c, o.expires_at) as expires_at,   -- CP-220: per member
         o.voice_message_url,
         c.redeem_code, c.fulfilled_at, c.saved_at,
         o.gift_reward_id,
         r.name as gift_reward_name
    from public.customer_saved_offers c
    join public.offers o               on o.id = c.offer_id
    join public.business_memberships m  on m.id = c.membership_id
    left join public.rewards r          on r.id = o.gift_reward_id
   where m.user_id = auth.uid()
     and c.business_id = p_business_id
     and c.fulfilled_at is null
     and public.saved_offer_expires_at(c, o.expires_at) > now()
     and coalesce(o.discount_type, 'none') <> 'points_bonus'
   order by c.saved_at desc;
$function$;

create or replace function public.my_unrevealed_welcome_gift(p_business_id uuid)
 returns table(saved_id uuid, offer_id uuid, title text, description text, image_url text, voice_message_url text, discount_type text, discount_value integer, gift_reward_name text, expires_at timestamp with time zone)
 language sql stable security definer set search_path to 'public'
as $function$
  select cso.id, o.id,
         o.title, o.description, o.image_url, o.voice_message_url,
         o.discount_type, o.discount_value,
         rw.name,
         public.saved_offer_expires_at(cso, o.expires_at)               -- CP-220: per member
    from public.customer_saved_offers cso
    join public.business_memberships m on m.id = cso.membership_id
    join public.offers o               on o.id = cso.offer_id
    left join public.rewards rw        on rw.id = o.gift_reward_id
   where m.user_id = auth.uid()
     and cso.business_id = p_business_id
     and cso.revealed_at is null
     and o.welcome_config_id is not null
     and o.is_active
     and public.saved_offer_expires_at(cso, o.expires_at) > now()
   order by cso.saved_at desc
   limit 1;
$function$;

create or replace function public.desk_member_store(p_membership_id uuid)
 returns table(kind text, id uuid, name text, category text, description text, image_url text, point_cost integer, affordable boolean, expires_at timestamp with time zone, code text)
 language sql stable security definer set search_path to 'public'
as $function$
  with m as (
    select bm.id, bm.business_id, bm.points_balance
      from public.business_memberships bm where bm.id = p_membership_id
  )
  select * from (
  select 'pending'::text as kind, d.id, coalesce(r.name, 'Reward') as name, r.category, r.description, r.image_url,
         0 as point_cost, true as affordable, d.expires_at, d.code
    from public.redemptions d join m on m.id = d.membership_id
    left join public.rewards r on r.id = d.reward_id
   where d.status = 'pending' and (d.expires_at is null or d.expires_at > now())
     and public.staffs_business(m.business_id)
  union all
  select 'gift'::text, c.id,
         coalesce(rw.name, o.title) as name,
         'Gift'::text as category,
         case when rw.name is not null then o.title else o.description end as description,
         coalesce(rw.image_url, o.image_url) as image_url,
         0, true, public.saved_offer_expires_at(c, o.expires_at), c.redeem_code
    from public.customer_saved_offers c join m on m.id = c.membership_id
    join public.offers o on o.id = c.offer_id
    left join public.rewards rw on rw.id = o.gift_reward_id
   where c.fulfilled_at is null
     and c.redeem_code is not null
     and o.is_active
     and public.saved_offer_expires_at(c, o.expires_at) > now()
     and public.staffs_business(m.business_id)
  union all
  select 'reward'::text, r.id, r.name, r.category, r.description, r.image_url,
         r.point_cost, (m.points_balance >= r.point_cost), null::timestamptz, null::text
    from public.rewards r join m on m.business_id = r.business_id
   where r.is_active and coalesce(r.show_in_store, true) and r.archived_at is null
     and public.staffs_business(m.business_id)
  ) x
   order by (x.kind in ('pending','gift')) desc, x.affordable desc, x.point_cost asc;
$function$;

create or replace function public.resolve_saved_offer_by_code(p_code text, p_business_id uuid)
 returns table(saved_id uuid, membership_id uuid, full_name text, email text, offer_id uuid, title text, description text, image_url text, discount_type text, discount_value integer, expires_at timestamp with time zone, fulfilled_at timestamp with time zone, gift_reward_name text, gift_reward_description text, gift_reward_image_url text, gift_kind text, redeem_code text, saved_at timestamp with time zone, is_expired boolean)
 language sql stable security definer set search_path to 'public'
as $function$
  select c.id::uuid, c.membership_id::uuid, p.full_name::text, p.email::text,
         o.id::uuid, o.title::text, o.description::text, o.image_url::text,
         o.discount_type::text, o.discount_value::integer,
         public.saved_offer_expires_at(c, o.expires_at)::timestamptz,
         c.fulfilled_at::timestamptz,
         rw.name::text, rw.description::text, rw.image_url::text,
         coalesce(t.trigger_type, 'gift')::text,
         c.redeem_code::text, c.saved_at::timestamptz,
         (public.saved_offer_expires_at(c, o.expires_at) <= now())
    from public.customer_saved_offers c
    join public.offers o               on o.id = c.offer_id
    join public.business_memberships m on m.id = c.membership_id
    left join public.profiles p        on p.id = m.user_id
    left join public.rewards rw        on rw.id = o.gift_reward_id
    left join public.business_automated_offers bao on bao.id = o.welcome_config_id
    left join public.automated_offer_templates t   on t.id = bao.template_id
   where c.business_id = p_business_id
     and c.redeem_code = upper(btrim(p_code))
     and exists (
       select 1 from public.business_users bu
        where bu.user_id = auth.uid()
          and (bu.business_id = p_business_id
               or (bu.business_id is null and bu.role in ('agency_admin','agency_va')))
     );
$function$;

-- ───────────── 3. welcome gift only after the required waiver ─────────────
-- True when the business has no required signup waiver, or this member has a
-- valid signature (or is covered by a guardian's) on its current version.
create or replace function public._required_waiver_signed(p_membership_id uuid)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare v_biz uuid; w record; v_cutoff timestamptz;
begin
  select business_id into v_biz from public.business_memberships where id = p_membership_id;
  if v_biz is null then return false; end if;
  select w2.id, w2.current_version_id, w2.valid_days into w
    from public.business_waivers w2
   where w2.business_id = v_biz and w2.is_active and w2.required_for_signup and w2.current_version_id is not null
   order by w2.created_at limit 1;
  if not found then return true; end if;
  v_cutoff := case when coalesce(w.valid_days, 0) > 0 then now() - make_interval(days => w.valid_days) else '-infinity'::timestamptz end;
  return exists (select 1 from public.waiver_submissions s
                  where s.membership_id = p_membership_id and s.waiver_id = w.id
                    and s.version_id = w.current_version_id and s.signed_at > v_cutoff)
      or exists (select 1 from public.waiver_coverage c
                  where c.membership_id = p_membership_id and c.waiver_id = w.id
                    and c.version_id = w.current_version_id and c.created_at > v_cutoff);
end $$;

-- The signup gift itself (was the body of the enrollment trigger). Safe to call
-- more than once: a config this member already got is skipped.
create or replace function public._grant_welcome_gifts(p_membership_id uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  mem record; o record; v_master uuid; v_title text; v_body text; v_image text; v_voice text;
  v_expires timestamptz; v_idem text; v_points boolean; v_bal integer; v_n integer := 0;
begin
  select * into mem from public.business_memberships where id = p_membership_id;
  if mem.id is null then return 0; end if;

  for o in
    select bao.id as config_id, bao.custom_title, bao.custom_description, bao.custom_image_url,
           bao.voice_message_url, bao.expires_after_days, bao.discount_type as bao_discount_type,
           bao.discount_value as bao_discount_value, bao.gift_reward_id as bao_gift_reward_id,
           t.name as template_name, t.emoji as template_emoji
      from public.business_automated_offers bao
      join public.automated_offer_templates t on t.id = bao.template_id
     where bao.business_id = mem.business_id and bao.is_active and t.trigger_type = 'signup'
  loop
    -- already granted this config to this member → skip (idempotent)
    continue when exists (select 1 from public.customer_saved_offers c join public.offers x on x.id = c.offer_id
                           where c.membership_id = mem.id and x.welcome_config_id = o.config_id);

    v_title   := coalesce(o.custom_title, o.template_emoji || ' ' || o.template_name);
    v_body    := o.custom_description;
    v_image   := o.custom_image_url;
    v_voice   := o.voice_message_url;
    v_expires := now() + make_interval(days => coalesce(o.expires_after_days, 30));
    v_points  := (o.bao_discount_type = 'points_bonus' and coalesce(o.bao_discount_value, 0) > 0);

    if v_points then
      v_idem := 'welcome_points:' || mem.id::text || ':' || o.config_id::text;
      begin
        if not exists (select 1 from public.points_ledger where idempotency_key = v_idem) then
          update public.business_memberships
             set points_balance = points_balance + o.bao_discount_value,
                 lifetime_points_earned = lifetime_points_earned + o.bao_discount_value,
                 updated_at = now()
           where id = mem.id returning points_balance into v_bal;
          insert into public.points_ledger (membership_id, business_id, delta, rule_type, reference_id,
                                            idempotency_key, balance_after, notes, created_by)
          values (mem.id, mem.business_id, o.bao_discount_value, 'signup_bonus', o.config_id,
                  v_idem, v_bal, 'Welcome bonus from ' || coalesce(v_title, 'signup gift'), mem.user_id);
        end if;
      exception when others then raise warning 'welcome points credit failed: %', sqlerrm;
      end;
    end if;

    select id into v_master from public.offers where welcome_config_id = o.config_id;
    if v_master is null then
      begin
        insert into public.offers (business_id, title, description, image_url, voice_message_url,
                                   expires_at, is_active, is_featured, welcome_config_id,
                                   discount_type, discount_value, gift_reward_id)
        values (mem.business_id, v_title, v_body, v_image, v_voice, v_expires, true, false, o.config_id,
                coalesce(o.bao_discount_type, 'none'), o.bao_discount_value, o.bao_gift_reward_id)
        returning id into v_master;
      exception when unique_violation then
        select id into v_master from public.offers where welcome_config_id = o.config_id;
      when others then
        raise warning 'welcome master offer insert failed: %', sqlerrm; v_master := null;
      end;
    else
      update public.offers
         set title = v_title, description = v_body, image_url = v_image, voice_message_url = v_voice,
             expires_at = v_expires, is_active = true, discount_type = coalesce(o.bao_discount_type, 'none'),
             discount_value = o.bao_discount_value, gift_reward_id = o.bao_gift_reward_id
       where id = v_master;
    end if;

    if v_master is not null then
      begin
        insert into public.customer_saved_offers (membership_id, offer_id, business_id, fulfilled_at)
        values (mem.id, v_master, mem.business_id, case when v_points then now() else null end)
        on conflict (membership_id, offer_id) do nothing;
      exception when others then raise warning 'welcome gift saved_offer insert failed: %', sqlerrm;
      end;
      begin
        insert into public.notifications (user_id, business_id, kind, title, body, link_path)
        values (mem.user_id, mem.business_id, 'automated_offer',
                case when v_points then '🎁 +' || o.bao_discount_value::text || ' welcome points!'
                     else '🎁 A welcome gift just dropped' end,
                coalesce(v_body, 'Tap to see what''s waiting on your Home tab.'), '/app');
      exception when others then raise warning 'welcome gift notification insert failed: %', sqlerrm;
      end;
      v_n := v_n + 1;
    end if;

    update public.business_automated_offers set last_triggered_at = now() where id = o.config_id;
  end loop;
  return v_n;
end $$;

revoke execute on function public._grant_welcome_gifts(uuid) from public, anon, authenticated;
revoke execute on function public._required_waiver_signed(uuid) from public, anon, authenticated;

-- Enrollment: grant now unless a required waiver is still unsigned.
create or replace function public._fire_welcome_gifts_for_new_member()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  begin
    if public._required_waiver_signed(new.id) then
      perform public._grant_welcome_gifts(new.id);
    end if;
  exception when others then raise warning 'welcome gift on enroll failed: %', sqlerrm;
  end;
  return new;
end $$;

-- Signing (or being covered by) the required waiver releases the gift.
create or replace function public._welcome_gift_after_waiver()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.membership_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.membership_id is not distinct from old.membership_id then return new; end if;
  begin
    if public._required_waiver_signed(new.membership_id) then
      perform public._grant_welcome_gifts(new.membership_id);
    end if;
  exception when others then raise warning 'welcome gift after waiver failed: %', sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_welcome_gift_after_waiver on public.waiver_submissions;
create trigger trg_welcome_gift_after_waiver after insert or update of membership_id on public.waiver_submissions
  for each row execute function public._welcome_gift_after_waiver();
drop trigger if exists trg_welcome_gift_after_coverage on public.waiver_coverage;
create trigger trg_welcome_gift_after_coverage after insert or update of membership_id on public.waiver_coverage
  for each row execute function public._welcome_gift_after_waiver();

-- The desk can't hand over a signup gift before the required waiver exists
-- (covers members who got one before this change).
create or replace function public.fulfill_saved_offer(p_saved_id uuid)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_biz uuid; v_exp timestamptz; v_mem uuid; v_trig text;
begin
  select c.business_id, public.saved_offer_expires_at(c, o.expires_at), c.membership_id, t.trigger_type
    into v_biz, v_exp, v_mem, v_trig
    from public.customer_saved_offers c
    join public.offers o on o.id = c.offer_id
    left join public.business_automated_offers bao on bao.id = o.welcome_config_id
    left join public.automated_offer_templates t on t.id = bao.template_id
   where c.id = p_saved_id;
  if v_biz is null then raise exception 'gift not found'; end if;
  if not public.staffs_business(v_biz) then raise exception 'permission denied'; end if;
  if v_exp <= now() then raise exception 'this gift has expired'; end if;
  if v_trig = 'signup' and not public._required_waiver_signed(v_mem) then
    raise exception 'This member needs to sign the waiver before the welcome gift can be used';
  end if;
  update public.customer_saved_offers
     set fulfilled_at = now(), fulfilled_by = auth.uid()
   where id = p_saved_id and fulfilled_at is null;
  return p_saved_id;
end;
$function$;

-- ─────────────────── 4. one push registration per device ───────────────────
-- A phone that signed in to several accounts kept a row for each, so it got
-- pushes meant for all of them. The newest sign-in owns the device.
create or replace function public._push_sub_one_owner()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  delete from public.push_subscriptions p
   where p.endpoint = new.endpoint and p.user_id <> new.user_id;
  return new;
end $$;
drop trigger if exists trg_push_sub_one_owner on public.push_subscriptions;
create trigger trg_push_sub_one_owner after insert or update of user_id, endpoint, last_seen_at on public.push_subscriptions
  for each row execute function public._push_sub_one_owner();

-- existing duplicates: keep the most recently seen owner of each endpoint
delete from public.push_subscriptions p
 using (select id, row_number() over (partition by endpoint order by coalesce(last_seen_at, created_at) desc, created_at desc) rn
          from public.push_subscriptions) d
 where p.id = d.id and d.rn > 1;
