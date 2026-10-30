-- CP-180: scanned gift codes (welcome / birthday / win-back) get a real desk display,
-- and new gifts land in the customer's wallet live.
--
-- 1. resolve_saved_offer_by_code now also returns the GIFT REWARD (name / photo /
--    description), the gift kind (signup | birthday | gift), the code, and an
--    is_expired flag, so the desk can show WHAT to hand over. Before, a scan showed a
--    bare browser confirm() with only the offer title ("Birthday Special") and never
--    said "$10 Credits". Return type changes -> must DROP first.
-- 2. fulfill_saved_offer refuses an expired gift (same effective-expiry rule as
--    my_saved_offers: offer expiry, else 30 days from save).
-- 3. customer_saved_offers joins the realtime publication. The wallet already
--    subscribed to it, but the table was never published, so a new gift only showed
--    up after a full reload.

drop function if exists public.resolve_saved_offer_by_code(text, uuid);

create function public.resolve_saved_offer_by_code(p_code text, p_business_id uuid)
returns table(
  saved_id uuid, membership_id uuid, full_name text, email text,
  offer_id uuid, title text, description text, image_url text,
  discount_type text, discount_value integer, expires_at timestamptz, fulfilled_at timestamptz,
  gift_reward_name text, gift_reward_description text, gift_reward_image_url text,
  gift_kind text, redeem_code text, saved_at timestamptz, is_expired boolean
)
language sql stable security definer
set search_path to 'public'
as $function$
  select c.id::uuid, c.membership_id::uuid, p.full_name::text, p.email::text,
         o.id::uuid, o.title::text, o.description::text, o.image_url::text,
         o.discount_type::text, o.discount_value::integer,
         coalesce(o.expires_at, c.saved_at + interval '30 days')::timestamptz,
         c.fulfilled_at::timestamptz,
         rw.name::text, rw.description::text, rw.image_url::text,
         coalesce(t.trigger_type, 'gift')::text,
         c.redeem_code::text, c.saved_at::timestamptz,
         (coalesce(o.expires_at, c.saved_at + interval '30 days') <= now())
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

create or replace function public.fulfill_saved_offer(p_saved_id uuid)
returns uuid
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_biz uuid; v_exp timestamptz;
begin
  select c.business_id, coalesce(o.expires_at, c.saved_at + interval '30 days')
    into v_biz, v_exp
    from public.customer_saved_offers c
    join public.offers o on o.id = c.offer_id
   where c.id = p_saved_id;
  if v_biz is null then raise exception 'gift not found'; end if;
  if not public.staffs_business(v_biz) then raise exception 'permission denied'; end if;
  if v_exp <= now() then raise exception 'this gift has expired'; end if;
  update public.customer_saved_offers
     set fulfilled_at = now(), fulfilled_by = auth.uid()
   where id = p_saved_id and fulfilled_at is null;
  return p_saved_id;
end;
$function$;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public'
                    and tablename = 'customer_saved_offers') then
    alter publication supabase_realtime add table public.customer_saved_offers;
  end if;
end $$;
