-- CP-158 · (1) every saved gift gets a redeem code, (2) welcome/birthday master
-- offers stop leaking into the public offer list + banner, (3) the Birthday
-- automated offer actually fires. Safe to re-run.

-- ── 1. Mint a redeem code on insert when none was supplied ──────────────────
-- The welcome-gift trigger inserted customer_saved_offers rows with no code,
-- so the gift page said "Code not generated yet" until the member happened to
-- call save_offer. Now the table itself guarantees a code.
create or replace function public._mint_saved_offer_code()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_code text; v_try int := 0;
begin
  if new.redeem_code is not null then return new; end if;
  if new.fulfilled_at is not null then return new; end if;   -- points-only gifts: nothing to scan
  loop
    begin
      v_code := upper(substring(translate(encode(public.gen_random_bytes(10), 'base64'), '+/=OoIl01', '') from 1 for 7));
    exception when others then
      v_code := upper(substring(translate(md5(random()::text || clock_timestamp()::text), 'oOiIlL01', '') from 1 for 7));
    end;
    exit when length(v_code) = 7
      and not exists (select 1 from public.customer_saved_offers where business_id = new.business_id and redeem_code = v_code)
      and not exists (select 1 from public.redemptions where business_id = new.business_id and code = v_code);
    v_try := v_try + 1;
    if v_try > 10 then raise exception 'could not mint unique code'; end if;
  end loop;
  new.redeem_code := v_code;
  return new;
end $$;
drop trigger if exists trg_mint_saved_offer_code on public.customer_saved_offers;
create trigger trg_mint_saved_offer_code
  before insert on public.customer_saved_offers
  for each row execute function public._mint_saved_offer_code();

-- Backfill: open gifts that never got a code.
do $$
declare r record; v_code text;
begin
  for r in select id, business_id from public.customer_saved_offers where redeem_code is null and fulfilled_at is null loop
    loop
      v_code := upper(substring(translate(md5(random()::text || clock_timestamp()::text || r.id::text), 'oOiIlL01', '') from 1 for 7));
      exit when length(v_code) = 7
        and not exists (select 1 from public.customer_saved_offers where business_id = r.business_id and redeem_code = v_code)
        and not exists (select 1 from public.redemptions where business_id = r.business_id and code = v_code);
    end loop;
    update public.customer_saved_offers set redeem_code = v_code where id = r.id;
  end loop;
end $$;

