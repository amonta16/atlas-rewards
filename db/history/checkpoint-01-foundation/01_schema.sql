-- =====================================================================
-- ATLAS REWARDS — CHECKPOINT 1: CORE SCHEMA
-- =====================================================================
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New query).
-- Safe to re-run: every statement uses IF NOT EXISTS / OR REPLACE.
-- =====================================================================

-- Extensions ----------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "citext";  -- case-insensitive text for slugs/emails

-- =====================================================================
-- 1. BUSINESSES  (= sub-accounts — each client of the agency)
-- =====================================================================
create table if not exists public.businesses (
  id                 uuid primary key default uuid_generate_v4(),
  slug               citext unique not null,           -- joesgym  → joesgym.atlasrewards.app
  name               text not null,
  industry           text,                              -- medspa, gym, restaurant, etc.
  logo_url           text,
  brand_colors       jsonb not null default '{"primary":"#6366f1","secondary":"#06b6d4","accent":"#10b981"}'::jsonb,
  welcome_message    text,
  contact_info       jsonb not null default '{}'::jsonb,  -- phone, email, address, hours
  google_review_url  text,
  widget_config      jsonb not null default '{
    "points_card": true,
    "rewards_store": true,
    "referrals": true,
    "reviews": true,
    "birthdays": true,
    "visit_tracker": true,
    "booking_cta": false,
    "offers": true,
    "leaderboard": false,
    "push": true,
    "sms": true
  }'::jsonb,
  point_rules        jsonb not null default '{
    "review": 200,
    "referral_referrer": 500,
    "referral_referee": 100,
    "birthday": 250,
    "visit": 50,
    "purchase_per_dollar": 1,
    "social_follow": 50,
    "profile_complete": 100,
    "first_visit_bonus": 100
  }'::jsonb,
  tiers              jsonb not null default '[
    {"name": "Bronze", "min_points": 0,    "perks": []},
    {"name": "Silver", "min_points": 500,  "perks": ["Birthday gift"]},
    {"name": "Gold",   "min_points": 1500, "perks": ["Birthday gift", "10% off"]},
    {"name": "VIP",    "min_points": 5000, "perks": ["Birthday gift", "10% off", "Free upgrade"]}
  ]'::jsonb,
  services           jsonb not null default '[]'::jsonb,  -- catalog of services/products
  status             text not null default 'active'        -- active, paused, archived
                     check (status in ('active','paused','archived')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- =====================================================================
-- 2. PROFILES  (one per Supabase auth.users — global identity)
-- =====================================================================
-- A single human can be a customer at many businesses. profiles holds
-- the cross-business identity; business_memberships holds per-business state.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  email        citext,
  phone        text,
  birthday     date,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- =====================================================================
-- 3. BUSINESS_USERS  (agency admins + business managers — the staff side)
-- =====================================================================
create table if not exists public.business_users (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  business_id  uuid references public.businesses(id) on delete cascade,
  -- business_id is NULL when role = 'agency_admin' (manages all businesses)
  role         text not null check (role in ('agency_admin','business_manager','business_staff')),
  created_at   timestamptz not null default now(),
  unique (user_id, business_id, role)
);

create index if not exists business_users_user_idx     on public.business_users(user_id);
create index if not exists business_users_business_idx on public.business_users(business_id);

-- =====================================================================
-- 4. BUSINESS_MEMBERSHIPS  (the customer side — one row per user × business)
-- =====================================================================
create table if not exists public.business_memberships (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  business_id             uuid not null references public.businesses(id) on delete cascade,
  points_balance          integer not null default 0 check (points_balance >= 0),
  lifetime_points_earned  integer not null default 0,
  tier                    text not null default 'Bronze',
  joined_at               timestamptz not null default now(),
  last_visit_at           timestamptz,
  visit_count             integer not null default 0,
  status                  text not null default 'active'
                          check (status in ('active','dormant','blocked')),
  referral_code           text unique,           -- short code this member shares
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, business_id)
);

create index if not exists memberships_business_idx        on public.business_memberships(business_id);
create index if not exists memberships_user_idx            on public.business_memberships(user_id);
create index if not exists memberships_last_visit_idx      on public.business_memberships(business_id, last_visit_at);
create index if not exists memberships_referral_code_idx   on public.business_memberships(referral_code);

-- =====================================================================
-- 5. POINTS_LEDGER  (immutable source of truth for every point move)
-- =====================================================================
create table if not exists public.points_ledger (
  id               uuid primary key default uuid_generate_v4(),
  membership_id    uuid not null references public.business_memberships(id) on delete cascade,
  business_id      uuid not null references public.businesses(id) on delete cascade,
  delta            integer not null,                     -- positive = earn, negative = spend
  rule_type        text not null check (rule_type in (
                     'review','referral_referrer','referral_referee','birthday','visit',
                     'purchase','social_follow','profile_complete','first_visit_bonus',
                     'milestone','reactivation','redemption','manual_adjust','reversal'
                   )),
  reference_id     uuid,                                  -- nullable: review_id, redemption_id, etc.
  idempotency_key  text unique,                           -- prevents double-awards from webhooks
  balance_after    integer not null,
  notes            text,
  created_by       uuid references auth.users(id),        -- staff who made manual adjust (nullable)
  created_at       timestamptz not null default now()
);

