-- =====================================================================
-- CHECKPOINT 63 — Atlas Command (Admin Field App) · Phase 1
-- =====================================================================
-- A phone-first companion for the door-sales team (all agency_admins).
-- It does NOT replace the web app builder — it layers on top:
--
--   • Pitch-day launcher: your built demo apps, grouped by location folder,
--     tap to open / add-to-home-screen while pitching on the road.
--   • Rep attribution: an admin self-claims a business; if it closes ("won")
--     they earn a commission (default 30%) of the deal MRR you set per deal.
--   • "My MRR" + a rep leaderboard to motivate the crew.
--
-- Phase 2 (later) adds the daily motivational nudges; Phase 3 the mini
-- mobile pipeline + PWA polish. This migration is Phase 1 only.
--
-- Apply AFTER cp62. Idempotent — safe to re-run.
-- =====================================================================


-- =====================================================================
-- 1. BUSINESSES — claim + deal columns
-- =====================================================================
alter table public.businesses
  add column if not exists claimed_by    uuid references auth.users(id) on delete set null,
  add column if not exists claimed_at    timestamptz,
  add column if not exists deal_mrr_cents int,
  add column if not exists commission_pct numeric,          -- null → use config default
  add column if not exists pitch_date    date,
  add column if not exists deal_stage    text not null default 'demo';

