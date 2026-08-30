-- =====================================================================
-- Atlas · CP-111 — instant demo builder
-- =====================================================================
-- One RPC that creates a fully-populated DEMO business in a single call,
-- so a door-sales rep can generate a live app on the spot (or batch a
-- street the night before) instead of hand-building each one.
--
-- Seeds, atomically: brand colors + logo + hero, 4 store rewards, a
-- prize-only wheel freebie + weighted spin wedges (demo mode = spinnable
-- with no check-in), a featured image offer, and a 4-week streak roadmap
-- with rewards at weeks 2-5. Images are pulled from image_library by the
-- niche `industry` slug (degrades gracefully if the library is thin).
--
-- Non-destructive + idempotent to APPLY (create or replace). Each CALL
-- creates one new business; slugs auto-suffix so batch runs never collide.
-- Gated to agency staff (admins + VAs), same as create_business.
-- =====================================================================

create or replace function public.create_demo_business(
  p_name         text,
  p_slug         text,
  p_industry     text,
  p_brand_colors jsonb,
  p_logo_url     text,
  p_pack         jsonb
)
returns table (new_business_id uuid, new_slug text)
language plpgsql security definer set search_path = public as $$
declare
  v_slug        text;
  v_base        text;
  v_n           int := 1;
  v_biz         uuid;
  v_folder      uuid;
  v_colors      jsonb;
  v_hero        text;
  v_offer_img   text;
  v_reward_imgs text[];
  v_reward_ids  uuid[] := '{}';
  v_free_rid    uuid;
  v_rid         uuid;
  v_img         text;
  v_free_img    text;
  v_milestones  jsonb;
  r             jsonb;
  idx           int := 0;
  w             jsonb;
