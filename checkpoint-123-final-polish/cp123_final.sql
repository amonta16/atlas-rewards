-- =====================================================================
-- Atlas · CP-123 — Fourth of July + Custom Occasion automated offers,
--                  and the shop catalog link fix (app-side)
-- =====================================================================
-- 1. Two new automated-offer templates:
--      · Fourth of July 🎆 — fires around July 4 (±5 days), yearly.
--      · Custom Occasion 🗓️ — the manager PICKS THE DATE (new per-business
--        custom date; e.g. the shop's anniversary, a local festival).
-- 2. business_automated_offers.custom_trigger_config — per-business date
--    override ({month, day, window_days}). The engine now reads the
--    business's own date first, falling back to the template's.
-- 3. upsert / list RPCs updated for the new field (drop-first, CP-118
--    lesson); trigger_automated_offers() skips date templates that have
--    no date configured anywhere (protects Custom Occasion until the
--    manager picks a day).
--
-- Safe to run on production, re-runnable. Deploy the app together with
-- this — the editor's date picker saves through the new RPC parameter.
-- =====================================================================

begin;

-- ── 1. new templates ─────────────────────────────────────────────────
insert into public.automated_offer_templates
  (slug, name, emoji, description, trigger_type, trigger_config)
values
  ('fourth_of_july', 'Fourth of July', '🎆',
   'Independence Day promo around July 4.',
   'date', '{"month":7,"day":4,"window_days":5}'::jsonb),
  ('custom_occasion', 'Custom Occasion', '🗓️',
   'Your own yearly date — anniversary, local festival, anything.',
   'date', '{}'::jsonb)
on conflict (slug) do update set
  name = excluded.name,
  emoji = excluded.emoji,
  description = excluded.description,
  trigger_type = excluded.trigger_type,
  trigger_config = excluded.trigger_config;

-- ── 2. per-business date override ────────────────────────────────────
alter table public.business_automated_offers
  add column if not exists custom_trigger_config jsonb;

-- ── 3. upsert RPC gains p_custom_trigger_config ─────────────────────
drop function if exists public.upsert_business_automated_offer(
  uuid, uuid, uuid, boolean, text, text, text, text, int, int, text, uuid
);

create function public.upsert_business_automated_offer(
  p_id                uuid,
  p_business_id       uuid,
  p_template_id       uuid,
  p_is_active         boolean,
  p_custom_title      text,
  p_custom_description text,
  p_custom_image_url  text,
  p_discount_type     text,
  p_discount_value    int,
  p_expires_after_days int,
  p_voice_message_url text default null,
  p_gift_reward_id    uuid default null,
  -- CP-123: per-business date for the Custom Occasion template
  -- ({month, day, window_days}); null keeps the template's own date.
  p_custom_trigger_config jsonb default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;

  if p_id is null then
    insert into public.business_automated_offers (
      business_id, template_id, is_active,
      custom_title, custom_description, custom_image_url,
      discount_type, discount_value, expires_after_days,
      voice_message_url, gift_reward_id, custom_trigger_config
    )
    values (
      p_business_id, p_template_id, p_is_active,
      p_custom_title, p_custom_description, p_custom_image_url,
      p_discount_type, p_discount_value, p_expires_after_days,
      p_voice_message_url, p_gift_reward_id, p_custom_trigger_config
    )
    returning id into v_id;
  else
    update public.business_automated_offers
       set is_active          = p_is_active,
           custom_title        = p_custom_title,
           custom_description  = p_custom_description,
           custom_image_url    = p_custom_image_url,
           discount_type       = p_discount_type,
           discount_value      = p_discount_value,
           expires_after_days  = p_expires_after_days,
           voice_message_url   = p_voice_message_url,
           gift_reward_id      = p_gift_reward_id,
           custom_trigger_config = p_custom_trigger_config,
           updated_at          = now()
     where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;

  return v_id;
end; $$;
grant execute on function public.upsert_business_automated_offer(
  uuid, uuid, uuid, boolean, text, text, text, text, int, int, text, uuid, jsonb
) to authenticated;

-- ── 4. list RPC returns the override ─────────────────────────────────
drop function if exists public.list_automated_offers_for_business(uuid);

create function public.list_automated_offers_for_business(p_business_id uuid)
returns table (
  template_id        uuid,
  slug               text,
  name               text,
  emoji              text,
  description        text,
  trigger_type       text,
  trigger_config     jsonb,
  config_id          uuid,
  is_active          boolean,
  custom_title       text,
  custom_description text,
  custom_image_url   text,
  discount_type      text,
  discount_value     int,
  voice_message_url  text,
  last_triggered_at  timestamptz,
  gift_reward_id     uuid,
  gift_reward_name   text,
  default_image_url  text,
  custom_trigger_config jsonb
)
language sql stable security definer set search_path = public as $$
  select
    t.id, t.slug::text, t.name::text, t.emoji::text, t.description::text,
    t.trigger_type::text, t.trigger_config,
    o.id, coalesce(o.is_active, false),
    o.custom_title::text, o.custom_description::text, o.custom_image_url::text,
    coalesce(o.discount_type, 'none')::text, o.discount_value,
    o.voice_message_url::text, o.last_triggered_at,
    o.gift_reward_id,
    r.name::text as gift_reward_name,
    null::text as default_image_url,
    o.custom_trigger_config
  from public.automated_offer_templates t
  left join public.business_automated_offers o
    on o.template_id = t.id and o.business_id = p_business_id
  left join public.rewards r
    on r.id = o.gift_reward_id
  order by case
    when t.trigger_type = 'birthday'    then 1
    when t.trigger_type = 'anniversary' then 2
    when t.trigger_type = 'signup'      then 3
    when t.trigger_type = 'inactivity'  then 4
    else 9
  end, t.name;
$$;
grant execute on function public.list_automated_offers_for_business(uuid) to authenticated;

-- ── 5. engine honors the per-business date (CP-29.1 base) ────────────
create or replace function public.trigger_automated_offers()
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_row     record;
  v_today   date := current_date;
  v_cfg     jsonb;
  v_window  int;
  v_diff    int;
  v_count   int  := 0;
  v_expires_at timestamptz;
begin
  for v_row in
    select o.id as config_id, o.business_id, o.custom_title, o.custom_description,
           o.custom_image_url, o.discount_type, o.discount_value, o.expires_after_days,
           o.voice_message_url, o.last_triggered_at, o.custom_trigger_config,
           t.slug, t.name, t.emoji, t.default_image_url,
           t.trigger_type, t.trigger_config
      from public.business_automated_offers o
      join public.automated_offer_templates t on t.id = o.template_id
     where o.is_active and t.trigger_type = 'date'
  loop
    -- CP-123: the business's own date wins; template date is the fallback.
    v_cfg := coalesce(v_row.custom_trigger_config, v_row.trigger_config);
    -- No date configured anywhere (Custom Occasion not set up yet) → skip.
    continue when (v_cfg->>'month') is null or (v_cfg->>'day') is null;

    v_window := coalesce((v_cfg->>'window_days')::int, 0);
    v_diff := abs(v_today - make_date(extract(year from v_today)::int,
                                       (v_cfg->>'month')::int,
                                       (v_cfg->>'day')::int));
    if v_diff <= v_window then
      if v_row.last_triggered_at is null or v_row.last_triggered_at < (now() - interval '30 days') then
        v_expires_at := now() + (coalesce(v_row.expires_after_days, 7) || ' days')::interval;
        insert into public.offers
          (business_id, title, description, image_url, voice_message_url,
           discount_type, discount_value,
           expires_at, is_active, is_featured, is_automated)
        values
          (v_row.business_id,
           coalesce(v_row.custom_title, v_row.emoji || ' ' || v_row.name),
           v_row.custom_description,
           coalesce(v_row.custom_image_url, v_row.default_image_url),
           v_row.voice_message_url,
           v_row.discount_type,
           v_row.discount_value,
           v_expires_at,
           true,
           true,
           true)
        on conflict do nothing;

        update public.business_automated_offers
           set last_triggered_at = now()
         where id = v_row.config_id;

        v_count := v_count + 1;
      end if;
    end if;
  end loop;
  return v_count;
end; $$;
grant execute on function public.trigger_automated_offers() to service_role;

commit;

notify pgrst, 'reload schema';