-- ── 2. Per-member gift masters are not public offers ────────────────────────
-- A welcome (and now birthday) config keeps ONE master row in offers, tagged
-- with welcome_config_id. It exists so saved rows have something to point at;
-- it must never show up in the Deals list or take over the top banner.
create or replace function public.featured_offer(p_business_id uuid)
returns table(id uuid, title text, description text, image_url text, voice_message_url text, discount_type text, discount_value integer, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select o.id, o.title, o.description, o.image_url, o.voice_message_url,
         o.discount_type, o.discount_value, o.expires_at
    from public.offers o
   where o.business_id = p_business_id
     and o.is_active
     and o.welcome_config_id is null
     and (o.expires_at is null or o.expires_at > now())
   order by o.is_featured desc, coalesce(o.sort_order, 0) asc, o.created_at desc
   limit 1;
$$;

create or replace function public.list_active_offers(p_business_id uuid)
returns table(id uuid, title text, description text, image_url text, voice_message_url text, discount_type text, discount_value integer, expires_at timestamptz, is_automated boolean, is_featured boolean)
language sql stable security definer set search_path = public as $$
  select o.id, o.title, o.description, o.image_url, o.voice_message_url,
         o.discount_type, o.discount_value, o.expires_at,
         coalesce(o.is_automated, false), coalesce(o.is_featured, false)
    from public.offers o
   where o.business_id = p_business_id
     and o.is_active
     and o.welcome_config_id is null
     and (o.expires_at is null or o.expires_at > now())
   order by o.is_featured desc, coalesce(o.expires_at, 'infinity'::timestamptz) asc, o.created_at desc;
$$;

-- ── 3. Birthday automated offer ─────────────────────────────────────────────
-- Nothing fired trigger_type = 'birthday' before: the old atlas-birthday cron
-- only paid point_rules->>'birthday' points. This delivers the configured
-- Birthday gift to each member on their birthday (business-local date, from
-- 9am local), once per calendar year, through the same reveal popup + saved
-- gifts list the welcome gift uses.
create or replace function public.process_birthday_offers()
returns integer language plpgsql security definer set search_path = public as $$
declare
  o record; m record;
  v_master uuid; v_title text; v_expires timestamptz; v_points boolean;
  v_tz text; v_local timestamp; v_count int := 0; v_bal int; v_idem text;
begin
  for o in
    select bao.id as config_id, bao.business_id, bao.custom_title, bao.custom_description,
           bao.custom_image_url, bao.voice_message_url, bao.expires_after_days,
           bao.discount_type as bao_discount_type, bao.discount_value as bao_discount_value,
           bao.gift_reward_id as bao_gift_reward_id,
           t.name as template_name, t.emoji as template_emoji, t.default_image_url
      from public.business_automated_offers bao
      join public.automated_offer_templates t on t.id = bao.template_id
     where bao.is_active and t.trigger_type = 'birthday'
  loop
    v_tz := public.business_timezone(o.business_id);
    v_local := now() at time zone v_tz;
    continue when extract(hour from v_local) < 9;          -- not before 9am local

    v_title   := coalesce(o.custom_title, o.template_emoji || ' ' || o.template_name);
    v_expires := now() + (coalesce(o.expires_after_days, 7) || ' days')::interval;
    v_points  := (o.bao_discount_type = 'points_bonus' and coalesce(o.bao_discount_value, 0) > 0);

    for m in
      select bm.id, bm.user_id
        from public.business_memberships bm
        join public.profiles p on p.id = bm.user_id
       where bm.business_id = o.business_id
         and bm.status <> 'blocked'
         and p.birthday is not null
         and to_char(p.birthday, 'MM-DD') = to_char(v_local, 'MM-DD')
    loop
      -- master row (one per config), same shape the welcome gift uses
      select id into v_master from public.offers where welcome_config_id = o.config_id;
      if v_master is null then
        insert into public.offers (business_id, title, description, image_url, voice_message_url, expires_at,
                                   is_active, is_featured, is_automated, welcome_config_id,
                                   discount_type, discount_value, gift_reward_id)
        values (o.business_id, v_title, o.custom_description, coalesce(o.custom_image_url, o.default_image_url),
                o.voice_message_url, v_expires, true, false, true, o.config_id,
                coalesce(o.bao_discount_type, 'none'), o.bao_discount_value, o.bao_gift_reward_id)
        returning id into v_master;
      else
        update public.offers
           set title = v_title, description = o.custom_description,
               image_url = coalesce(o.custom_image_url, o.default_image_url),
               voice_message_url = o.voice_message_url, expires_at = v_expires, is_active = true,
               discount_type = coalesce(o.bao_discount_type, 'none'),
               discount_value = o.bao_discount_value, gift_reward_id = o.bao_gift_reward_id
         where id = v_master;
      end if;

      -- once per calendar year per member
      continue when exists (
        select 1 from public.customer_saved_offers s
         where s.membership_id = m.id and s.offer_id = v_master
           and s.saved_at >= date_trunc('year', v_local)
      );

      if v_points then
        v_idem := 'birthday_gift:' || m.id::text || ':' || o.config_id::text || ':' || to_char(v_local, 'YYYY');
        if not exists (select 1 from public.points_ledger where idempotency_key = v_idem) then
          update public.business_memberships
             set points_balance = points_balance + o.bao_discount_value,
                 lifetime_points_earned = lifetime_points_earned + o.bao_discount_value,
                 updated_at = now()
           where id = m.id returning points_balance into v_bal;
          insert into public.points_ledger (membership_id, business_id, delta, rule_type, reference_id, idempotency_key, balance_after, notes, created_by)
          values (m.id, o.business_id, o.bao_discount_value, 'birthday', o.config_id, v_idem, v_bal, 'Birthday gift 🎂', m.user_id);
          begin perform public.recalc_tier(m.id); exception when others then null; end;
        end if;
      end if;

      insert into public.customer_saved_offers (membership_id, offer_id, business_id, fulfilled_at)
      values (m.id, v_master, o.business_id, case when v_points then now() else null end)
      on conflict (membership_id, offer_id) do update
        set saved_at = now(), revealed_at = null,
            fulfilled_at = case when v_points then now() else null end,
            redeem_code = case when v_points then customer_saved_offers.redeem_code
                               else upper(substring(translate(md5(random()::text || clock_timestamp()::text), 'oOiIlL01', '') from 1 for 7)) end;

      begin
        insert into public.notifications (user_id, business_id, kind, title, body, link_path)
        values (m.user_id, o.business_id, 'automated_offer',
                case when v_points then '🎂 +' || o.bao_discount_value::text || ' birthday points!' else '🎂 Happy birthday — a gift is waiting' end,
                coalesce(o.custom_description, 'Tap to open it on your Home tab.'), '/app');
      exception when others then null; end;

      v_count := v_count + 1;
    end loop;

    if v_count > 0 then
      update public.business_automated_offers set last_triggered_at = now() where id = o.config_id;
    end if;
  end loop;
  return v_count;
end $$;
revoke all on function public.process_birthday_offers() from public, anon, authenticated;

-- Hourly; the 9am-local guard + once-per-year check make re-runs harmless.
do $$
begin
  perform cron.unschedule('atlas-birthday-offers');
exception when others then null;
end $$;
select cron.schedule('atlas-birthday-offers', '7 * * * *', $$ select public.process_birthday_offers(); $$);