begin
  if not public.is_agency_staff() then
    raise exception 'only agency admins or VAs can create demos' using errcode = '42501';
  end if;

  -- ── slug: normalize + guarantee unique (auto-suffix for batch runs) ──
  v_slug := trim(both '-' from lower(regexp_replace(coalesce(p_slug, p_name, 'demo'), '[^a-z0-9-]+', '-', 'gi')));
  if v_slug is null or length(v_slug) < 2 then v_slug := 'demo'; end if;
  v_base := v_slug;
  while exists (select 1 from public.businesses b where b.slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  -- ── colors: use provided palette, fall back to the table default ─────
  v_colors := coalesce(
    nullif(p_brand_colors, 'null'::jsonb),
    '{"primary":"#6366f1","secondary":"#06b6d4","accent":"#10b981"}'::jsonb
  );

  -- ── images from the niche library (null-safe) ────────────────────────
  select public_url into v_hero
    from public.image_library
   where industry = p_industry and category = 'hero' and is_active
   order by sort_order, created_at limit 1;
  select public_url into v_offer_img
    from public.image_library
   where industry = p_industry and category = 'offer' and is_active
   order by sort_order, created_at limit 1;
  select array_agg(public_url order by sort_order, created_at) into v_reward_imgs
    from public.image_library
   where industry = p_industry and category = 'reward' and is_active;

  -- ── the "Demos" folder (agency-global; create once) ──────────────────
  select id into v_folder from public.business_folders where name = 'Demos' limit 1;
  if v_folder is null then
    insert into public.business_folders (name) values ('Demos') returning id into v_folder;
  end if;

  -- ── the business itself (is_demo → wheel spins with no check-in) ─────
  insert into public.businesses (slug, name, industry, status, is_demo,
                                 brand_colors, logo_url, hero_image_url,
                                 folder_id, created_by)
       values (v_slug, p_name, p_industry, 'active', true,
               v_colors, p_logo_url, v_hero,
               v_folder, auth.uid())
    returning id into v_biz;

  -- ── 4 store rewards (round-robin the library reward images) ─────────
  for r in select * from jsonb_array_elements(coalesce(p_pack->'rewards','[]'::jsonb))
  loop
    if v_reward_imgs is not null and array_length(v_reward_imgs,1) > 0 then
      v_img := v_reward_imgs[(idx % array_length(v_reward_imgs,1)) + 1];
    else
      v_img := null;
    end if;
    insert into public.rewards (business_id, name, description, reward_type,
                                point_cost, image_url, is_active, show_in_store, sort_order)
         values (v_biz, r->>'name', r->>'description',
                 coalesce(r->>'reward_type','discount'),
                 greatest(1, coalesce((r->>'point_cost')::int, 500)),
                 v_img, true, true, idx)
      returning id into v_rid;
    v_reward_ids := v_reward_ids || v_rid;
    idx := idx + 1;
  end loop;

  -- ── prize-only wheel freebie (hidden from the store) ────────────────
  v_free_img := case when v_reward_imgs is not null and array_length(v_reward_imgs,1) > 0
                     then v_reward_imgs[array_length(v_reward_imgs,1)] else v_hero end;
  insert into public.rewards (business_id, name, description, reward_type,
                              point_cost, image_url, is_active, show_in_store, sort_order)
       values (v_biz,
               coalesce(p_pack->'spin_free_reward'->>'name','Free gift'),
               coalesce(p_pack->'spin_free_reward'->>'description','Won on the wheel.'),
               coalesce(p_pack->'spin_free_reward'->>'reward_type','free_item'),
               1, v_free_img, true, false, 99)
    returning id into v_free_rid;

  -- ── spin wheel: points wedges + the free-reward wedge ───────────────
  for w in select * from jsonb_array_elements(coalesce(p_pack->'spin_points','[]'::jsonb))
  loop
    insert into public.mystery_reward_pool (business_id, prize_name, kind,
                                            points_amount, weight, is_active)
         values (v_biz, coalesce(w->>'label','Points'), 'points',
                 coalesce((w->>'points')::int, 25),
                 greatest(1, coalesce((w->>'weight')::int, 10)), true);
  end loop;
  insert into public.mystery_reward_pool (business_id, prize_name, prize_image_url, kind,
                                          reward_id, weight, is_active)
       values (v_biz,
               coalesce(p_pack->'spin_free_reward'->>'name','Free gift'),
               v_free_img, 'reward', v_free_rid, 6, true);

  -- config row is dead since CP-73 but harmless to set for older readers
  insert into public.business_mystery_config (business_id, is_enabled)
       values (v_biz, true)
    on conflict (business_id) do update set is_enabled = true;

  -- ── featured image offer on Home ────────────────────────────────────
  insert into public.offers (business_id, title, description, image_url,
                             starts_at, expires_at, is_active, is_featured, sort_order)
       values (v_biz,
               coalesce(p_pack->'offer'->>'title','Members-only offer'),
               p_pack->'offer'->>'description',
               v_offer_img, now(),
               now() + make_interval(days => greatest(1, coalesce((p_pack->'offer'->>'expiresDays')::int, 7))),
               true, true, 0);

  -- ── 4-week streak roadmap (rewards at weeks 2-5, mix of points+reward)
  select jsonb_agg(
           case when (m->>'gift_kind') = 'reward' then
             jsonb_build_object(
               'count',     (m->>'count')::int,
               'label',     m->>'label',
               'gift_kind', 'reward',
               'reward_id', v_reward_ids[coalesce((m->>'reward_ref')::int, 0) + 1],
               'mystery',   coalesce((m->>'mystery')::boolean, false))
           else
             jsonb_build_object(
               'count',     (m->>'count')::int,
               'label',     m->>'label',
               'gift_kind', 'points',
               'points',    coalesce((m->>'points')::int, 100),
               'mystery',   coalesce((m->>'mystery')::boolean, false))
           end
           order by (m->>'count')::int)
    into v_milestones
    from jsonb_array_elements(coalesce(p_pack->'streak'->'milestones','[]'::jsonb)) m;

  insert into public.streak_config (business_id, is_enabled, period_type,
                                    checkins_required_per_period, reset_grace_hours, milestones)
       values (v_biz, true,
               coalesce(p_pack->'streak'->>'period_type','weekly'),
               greatest(1, coalesce((p_pack->'streak'->>'checkins_required')::int, 1)),
               6,
               coalesce(v_milestones, '[]'::jsonb))
    on conflict (business_id) do update
       set is_enabled = true, period_type = excluded.period_type,
           checkins_required_per_period = excluded.checkins_required_per_period,
           milestones = excluded.milestones;

  new_business_id := v_biz;
  new_slug := v_slug;
  return next;
end; $$;

grant execute on function public.create_demo_business(text, text, text, jsonb, text, jsonb) to authenticated;
