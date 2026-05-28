-- =====================================================================
-- CHECKPOINT 9 — Agency builder: storage buckets + RPCs
-- =====================================================================

-- Extra storage buckets for hero images + reward photos.
-- (business-logos was created back in CP 2's storage-setup.sql.)
insert into storage.buckets (id, name, public) values ('business-heroes', 'business-heroes', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('reward-images',   'reward-images',   true)
  on conflict (id) do nothing;

-- Agency admins can manage anything in these buckets.
-- Public read for everyone (so customer apps render the images without auth).
do $$
begin
  -- Drop and recreate (idempotent)
  begin drop policy "Agency manages heroes" on storage.objects; exception when undefined_object then null; end;
  begin drop policy "Public read heroes"    on storage.objects; exception when undefined_object then null; end;
  begin drop policy "Agency manages rewards" on storage.objects; exception when undefined_object then null; end;
  begin drop policy "Public read rewards"    on storage.objects; exception when undefined_object then null; end;
end $$;

create policy "Agency manages heroes" on storage.objects for all to authenticated
  using (bucket_id = 'business-heroes' and exists (
    select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'
  ));
create policy "Public read heroes" on storage.objects for select to public
  using (bucket_id = 'business-heroes');

create policy "Agency manages rewards" on storage.objects for all to authenticated
  using (bucket_id = 'reward-images' and exists (
    select 1 from public.business_users where user_id = auth.uid() and role = 'agency_admin'
  ));
create policy "Public read rewards" on storage.objects for select to public
  using (bucket_id = 'reward-images');

-- =====================================================================
-- create_business: agency-only RPC to spin up a new sub-account
-- =====================================================================
create or replace function public.create_business(
  p_name      text,
  p_slug      text,
  p_industry  text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_slug citext := lower(regexp_replace(p_slug, '[^a-z0-9-]+', '-', 'gi'));
begin
  if not public.is_agency_admin() then
    raise exception 'only agency admins can create businesses';
  end if;
  if v_slug = '' or length(v_slug) < 2 then
    raise exception 'slug must be at least 2 characters';
  end if;
  if exists (select 1 from public.businesses where slug = v_slug) then
    raise exception 'slug "%" is already taken', v_slug;
  end if;

  insert into public.businesses (slug, name, industry, status)
       values (v_slug, p_name, p_industry, 'active')
    returning id into v_id;

  return v_id;
end; $$;
grant execute on function public.create_business(text, text, text) to authenticated;

-- =====================================================================
-- delete_reward, upsert_reward — used by the brand editor's Rewards tab
-- =====================================================================
create or replace function public.upsert_reward(
  p_id           uuid,
  p_business_id  uuid,
  p_name         text,
  p_description  text default null,
  p_reward_type  text default 'discount',
  p_point_cost   int  default 500,
  p_image_url    text default null,
  p_is_active    boolean default true,
  p_sort_order   int default 0
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;

  if p_id is null then
    insert into public.rewards (business_id, name, description, reward_type, point_cost, image_url, is_active, sort_order)
    values (p_business_id, p_name, p_description, p_reward_type, p_point_cost, p_image_url, p_is_active, p_sort_order)
    returning id into v_id;
  else
    update public.rewards
       set name = p_name, description = p_description,
           reward_type = p_reward_type, point_cost = p_point_cost,
           image_url = p_image_url, is_active = p_is_active, sort_order = p_sort_order,
           updated_at = now()
     where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;

  return v_id;
end; $$;
grant execute on function public.upsert_reward(uuid, uuid, text, text, text, int, text, boolean, int) to authenticated;

create or replace function public.delete_reward(p_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  delete from public.rewards where id = p_id and business_id = p_business_id;
end; $$;
grant execute on function public.delete_reward(uuid, uuid) to authenticated;
