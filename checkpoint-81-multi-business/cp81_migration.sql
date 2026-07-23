-- ============================================================
-- CP-81 — Multi-business membership ("My shops")
-- Run once in the Supabase SQL editor (after cp77).
--
-- One new RPC: my_memberships() — every business the signed-in
-- customer belongs to, with the branding needed to render the
-- "My shops" switcher on the Profile tab. RLS-safe: SECURITY
-- DEFINER but hard-filtered to auth.uid(); returns only fields
-- that are already public branding plus the caller's own
-- balance/tier.
-- ============================================================

create or replace function public.my_memberships()
returns table (
  business_id    uuid,
  slug           text,
  name           text,
  logo_url       text,
  app_icon_url   text,
  brand_colors   jsonb,
  points_balance integer,
  tier           text,
  status         text,
  joined_at      timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    b.id,
    b.slug,
    b.name,
    b.logo_url,
    b.app_icon_url,
    b.brand_colors,
    m.points_balance,
    m.tier,
    m.status,
    m.joined_at
  from public.business_memberships m
  join public.businesses b on b.id = m.business_id
  where m.user_id = auth.uid()
    and m.status <> 'blocked'
  order by m.joined_at asc;
$$;

comment on function public.my_memberships() is
  'CP-81: businesses the calling customer belongs to, for the Profile "My shops" switcher.';

grant execute on function public.my_memberships() to authenticated;
revoke execute on function public.my_memberships() from anon;