-- Constrain deal_stage (drop+add so re-runs don't error).
alter table public.businesses drop constraint if exists businesses_deal_stage_check;
alter table public.businesses
  add constraint businesses_deal_stage_check
  check (deal_stage in ('demo','pitched','won','lost'));

create index if not exists businesses_claimed_by_idx on public.businesses(claimed_by);
create index if not exists businesses_pitch_date_idx  on public.businesses(pitch_date);


-- =====================================================================
-- 2. ADMIN APP CONFIG (singleton row id = 1)
-- =====================================================================
-- owner_user_id = the agency owner (you). When set, only the owner can
-- reassign a claim off another rep. When null, any agency_admin can.
-- default_commission_pct = the % used when a business has no override.
-- (Phase 2 will add the daily-nudge columns here.)
-- =====================================================================
create table if not exists public.admin_app_config (
  id                      int primary key default 1 check (id = 1),
  owner_user_id           uuid references auth.users(id) on delete set null,
  default_commission_pct  numeric not null default 30,
  updated_at              timestamptz not null default now()
);
insert into public.admin_app_config (id) values (1) on conflict (id) do nothing;

alter table public.admin_app_config enable row level security;
drop policy if exists admin_app_config_read on public.admin_app_config;
create policy admin_app_config_read on public.admin_app_config for select
  using (public.is_agency_admin());
-- Writes go through set_admin_app_config (SECURITY DEFINER) only.


-- =====================================================================
-- 3. HELPERS
-- =====================================================================
-- is_agency_owner(): the configured owner, or (if none set) any admin.
create or replace function public.is_agency_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when (select owner_user_id from public.admin_app_config where id = 1) is null
      then public.is_agency_admin()
    else (select owner_user_id from public.admin_app_config where id = 1) = auth.uid()
  end;
$$;
grant execute on function public.is_agency_owner() to authenticated;

-- Effective commission % for a business (override → config default → 30).
create or replace function public.effective_commission_pct(p_business_id uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(
    (select commission_pct from public.businesses where id = p_business_id),
    (select default_commission_pct from public.admin_app_config where id = 1),
    30
  );
$$;
grant execute on function public.effective_commission_pct(uuid) to authenticated;


-- =====================================================================
-- 4. CLAIM / DEAL RPCs (agency_admin only)
-- =====================================================================

-- Self-claim an unclaimed business (or re-affirm your own). Blocked if
-- another rep owns it, unless the caller is the agency owner.
create or replace function public.claim_business(p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if not public.is_agency_admin() then raise exception 'agency admins only'; end if;
  select claimed_by into v_owner from public.businesses where id = p_business_id;
  if v_owner is not null and v_owner <> auth.uid() and not public.is_agency_owner() then
    raise exception 'already claimed by another rep';
  end if;
  update public.businesses
     set claimed_by = auth.uid(), claimed_at = now()
   where id = p_business_id;
end; $$;
grant execute on function public.claim_business(uuid) to authenticated;

-- Release a claim (your own, or any if you're the owner).
create or replace function public.release_business_claim(p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if not public.is_agency_admin() then raise exception 'agency admins only'; end if;
  select claimed_by into v_owner from public.businesses where id = p_business_id;
  if v_owner is not null and v_owner <> auth.uid() and not public.is_agency_owner() then
    raise exception 'only the claimer or the owner can release this claim';
  end if;
  update public.businesses set claimed_by = null, claimed_at = null where id = p_business_id;
end; $$;
grant execute on function public.release_business_claim(uuid) to authenticated;

-- Owner-only: assign a rep to a business (override).
create or replace function public.assign_business_rep(p_business_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agency_owner() then raise exception 'only the agency owner can reassign'; end if;
  update public.businesses
     set claimed_by = p_user_id, claimed_at = now()
   where id = p_business_id;
end; $$;
grant execute on function public.assign_business_rep(uuid, uuid) to authenticated;

-- Set deal terms (MRR, %, pitch date, stage). Any admin.
create or replace function public.set_deal_terms(
  p_business_id     uuid,
  p_deal_mrr_cents  int  default null,
  p_commission_pct  numeric default null,
  p_pitch_date      date default null,
  p_deal_stage      text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agency_admin() then raise exception 'agency admins only'; end if;
  if p_deal_stage is not null and p_deal_stage not in ('demo','pitched','won','lost') then
    raise exception 'invalid deal_stage: %', p_deal_stage;
  end if;
  update public.businesses
     set deal_mrr_cents = coalesce(p_deal_mrr_cents, deal_mrr_cents),
         commission_pct = coalesce(p_commission_pct, commission_pct),
         pitch_date     = coalesce(p_pitch_date, pitch_date),
         deal_stage     = coalesce(p_deal_stage, deal_stage)
   where id = p_business_id;
end; $$;
grant execute on function public.set_deal_terms(uuid, int, numeric, date, text) to authenticated;

-- Owner (or any admin if no owner set): update config.
create or replace function public.set_admin_app_config(
  p_owner_user_id          uuid default null,
  p_default_commission_pct numeric default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agency_owner() then raise exception 'only the agency owner can change config'; end if;
  update public.admin_app_config
     set owner_user_id         = coalesce(p_owner_user_id, owner_user_id),
         default_commission_pct = coalesce(p_default_commission_pct, default_commission_pct),
         updated_at            = now()
   where id = 1;
end; $$;
grant execute on function public.set_admin_app_config(uuid, numeric) to authenticated;


-- =====================================================================
-- 5. READ RPCs — field launcher + earnings + leaderboard
-- =====================================================================

-- Every app + its folder + deal/claim state, for the field launcher.
create or replace function public.list_field_apps()
returns table (
  id                        uuid,
  name                      text,
  slug                      text,
  logo_url                  text,
  hero_image_url            text,
  brand_colors              jsonb,
  status                    text,
  folder_id                 uuid,
  folder_name               text,
  pitch_date                date,
  deal_stage                text,
  deal_mrr_cents            int,
  commission_pct            numeric,
  monthly_commission_cents  bigint,
  claimed_by                uuid,
  claimed_by_email          text,
  claimed_by_name           text,
  is_mine                   boolean
)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.slug, b.logo_url, b.hero_image_url, b.brand_colors,
         b.status, b.folder_id, f.name,
         b.pitch_date, b.deal_stage, b.deal_mrr_cents,
         coalesce(b.commission_pct, cfg.default_commission_pct, 30),
         round(coalesce(b.deal_mrr_cents, 0)
               * coalesce(b.commission_pct, cfg.default_commission_pct, 30) / 100.0)::bigint,
         b.claimed_by, p.email, p.full_name,
         (b.claimed_by = auth.uid())
    from public.businesses b
    left join public.business_folders f on f.id = b.folder_id
    left join public.profiles p on p.id = b.claimed_by
   cross join (select default_commission_pct from public.admin_app_config where id = 1) cfg
   where public.is_agency_admin()
   order by b.pitch_date asc nulls last, f.name asc nulls last, b.name asc;
$$;
grant execute on function public.list_field_apps() to authenticated;

-- The caller's own commission picture.
create or replace function public.my_rep_earnings()
returns table (
  monthly_commission_cents  bigint,   -- from WON deals I claimed
  pipeline_commission_cents bigint,   -- claimed but not yet won
  won_count                 int,
  claimed_count             int
)
language sql stable security definer set search_path = public as $$
  select
    coalesce(sum(case when b.deal_stage = 'won'
      then round(coalesce(b.deal_mrr_cents,0) * coalesce(b.commission_pct, cfg.default_commission_pct, 30)/100.0) end), 0)::bigint,
    coalesce(sum(case when b.deal_stage <> 'won'
      then round(coalesce(b.deal_mrr_cents,0) * coalesce(b.commission_pct, cfg.default_commission_pct, 30)/100.0) end), 0)::bigint,
    count(*) filter (where b.deal_stage = 'won')::int,
    count(*)::int
  from public.businesses b
  cross join (select default_commission_pct from public.admin_app_config where id = 1) cfg
  where b.claimed_by = auth.uid();
$$;
grant execute on function public.my_rep_earnings() to authenticated;

-- Leaderboard across all reps (visible to admins).
create or replace function public.rep_leaderboard()
returns table (
  user_id                   uuid,
  email                     text,
  full_name                 text,
  won_count                 int,
  claimed_count             int,
  monthly_commission_cents  bigint
)
language sql stable security definer set search_path = public as $$
  select b.claimed_by, p.email, p.full_name,
         count(*) filter (where b.deal_stage = 'won')::int,
         count(*)::int,
         coalesce(sum(case when b.deal_stage = 'won'
           then round(coalesce(b.deal_mrr_cents,0) * coalesce(b.commission_pct, cfg.default_commission_pct, 30)/100.0) end), 0)::bigint
    from public.businesses b
    join public.profiles p on p.id = b.claimed_by
   cross join (select default_commission_pct from public.admin_app_config where id = 1) cfg
   where public.is_agency_admin() and b.claimed_by is not null
   group by b.claimed_by, p.email, p.full_name
   order by 6 desc, 4 desc;
$$;
grant execute on function public.rep_leaderboard() to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- CP-63 Phase 1 done. Apply after cp62. Set yourself as owner from the
-- Admin App tab (or: update admin_app_config set owner_user_id = '<your uid>').
-- =====================================================================
