-- =====================================================================
-- ATLAS REWARDS — CHECKPOINT 1: SEED DEMO BUSINESS
-- =====================================================================
-- Creates one demo business so you can see the schema working immediately.
-- Run AFTER 03_functions.sql.
-- =====================================================================

insert into public.businesses (slug, name, industry, logo_url, brand_colors, welcome_message, google_review_url, services)
values (
  'demo',
  'Demo Rewards Co.',
  'medspa',
  null,
  '{"primary":"#ec4899","secondary":"#8b5cf6","accent":"#f59e0b"}'::jsonb,
  'Welcome to Demo Rewards! Earn points every visit.',
  'https://g.page/demo-rewards/review',
  '[
    {"name": "Botox",        "category": "Injectables", "price_cents": 12000},
    {"name": "Facial",       "category": "Skincare",    "price_cents":  9000},
    {"name": "Microneedling","category": "Skincare",    "price_cents": 35000}
  ]'::jsonb
)
on conflict (slug) do nothing;

-- Sample rewards for the demo business
do $$
declare v_biz uuid;
begin
  select id into v_biz from public.businesses where slug = 'demo';

  insert into public.rewards (business_id, name, description, reward_type, point_cost, sort_order)
  values
    (v_biz, '$25 off Botox',     'One-time discount on any Botox service', 'discount',   500, 1),
    (v_biz, 'Free Facial',       'Complimentary signature facial',         'free_item',  2000, 2),
    (v_biz, 'VIP Upgrade',       'Upgrade to deluxe treatment for free',   'upgrade',    3500, 3),
    (v_biz, 'Birthday Surprise', 'Mystery birthday gift on us',            'custom',      750, 4)
  on conflict do nothing;
end $$;
