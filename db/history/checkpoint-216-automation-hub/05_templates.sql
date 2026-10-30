-- CP-216 · Automation Hub · 05 server-side templates (same for every business)
-- APPLIED to production Oct 23 2026 (migration cp216_05_templates). Safe to re-run.
-- No a.email / a.sms in templates: those are needs_setup / coming_soon and would block Publish.

create or replace function public.wf_tn(p_id text, p_type text, p_label text, p_x int, p_y int, p_cfg jsonb default '{}'::jsonb) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'type', p_type, 'label', p_label, 'position', jsonb_build_object('x', p_x, 'y', p_y), 'config', coalesce(p_cfg, '{}'::jsonb));
$$;
create or replace function public.wf_te(p_from text, p_to text, p_branch text default null) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', 'e_' || p_from || '_' || p_to || coalesce('_' || p_branch, ''), 'from', p_from, 'to', p_to, 'branch', p_branch);
$$;

-- The spec's win-back shape, parameterised (section 3 of the spec).
create or replace function public.wf_winback_graph(p_days int, p_title text, p_body text) returns jsonb language sql immutable as $$
  select jsonb_build_object('nodes', jsonb_build_array(
    public.wf_tn('n1','t.inactive','No visit in ' || p_days || ' days',0,0,jsonb_build_object('days',p_days)),
    public.wf_tn('n2','c.visited','Already returned?',0,140,jsonb_build_object('within_days',2)),
    public.wf_tn('n3','w.exit','End',-260,280),
    public.wf_tn('n4','a.push','Push: we miss you',260,280,jsonb_build_object('title',p_title,'body',p_body,'link_path','/app')),
    public.wf_tn('n5','w.wait','Wait 3 days',260,420,jsonb_build_object('minutes',4320)),
    public.wf_tn('n6','c.visited','Visited or redeemed?',260,560,jsonb_build_object('within_days',3)),
    public.wf_tn('n7','a.points','Award bonus points',0,700,jsonb_build_object('points',100,'note','Welcome back bonus')),
    public.wf_tn('n8','w.exit','End',0,840),
    public.wf_tn('n9','a.offer','Offer: personal gift',520,700,jsonb_build_object('title','We saved you something, {{first_name}}','body','Come back this week and these bonus points are yours.','bonus_points',150,'expires_days',7)),
    public.wf_tn('n10','w.wait','Wait 5 days',520,840,jsonb_build_object('minutes',7200)),
    public.wf_tn('n11','c.visited','Still inactive?',520,980,jsonb_build_object('within_days',5)),
    public.wf_tn('n12','a.tag','Tag: At risk',780,1120,jsonb_build_object('tag','At risk')),
    public.wf_tn('n13','w.exit','End',520,1260)),
   'edges', jsonb_build_array(
    public.wf_te('n1','n2'),public.wf_te('n2','n3','yes'),public.wf_te('n2','n4','no'),public.wf_te('n4','n5'),public.wf_te('n5','n6'),
    public.wf_te('n6','n7','yes'),public.wf_te('n6','n9','no'),public.wf_te('n7','n8'),public.wf_te('n9','n10'),public.wf_te('n10','n11'),
    public.wf_te('n11','n13','yes'),public.wf_te('n11','n12','no'),public.wf_te('n12','n13')));
$$;

