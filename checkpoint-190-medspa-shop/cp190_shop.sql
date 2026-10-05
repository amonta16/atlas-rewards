-- CP-190 · applied 2026-10-05 (one statement per call)
create table if not exists public.medspa_shop_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null, item_id text not null, item_name text not null,
  kind text not null check (kind in ('product','package','gift_card')),
  quantity integer not null default 1, amount_cents integer not null,
  status text not null default 'pending' check (status in ('pending','reserved','paid','fulfilled','cancelled','refunded')),
  pay_method text not null default 'stripe' check (pay_method in ('stripe','in_person')),
  treatment_id text, sessions_total integer, sessions_used integer not null default 0,
  gift_code text unique, gift_balance_cents integer, recipient_name text, recipient_note text,
  stripe_checkout_id text, stripe_payment_intent text,
  created_at timestamptz not null default now(), paid_at timestamptz, fulfilled_at timestamptz, updated_by uuid
);
alter table public.medspa_shop_orders enable row level security;
create policy medspa_orders_self_read on public.medspa_shop_orders for select using (user_id = auth.uid() or staffs_business(business_id));
create policy medspa_orders_staff_write on public.medspa_shop_orders for update using (staffs_business(business_id)) with check (staffs_business(business_id));
create index if not exists medspa_shop_orders_biz_idx on public.medspa_shop_orders (business_id, status, created_at desc);
create index if not exists medspa_shop_orders_user_idx on public.medspa_shop_orders (business_id, user_id, created_at desc);
-- medspa_shop_orders_desk(p_business_id, p_limit) — see Supabase for the definition (security definer, staff-gated).
alter table public.landing_demo_requests add column if not exists calendar_event_id text, add column if not exists meet_url text, add column if not exists calendar_status text;