create index if not exists ledger_membership_idx on public.points_ledger(membership_id, created_at desc);
create index if not exists ledger_business_idx   on public.points_ledger(business_id, created_at desc);

-- =====================================================================
-- 6. REWARDS  (per-business catalog)
-- =====================================================================
create table if not exists public.rewards (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null,
  description   text,
  reward_type   text not null check (reward_type in ('discount','free_item','vip_perk','upgrade','custom')),
  point_cost    integer not null check (point_cost > 0),
  image_url     text,
  terms         text,
  inventory     integer,                                -- nullable = unlimited
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists rewards_business_idx on public.rewards(business_id, is_active, sort_order);

-- =====================================================================
-- 7. REDEMPTIONS
-- =====================================================================
create table if not exists public.redemptions (
  id              uuid primary key default uuid_generate_v4(),
  membership_id   uuid not null references public.business_memberships(id) on delete cascade,
  reward_id       uuid not null references public.rewards(id) on delete restrict,
  business_id     uuid not null references public.businesses(id) on delete cascade,
  point_cost      integer not null,                      -- snapshot at redeem time
  code            text not null,                         -- short code customer shows
  status          text not null default 'pending'
                  check (status in ('pending','fulfilled','expired','cancelled')),
  fulfilled_by    uuid references auth.users(id),
  fulfilled_at    timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);

create unique index if not exists redemptions_business_code_idx on public.redemptions(business_id, code);
create index if not exists redemptions_membership_idx           on public.redemptions(membership_id, status);

-- =====================================================================
-- 8. REFERRALS
-- =====================================================================
create table if not exists public.referrals (
  id                       uuid primary key default uuid_generate_v4(),
  business_id              uuid not null references public.businesses(id) on delete cascade,
  referrer_membership_id   uuid not null references public.business_memberships(id) on delete cascade,
  referee_user_id          uuid references auth.users(id),                    -- null until signup
  referee_membership_id    uuid references public.business_memberships(id),   -- null until membership created
  code                     text not null,
  status                   text not null default 'sent'
                           check (status in ('sent','signed_up','completed','expired')),
  signed_up_at             timestamptz,
  completed_at             timestamptz,
  reward_issued_at         timestamptz,
  created_at               timestamptz not null default now()
);

create unique index if not exists referrals_code_idx on public.referrals(business_id, code);
create index if not exists referrals_referrer_idx    on public.referrals(referrer_membership_id);

-- =====================================================================
-- 9. REVIEWS
-- =====================================================================
create table if not exists public.reviews (
  id                     uuid primary key default uuid_generate_v4(),
  membership_id          uuid not null references public.business_memberships(id) on delete cascade,
  business_id            uuid not null references public.businesses(id) on delete cascade,
  platform               text not null default 'google',
  status                 text not null default 'pending'
                         check (status in ('pending','verified','rejected')),
  verification_method    text check (verification_method in ('screenshot','link','manual')),
  verification_data      jsonb,
  submitted_at           timestamptz not null default now(),
  verified_at            timestamptz,
  verified_by            uuid references auth.users(id),
  reward_issued_at       timestamptz
);

create index if not exists reviews_membership_idx on public.reviews(membership_id);
create index if not exists reviews_business_idx   on public.reviews(business_id, status);

-- =====================================================================
-- 10. EVENTS  (analytics + webhook firehose)
-- =====================================================================
create table if not exists public.events (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  membership_id   uuid references public.business_memberships(id) on delete set null,
  event_type      text not null,                       -- visit, purchase, signup, redemption, etc.
  payload         jsonb not null default '{}'::jsonb,
  source          text not null default 'manual',      -- manual, webhook, automation, app
  amount_cents    integer,                             -- for revenue attribution
  created_at      timestamptz not null default now()
);

create index if not exists events_business_type_idx on public.events(business_id, event_type, created_at desc);
create index if not exists events_membership_idx    on public.events(membership_id, created_at desc);

-- =====================================================================
-- 11. AUTOMATION_RULES  (CP 12 hook — included now so schema is stable)
-- =====================================================================
create table if not exists public.automation_rules (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  name          text not null,
  trigger       jsonb not null,    -- {"type": "points_reached", "value": 1000}
  action        jsonb not null,    -- {"type": "send_sms", "template": "..."}
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists automation_business_idx on public.automation_rules(business_id, is_active);

-- =====================================================================
-- 12. WEBHOOK_ENDPOINTS  (CP 11 hook)
-- =====================================================================
create table if not exists public.webhook_endpoints (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references public.businesses(id) on delete cascade,
  url           text not null,
  secret        text not null,            -- HMAC signing key
  events        text[] not null default '{}',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- =====================================================================
-- Updated_at triggers
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

do $$
declare t text;
begin
  for t in select unnest(array['businesses','profiles','business_memberships','rewards','automation_rules']) loop
    execute format('drop trigger if exists trg_updated_at on public.%I', t);
    execute format('create trigger trg_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- =====================================================================
-- Auto-create profile when a new auth.users row appears
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, phone, full_name)
  values (
    new.id,
    new.email,
    new.phone,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