-- Returns {name, family, reentry_days, graph} for a template key. Needs the business for reward lookups.
create or replace function public.wf_template(p_key text, p_business_id uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare rw uuid; rwn text; g jsonb; v_name text; v_family text; v_reentry int := 30; gift jsonb;
begin
  select r.id, r.name into rw, rwn from public.rewards r where r.business_id = p_business_id and r.is_active and r.archived_at is null order by r.point_cost limit 1;
  -- a gift step: unlock the cheapest reward when the business has one, else a Home offer with bonus points
  gift := case when rw is not null then jsonb_build_object('type','a.unlock','label','Unlock: ' || rwn,'config',jsonb_build_object('reward_id', rw, 'expires_days', 14))
               else jsonb_build_object('type','a.offer','label','Offer: bonus points','config',jsonb_build_object('title','A little something from {{business}}','body','We added bonus points to your account. Come use them!','bonus_points',100,'expires_days',14)) end;

  case p_key
  -- ───────── med spa ─────────
  when 'ms.welcome' then
    v_name := 'New Client Welcome'; v_family := 'welcome'; v_reentry := 365;
    g := jsonb_build_object('nodes', jsonb_build_array(
      public.wf_tn('n1','t.signup','Patient signs up',0,0),
      public.wf_tn('n2','a.push','Push: welcome',0,140,jsonb_build_object('title','Welcome to {{business}}, {{first_name}}!','body','Your rewards account is ready. Book your first visit and your welcome points land right away.','link_path','/app')),
      public.wf_tn('n3','w.wait','Wait 1 day',0,280,jsonb_build_object('minutes',1440)),
      public.wf_tn('n4','a.offer','Offer: first-visit bonus',0,420,jsonb_build_object('title','Your first-visit bonus','body','Book any treatment this month and we add 100 points to your account.','bonus_points',100,'expires_days',30)),
      public.wf_tn('n5','w.wait','Wait 7 days',0,560,jsonb_build_object('minutes',10080)),
      public.wf_tn('n6','c.visited','Booked or visited?',0,700,jsonb_build_object('within_days',8)),
      public.wf_tn('n7','a.push','Push: thank you',-260,840,jsonb_build_object('title','Lovely to see you, {{first_name}}','body','Your aftercare and due dates now live in the app.','link_path','/app/care')),
      public.wf_tn('n8','a.push','Push: still thinking?',260,840,jsonb_build_object('title','Still thinking it over?','body','Your first-visit bonus is waiting. Pick a time whenever suits you.','link_path','/app/book')),
      public.wf_tn('n9','w.exit','End',0,980)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'),public.wf_te('n2','n3'),public.wf_te('n3','n4'),public.wf_te('n4','n5'),public.wf_te('n5','n6'),public.wf_te('n6','n7','yes'),public.wf_te('n6','n8','no'),public.wf_te('n7','n9'),public.wf_te('n8','n9')));
  when 'ms.appointment_reminder' then
    v_name := 'Appointment Reminder'; v_family := 'booking'; v_reentry := 1;
    g := jsonb_build_object('nodes', jsonb_build_array(
      public.wf_tn('n1','t.booking','Appointment confirmed',0,0,jsonb_build_object('status','confirmed')),
      public.wf_tn('n2','a.push','Push: you''re booked',0,140,jsonb_build_object('title','You''re booked at {{business}}','body','Arrive with clean skin and skip retinol the night before. See you soon, {{first_name}}.','link_path','/app/care')),
      public.wf_tn('n3','w.wait','Wait 1 day',0,280,jsonb_build_object('minutes',1440)),
      public.wf_tn('n4','a.push','Push: reminder',0,420,jsonb_build_object('title','See you soon, {{first_name}}','body','Your appointment at {{business}} is coming up. Need to move it? Call the front desk.','link_path','/app/book')),
      public.wf_tn('n5','w.wait','Wait 3 days',0,560,jsonb_build_object('minutes',4320)),
      public.wf_tn('n6','c.visited','Came in?',0,700,jsonb_build_object('within_days',4)),
      public.wf_tn('n7','a.push','Push: aftercare',-260,840,jsonb_build_object('title','Your aftercare, {{first_name}}','body','Tap to see today''s aftercare and when you''re due next.','link_path','/app/care')),
      public.wf_tn('n8','w.exit','End',0,980)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'),public.wf_te('n2','n3'),public.wf_te('n3','n4'),public.wf_te('n4','n5'),public.wf_te('n5','n6'),public.wf_te('n6','n7','yes'),public.wf_te('n6','n8','no'),public.wf_te('n7','n8')));
  when 'ms.winback' then
    v_name := 'Client Win-Back'; v_family := 'winback'; v_reentry := 60;
    g := public.wf_winback_graph(45, '{{first_name}}, it''s been a while', 'It''s been {{days_since_last_visit}} days since your last visit. Your results last longer with a touch-up — book this week for bonus points.');
  when 'ms.treatment_followup' then
    v_name := 'Treatment Follow-Up'; v_family := 'followup'; v_reentry := 7;
    g := jsonb_build_object('nodes', jsonb_build_array(
      public.wf_tn('n1','t.treatment','Treatment logged',0,0),
      public.wf_tn('n2','w.wait','Wait 1 day',0,140,jsonb_build_object('minutes',1440)),
      public.wf_tn('n3','a.push','Push: how are you feeling?',0,280,jsonb_build_object('title','How are you feeling, {{first_name}}?','body','Mild redness is normal for a day or two. Your aftercare steps are in the app.','link_path','/app/care')),
      public.wf_tn('n4','w.wait','Wait 7 days',0,420,jsonb_build_object('minutes',10080)),
      public.wf_tn('n5','a.push','Push: results check-in',0,560,jsonb_build_object('title','Seeing results yet?','body','Results keep improving over the next few weeks. Your next recommended visit is in the app.','link_path','/app/care')),
      public.wf_tn('n6','w.exit','End',0,700)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'),public.wf_te('n2','n3'),public.wf_te('n3','n4'),public.wf_te('n4','n5'),public.wf_te('n5','n6')));
  when 'ms.vip' then
    v_name := 'VIP Client Journey'; v_family := 'vip'; v_reentry := 365;
    g := jsonb_build_object('nodes', jsonb_build_array(
      public.wf_tn('n1','t.spend','Lifetime spend reaches $1,500',0,0,jsonb_build_object('min_cents',150000)),
      public.wf_tn('n2','a.tag','Tag: VIP',0,140,jsonb_build_object('tag','VIP')),
      public.wf_tn('n3','a.push','Push: VIP recognition',0,280,jsonb_build_object('title','You''re a {{business}} VIP, {{first_name}}','body','Thank you for trusting us. A gift is waiting in your rewards.','link_path','/app/rewards')),
      gift || jsonb_build_object('id','n4','position',jsonb_build_object('x',0,'y',420)),
      public.wf_tn('n5','a.notify_admin','Tell the manager',0,560,jsonb_build_object('title','New VIP: {{member}}','body','{{member}} just crossed $1,500 lifetime. Worth a personal thank-you at their next visit.')),
      public.wf_tn('n6','w.exit','End',0,700)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'),public.wf_te('n2','n3'),public.wf_te('n3','n4'),public.wf_te('n4','n5'),public.wf_te('n5','n6')));
  -- ───────── classic local business ─────────
  when 'cl.welcome' then
    v_name := 'New Customer Welcome'; v_family := 'welcome'; v_reentry := 365;
    g := jsonb_build_object('nodes', jsonb_build_array(
      public.wf_tn('n1','t.signup','Customer signs up',0,0),
      public.wf_tn('n2','a.push','Push: welcome',0,140,jsonb_build_object('title','Welcome to {{business}}, {{first_name}}!','body','Check in on every visit to earn points. Your first reward is {{points_remaining}} points away.','link_path','/app')),
      public.wf_tn('n3','w.wait','Wait 2 days',0,280,jsonb_build_object('minutes',2880)),
      public.wf_tn('n4','c.visited','Visited yet?',0,420,jsonb_build_object('within_days',3)),
      public.wf_tn('n5','a.offer','Offer: first-visit bonus',260,560,jsonb_build_object('title','Your first visit comes with a bonus','body','Come in this week and we''ll add 50 points on top of your check-in.','bonus_points',50,'expires_days',7)),
      public.wf_tn('n6','w.exit','End',0,700)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'),public.wf_te('n2','n3'),public.wf_te('n3','n4'),public.wf_te('n4','n6','yes'),public.wf_te('n4','n5','no'),public.wf_te('n5','n6')));
  when 'cl.first_to_second' then
    v_name := 'First-to-Second Visit'; v_family := 'second_visit'; v_reentry := 365;
    g := jsonb_build_object('nodes', jsonb_build_array(
      public.wf_tn('n1','t.checkin','Customer checks in',0,0),
      public.wf_tn('n2','c.new_vs_returning','First visit?',0,140,jsonb_build_object('is','new')),
      public.wf_tn('n3','w.wait','Wait 5 days',-260,280,jsonb_build_object('minutes',7200)),
      public.wf_tn('n4','c.visited','Came back?',-260,420,jsonb_build_object('within_days',5)),
      public.wf_tn('n5','a.points','Award 50 points',-520,560,jsonb_build_object('points',50,'note','Second-visit bonus')),
      public.wf_tn('n6','a.push','Push: second visit nudge',0,560,jsonb_build_object('title','Round two, {{first_name}}?','body','Your next check-in gets you closer to your first reward — only {{points_remaining}} points to go.','link_path','/app')),
      public.wf_tn('n7','w.exit','End',0,700)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'),public.wf_te('n2','n3','yes'),public.wf_te('n2','n7','no'),public.wf_te('n3','n4'),public.wf_te('n4','n5','yes'),public.wf_te('n4','n6','no'),public.wf_te('n5','n7'),public.wf_te('n6','n7')));
  when 'cl.points_milestone' then
    v_name := 'Points Milestone'; v_family := 'milestone'; v_reentry := 90;
    g := jsonb_build_object('nodes', jsonb_build_array(
      public.wf_tn('n1','t.points','Customer earns points',0,0),
      public.wf_tn('n2','c.points','Balance 500+?',0,140,jsonb_build_object('op','gte','value',500)),
      public.wf_tn('n3','a.push','Push: milestone',-260,280,jsonb_build_object('title','500 points, {{first_name}}!','body','You''ve got rewards ready to redeem. Tap to pick one.','link_path','/app/rewards')),
      public.wf_tn('n4','w.exit','End',0,420)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'),public.wf_te('n2','n3','yes'),public.wf_te('n2','n4','no'),public.wf_te('n3','n4')));
  when 'cl.weekly_visit' then
    v_name := 'Weekly Visit Encouragement'; v_family := 'weekly'; v_reentry := 7;
    g := jsonb_build_object('nodes', jsonb_build_array(
      public.wf_tn('n1','t.checkin','Customer checks in',0,0),
      public.wf_tn('n2','w.wait','Wait 6 days',0,140,jsonb_build_object('minutes',8640)),
      public.wf_tn('n3','c.visited','Visited this week?',0,280,jsonb_build_object('within_days',6)),
      public.wf_tn('n4','a.push','Push: keep it going',260,420,jsonb_build_object('title','Keep your week going','body','One more check-in this week keeps your points climbing. We''re open late today.','link_path','/app')),
      public.wf_tn('n5','w.exit','End',0,560)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'),public.wf_te('n2','n3'),public.wf_te('n3','n5','yes'),public.wf_te('n3','n4','no'),public.wf_te('n4','n5')));
  when 'cl.streak_recovery' then
    v_name := 'Streak Recovery'; v_family := 'streak'; v_reentry := 14;
    g := jsonb_build_object('nodes', jsonb_build_array(
      public.wf_tn('n1','t.streak_break','Streak broken',0,0),
      public.wf_tn('n2','a.push','Push: start a new streak',0,140,jsonb_build_object('title','Your streak reset, {{first_name}}','body','No stress — check in today and a new one starts. Bonus points on your next visit.','link_path','/app')),
      public.wf_tn('n3','w.wait','Wait 2 days',0,280,jsonb_build_object('minutes',2880)),
      public.wf_tn('n4','c.visited','Came back?',0,420,jsonb_build_object('within_days',2)),
      public.wf_tn('n5','a.points','Award 25 points',-260,560,jsonb_build_object('points',25,'note','Streak recovery bonus')),
      public.wf_tn('n6','w.exit','End',0,700)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'),public.wf_te('n2','n3'),public.wf_te('n3','n4'),public.wf_te('n4','n5','yes'),public.wf_te('n4','n6','no'),public.wf_te('n5','n6')));
  when 'cl.birthday' then
    v_name := 'Birthday Reward'; v_family := 'birthday'; v_reentry := 300;
    g := jsonb_build_object('nodes', jsonb_build_array(
      public.wf_tn('n1','t.birthday','Customer''s birthday',0,0),
      public.wf_tn('n2','a.offer','Offer: birthday gift',0,140,jsonb_build_object('title','Happy birthday, {{first_name}}! 🎂','body','We added 100 points to your account. Come celebrate with us this week.','bonus_points',100,'expires_days',7)),
      public.wf_tn('n3','w.exit','End',0,280)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'),public.wf_te('n2','n3')));
  when 'cl.winback' then
    v_name := 'Customer Win-Back'; v_family := 'winback'; v_reentry := 45;
    g := public.wf_winback_graph(14, 'We miss you, {{first_name}}!', 'We miss you! Come back this week for bonus points.');
  when 'cl.referral' then
    v_name := 'Referral Thank-You'; v_family := 'referral'; v_reentry := 1;
    g := jsonb_build_object('nodes', jsonb_build_array(
      public.wf_tn('n1','t.referral','Referral completed',0,0),
      public.wf_tn('n2','a.push','Push: thank you',0,140,jsonb_build_object('title','Your friend joined — thank you!','body','Referral points are in your balance, {{first_name}}. Know anyone else who''d love {{business}}?','link_path','/app/rewards')),
      public.wf_tn('n3','w.exit','End',0,280)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'),public.wf_te('n2','n3')));
  when 'cl.limited_promo' then
    v_name := 'Limited-Time Promotion'; v_family := 'promo'; v_reentry := 30;
    g := jsonb_build_object('nodes', jsonb_build_array(
      public.wf_tn('n1','t.checkin','Customer checks in',0,0),
      public.wf_tn('n2','c.tagged','Already got this promo?',0,140,jsonb_build_object('tag','Promo sent')),
      public.wf_tn('n3','a.offer','Offer: this week only',260,280,jsonb_build_object('title','This week only','body','Double points on your next visit, {{first_name}}. Show this at the counter.','bonus_points',0,'expires_days',7)),
      public.wf_tn('n4','a.tag','Tag: Promo sent',260,420,jsonb_build_object('tag','Promo sent')),
      public.wf_tn('n5','w.exit','End',0,560)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'),public.wf_te('n2','n5','yes'),public.wf_te('n2','n3','no'),public.wf_te('n3','n4'),public.wf_te('n4','n5')));
  when 'cl.vip' then
    v_name := 'VIP Customer Appreciation'; v_family := 'vip'; v_reentry := 365;
    g := jsonb_build_object('nodes', jsonb_build_array(
      public.wf_tn('n1','t.spend','Lifetime spend reaches $500',0,0,jsonb_build_object('min_cents',50000)),
      public.wf_tn('n2','a.tag','Tag: VIP',0,140,jsonb_build_object('tag','VIP')),
      gift || jsonb_build_object('id','n3','position',jsonb_build_object('x',0,'y',280)),
      public.wf_tn('n4','a.notify_admin','Tell the manager',0,420,jsonb_build_object('title','New VIP: {{member}}','body','{{member}} crossed $500 lifetime spend. A thank-you at the counter goes a long way.')),
      public.wf_tn('n5','w.exit','End',0,560)),
      'edges', jsonb_build_array(public.wf_te('n1','n2'),public.wf_te('n2','n3'),public.wf_te('n3','n4'),public.wf_te('n4','n5')));
  when 'ec.cart','ec.browse','ec.post_purchase','ec.recommend','ec.repeat','ec.crosssell' then
    raise exception 'needs_integration' using detail = 'E-commerce templates need a connected store that sends cart and product events.';
  else
    raise exception 'unknown template %', p_key;
  end case;
  return jsonb_build_object('name', v_name, 'family', v_family, 'reentry_days', v_reentry, 'graph', g);
end $$;

create or replace function public.wf_load_template(p_business_id uuid, p_template_key text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare t jsonb; v_wf uuid; v_vid uuid;
begin
  perform public.wf_assert_admin();
  t := public.wf_template(p_template_key, p_business_id);
  insert into public.workflows (business_id, name, family, reentry_days, template_key, created_by)
  values (p_business_id, t->>'name', t->>'family', coalesce((t->>'reentry_days')::int, 30), p_template_key, auth.uid()) returning id into v_wf;
  insert into public.workflow_versions (workflow_id, version, graph, notes) values (v_wf, 1, t->'graph', 'Loaded from template ' || p_template_key) returning id into v_vid;
  return public.wf_get(v_wf);
end $$;

create or replace function public.wf_template_catalog() returns jsonb language sql immutable as $$
  select jsonb_build_array(
    jsonb_build_object('group','Med spa','items',jsonb_build_array(
      jsonb_build_object('key','ms.welcome','name','New Client Welcome','desc','Signup → welcome → first-visit incentive → follow-up'),
      jsonb_build_object('key','ms.appointment_reminder','name','Appointment Reminder','desc','Confirmed → reminder → aftercare after the visit'),
      jsonb_build_object('key','ms.winback','name','Client Win-Back','desc','No visit in 45 days → personal reminder → gift → follow-up'),
      jsonb_build_object('key','ms.treatment_followup','name','Treatment Follow-Up','desc','Treatment logged → next-day check-in → results check-in'),
      jsonb_build_object('key','ms.vip','name','VIP Client Journey','desc','$1,500 lifetime → VIP tag → gift → manager heads-up'))),
    jsonb_build_object('group','Classic local business','items',jsonb_build_array(
      jsonb_build_object('key','cl.welcome','name','New Customer Welcome','desc','Signup → welcome → first-visit bonus if they haven''t come in'),
      jsonb_build_object('key','cl.first_to_second','name','First-to-Second Visit','desc','First check-in → nudge or bonus for the second'),
      jsonb_build_object('key','cl.points_milestone','name','Points Milestone','desc','Balance passes 500 → rewards reminder'),
      jsonb_build_object('key','cl.weekly_visit','name','Weekly Visit Encouragement','desc','Check-in → 6 days → nudge if they skipped the week'),
      jsonb_build_object('key','cl.streak_recovery','name','Streak Recovery','desc','Streak broken → restart nudge → bonus on return'),
      jsonb_build_object('key','cl.birthday','name','Birthday Reward','desc','Birthday → gift with bonus points'),
      jsonb_build_object('key','cl.winback','name','Customer Win-Back','desc','No visit in 14 days → push → gift → At-risk tag'),
      jsonb_build_object('key','cl.referral','name','Referral Thank-You','desc','Referral completes → thank-you push'),
      jsonb_build_object('key','cl.limited_promo','name','Limited-Time Promotion','desc','Next check-in → one-time promo, tagged so it never repeats'),
      jsonb_build_object('key','cl.vip','name','VIP Customer Appreciation','desc','$500 lifetime → VIP tag → gift → manager heads-up'))),
    jsonb_build_object('group','E-commerce','locked',true,'reason','Needs a connected store that sends cart and product events.','items',jsonb_build_array(
      jsonb_build_object('key','ec.cart','name','Abandoned Cart Recovery'),jsonb_build_object('key','ec.browse','name','Browsed, Didn''t Buy'),
      jsonb_build_object('key','ec.post_purchase','name','Post-Purchase Follow-Up'),jsonb_build_object('key','ec.recommend','name','Product Recommendations'),
      jsonb_build_object('key','ec.repeat','name','Repeat-Purchase Reminder'),jsonb_build_object('key','ec.crosssell','name','Cross-sell & Upsell'))));
$$;
