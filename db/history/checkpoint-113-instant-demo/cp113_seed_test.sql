-- =====================================================================
-- Atlas · CP-113 create_demo_business seed test
-- =====================================================================
-- Runs ENTIRELY inside a transaction that is ROLLED BACK — safe to run
-- against production in the Supabase SQL editor. Seeds its own throwaway
-- image_library rows so it doesn't depend on the live library, generates
-- one demo, asserts every content type landed, then rolls everything back.
-- Assumes cp113_instant_demo.sql is applied. 'postgres' resets the role
-- between the RPC call (run as an agency admin) and the assertions.
-- =====================================================================
begin;
do $t$
declare
  admin uuid;
  ind   text := 'cp111-selftest';
  v_biz uuid; v_slug text; n int; ms jsonb;
  pack jsonb := $j$
  {
    "industry": "cp111-selftest",
    "rewards": [
      {"name":"Free drink","point_cost":300,"reward_type":"free_item","description":"any drink"},
      {"name":"$5 off","point_cost":500,"reward_type":"discount","description":"over $15"},
      {"name":"Free appetizer","point_cost":800,"reward_type":"free_item","description":"a starter"},
      {"name":"VIP perk","point_cost":1500,"reward_type":"vip_perk","description":"skip line"}
    ],
    "spin_free_reward": {"name":"Free cookie","description":"warm cookie","reward_type":"free_item"},
    "spin_points": [
      {"label":"25 pts","points":25,"weight":40},
      {"label":"75 pts","points":75,"weight":25},
      {"label":"150 pts","points":150,"weight":10}
    ],
    "offer": {"title":"BOGO 50% off","description":"this week","expiresDays":7},
    "streak": {"period_type":"weekly","checkins_required":1,"milestones":[
      {"count":2,"label":"2 weeks","gift_kind":"reward","reward_ref":0,"mystery":false},
      {"count":3,"label":"3 weeks","gift_kind":"points","points":150,"mystery":false},
      {"count":4,"label":"4 weeks","gift_kind":"reward","reward_ref":2,"mystery":false},
      {"count":5,"label":"5 weeks","gift_kind":"points","points":400,"mystery":true}
    ]}
  }
  $j$;
begin
  -- an existing agency admin to run as (any agency_admin row)
  select user_id into admin from public.business_users where role = 'agency_admin' limit 1;
  if admin is null then
    raise notice 'SKIP: no agency_admin found to run the test as'; return;
  end if;

  -- throwaway niche images so rewards/hero/offer get pictures
  insert into public.image_library(industry,category,title,storage_path,public_url) values
    (ind,'hero','h','cp111test/h1','https://example.test/hero.jpg'),
    (ind,'offer','o','cp111test/o1','https://example.test/offer.jpg'),
    (ind,'reward','r1','cp111test/r1','https://example.test/r1.jpg'),
    (ind,'reward','r2','cp111test/r2','https://example.test/r2.jpg'),
    (ind,'reward','r3','cp111test/r3','https://example.test/r3.jpg');

  perform set_config('request.jwt.claims', json_build_object('sub',admin,'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  select new_business_id, new_slug into v_biz, v_slug
    from public.create_demo_business(
      'CP111 Self Test', 'cp111-self-test', ind,
      '{"primary":"#e2571f","secondary":"#b8410f","accent":"#f4b333"}'::jsonb,
      'https://logo/test.png', pack);

  perform set_config('role','postgres', true);

  select count(*) into n from public.businesses
   where id=v_biz and is_demo and folder_id is not null and hero_image_url is not null
     and brand_colors->>'primary'='#e2571f';
  if n<>1 then raise exception 'B FAIL: business not seeded'; end if;

  select count(*) into n from public.rewards where business_id=v_biz and is_active and show_in_store;
  if n<>4 then raise exception 'R FAIL: expected 4 store rewards, got %', n; end if;
  select count(*) into n from public.rewards where business_id=v_biz and show_in_store=false;
  if n<>1 then raise exception 'R FAIL: expected 1 prize-only reward, got %', n; end if;

  select count(*) into n from public.mystery_reward_pool where business_id=v_biz and kind='points';
  if n<>3 then raise exception 'SPIN FAIL: expected 3 points wedges, got %', n; end if;
  select count(*) into n from public.mystery_reward_pool p
    join public.rewards rw on rw.id=p.reward_id
   where p.business_id=v_biz and p.kind='reward' and rw.show_in_store=false;
  if n<>1 then raise exception 'SPIN FAIL: free-reward wedge not linked'; end if;

  select count(*) into n from public.offers
   where business_id=v_biz and is_featured and is_active and image_url is not null and expires_at > now();
  if n<>1 then raise exception 'OFFER FAIL: featured image offer missing'; end if;

  select milestones into ms from public.streak_config
   where business_id=v_biz and is_enabled and period_type='weekly';
  if ms is null or jsonb_array_length(ms) <> 4 then raise exception 'STREAK FAIL: expected 4 milestones'; end if;
  select count(*) into n from jsonb_array_elements(ms) m
   where m->>'gift_kind'='reward'
     and (m->>'reward_id')::uuid in (select id from public.rewards where business_id=v_biz);
  if n<>2 then raise exception 'STREAK FAIL: reward milestones not linked (%)', n; end if;

  raise notice '✅ CP-113 DEMO SEED OK — slug=%', v_slug;
end;
$t$;
rollback;
