-- CP-221 · part 3 — Automation Hub row, Insights numbers, monthly report,
-- and who the monthly report goes to.

-- ── Automation Hub → Existing automations ─────────────────────────────────
do $$
declare d text; n text;
  anchor text := E'  union all\n  select ''sys:referral''';
  row_sql text := E'  union all\n'
    || E'  select ''sys:weekly_spin'', ''🎡 Weekly home spin'', ''cron'',\n'
    || E'         case when coalesce(b.weekly_spin_enabled, false)\n'
    || E'              then ''One free wheel spin from home per week (Mon–Sun, never stacks) · hourly job, only inside business hours''\n'
    || E'              else ''Off for this business'' end,\n'
    || E'         ''Push: unlocked weekly (first open day) · reminder at most every 2 weeks (Thu, ~4 pm) — only until they spin'', ''push'',\n'
    || E'         coalesce(b.weekly_spin_enabled, false),\n'
    || E'         (select count(*)::int from public.notifications n where n.business_id = p_business_id and n.kind = ''weekly_spin'' and n.created_at > now() - interval ''30 days''),\n'
    || E'         (select max(n.created_at) from public.notifications n where n.business_id = p_business_id and n.kind = ''weekly_spin''),\n'
    || E'         ''Brand editor → Settings → Weekly home spin''\n';
begin
  d := pg_get_functiondef('public.wf_legacy_automations'::regproc);
  if position('sys:weekly_spin' in d) = 0 then
    n := replace(d, anchor, row_sql || anchor);
    if n = d then raise exception 'hub patch anchor not found'; end if;
    execute n;
  end if;
end $$;

-- ── numbers (shared by Insights + the monthly report) ─────────────────────
create or replace function public._weekly_spin_stats(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with s as (
    select s.id, s.membership_id, s.awarded_at, p.kind as prize_kind, coalesce(p.points_amount, 0) as pts
      from public.mystery_reward_spins s
      join public.business_memberships m on m.id = s.membership_id and not coalesce(m.is_demo, false)
      left join public.mystery_reward_pool p on p.id = s.prize_id
     where s.business_id = p_business_id and s.source = 'home' and s.awarded_at >= p_from and s.awarded_at < p_to
  ), n as (
    select n.user_id, n.created_at from public.notifications n
     where n.business_id = p_business_id and n.kind = 'weekly_spin' and n.created_at >= p_from and n.created_at < p_to
  )
  select jsonb_build_object(
    'spins',          (select count(*) from s)::int,
    'spinners',       (select count(distinct membership_id) from s)::int,
    'checkin_spins',  (select count(*) from public.mystery_reward_spins c
                        join public.business_memberships m on m.id = c.membership_id and not coalesce(m.is_demo, false)
                       where c.business_id = p_business_id and c.source = 'checkin' and c.awarded_at >= p_from and c.awarded_at < p_to)::int,
    'prizes_won',     (select count(*) from s where prize_kind = 'reward')::int,
    'points_won',     (select coalesce(sum(l.delta), 0) from public.points_ledger l
                        where l.business_id = p_business_id and l.rule_type = 'mystery_bonus'
                          and l.notes like 'Weekly home spin:%' and l.created_at >= p_from and l.created_at < p_to)::int,
    -- spun from home, then walked in within 7 days
    'visited_after',  (select count(*) from s where exists (
                         select 1 from public.check_in_events ce where ce.membership_id = s.membership_id
                            and ce.created_at > s.awarded_at and ce.created_at < s.awarded_at + interval '7 days'))::int,
    'notified',       (select count(*) from n)::int,
    'members_reached',(select count(distinct user_id) from n)::int,
    -- a home spin within 48 h of a weekly-spin push
    'spun_after_push',(select count(*) from s where exists (
                         select 1 from public.notifications x join public.business_memberships m on m.user_id = x.user_id
                          where m.id = s.membership_id and x.business_id = p_business_id and x.kind = 'weekly_spin'
                            and x.created_at <= s.awarded_at and x.created_at > s.awarded_at - interval '48 hours'))::int
  )
$$;
revoke execute on function public._weekly_spin_stats(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Insights (manager dashboard).
create or replace function public.weekly_spin_insights(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_ws timestamptz; v_members int;
begin
  if public.current_app_role(p_business_id) not in ('agency_admin', 'business_manager') then
    raise exception 'not authorized for business %', p_business_id using errcode = '42501';
  end if;
  v_ws := public.weekly_spin_week_start(p_business_id);
  select count(*) into v_members from public.business_memberships m
   where m.business_id = p_business_id and not coalesce(m.is_demo, false) and m.status is distinct from 'blocked';
  return jsonb_build_object(
    'enabled', (select coalesce(weekly_spin_enabled, false) from public.businesses where id = p_business_id),
    'members', v_members,
    'week_start', v_ws,
    'this_week', public._weekly_spin_stats(p_business_id, v_ws, now()),
    'd30', public._weekly_spin_stats(p_business_id, now() - interval '30 days', now()),
    'prev30', public._weekly_spin_stats(p_business_id, now() - interval '60 days', now() - interval '30 days'),
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object('week_start', w.ws, 'spins', w.n) order by w.ws)
        from (select g.ws,
                     (select count(*) from public.mystery_reward_spins s
                        join public.business_memberships m on m.id = s.membership_id and not coalesce(m.is_demo, false)
                       where s.business_id = p_business_id and s.source = 'home'
                         and s.awarded_at >= g.ws and s.awarded_at < g.ws + interval '7 days')::int as n
                from (select v_ws - make_interval(weeks => k) as ws from generate_series(0, 7) k) g) w
    ), '[]'::jsonb)
  );
end $$;
revoke execute on function public.weekly_spin_insights(uuid) from public, anon;
grant execute on function public.weekly_spin_insights(uuid) to authenticated;

-- Monthly report: same block for the month and the comparison window.
CREATE OR REPLACE FUNCTION public._build_monthly_report(p_business_id uuid, p_month date)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  m_from timestamptz := date_trunc('month', p_month::timestamp) at time zone 'UTC';
  m_to   timestamptz := (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone 'UTC';
  p_from timestamptz := (date_trunc('month', p_month::timestamp) - interval '1 month') at time zone 'UTC';
  biz record; eff_to timestamptz; prev_to timestamptz;
begin
  select id, name, slug, layout_preset, brand_colors, logo_url, app_icon_url, hero_image_url, weekly_spin_enabled
    into biz from businesses where id = p_business_id;
  if biz.id is null then return null; end if;
  eff_to := least(m_to, now());
  prev_to := least(m_from, p_from + (eff_to - m_from));

  return jsonb_build_object(
    'business', jsonb_build_object('id', biz.id, 'name', biz.name, 'slug', biz.slug, 'layout', coalesce(biz.layout_preset, 'custom'),
                                   'brand_colors', biz.brand_colors, 'logo_url', biz.logo_url, 'icon_url', biz.app_icon_url,
                                   'hero_url', biz.hero_image_url),
    'month', to_char(m_from at time zone 'UTC', 'YYYY-MM'),
    'partial', now() < m_to,
    'through', eff_to,
    'current', public._report_core(p_business_id, m_from, eff_to),
    'previous', public._report_core(p_business_id, p_from, prev_to),
    -- CP-221
    'weekly_spin', jsonb_build_object(
      'enabled', coalesce(biz.weekly_spin_enabled, false),
      'current', public._weekly_spin_stats(p_business_id, m_from, eff_to),
      'previous', public._weekly_spin_stats(p_business_id, p_from, prev_to)),
    'top_members', coalesce((
      select jsonb_agg(t order by t.points desc)
      from (
        select coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(au.raw_user_meta_data->>'full_name'), ''), split_part(coalesce(pr.email, au.email, 'Guest'), '@', 1)) as name,
               sum(pl.delta)::int as points,
               count(*) filter (where pl.rule_type in ('visit', 'purchase', 'first_visit_bonus'))::int as visits
        from points_ledger pl
        join business_memberships m on m.id = pl.membership_id
        left join profiles pr on pr.id = m.user_id
        left join auth.users au on au.id = m.user_id
        where pl.business_id = p_business_id and pl.created_at >= m_from and pl.created_at < eff_to and pl.delta > 0
        group by 1 order by 2 desc limit 5
      ) t
    ), '[]'::jsonb),
    'top_treatments', coalesce((
      select jsonb_agg(t order by t.n desc)
      from (
        select treatment_name as name, count(*)::int as n
        from medspa_treatment_log
        where business_id = p_business_id and performed_at >= m_from and performed_at < eff_to
        group by 1 order by 2 desc limit 5
      ) t
    ), '[]'::jsonb)
  );
end;
$function$;

-- ── Who gets the monthly report ───────────────────────────────────────────
-- businesses.report_recipients: when set (non-empty), the report goes to
-- exactly these addresses; when empty/NULL it goes to every manager login.
alter table public.businesses add column if not exists report_recipients text[];

CREATE OR REPLACE FUNCTION public._report_recipients(p_business_id uuid)
 RETURNS TABLE(email text, name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with b as (select report_recipients as list from businesses where id = p_business_id)
  select distinct lower(btrim(e))::text, coalesce((
           select coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(au.raw_user_meta_data->>'full_name'), ''), '')
             from auth.users au left join profiles pr on pr.id = au.id
            where lower(au.email) = lower(btrim(e)) limit 1), '')::text
    from b, unnest(b.list) e
   where coalesce(cardinality(b.list), 0) > 0 and btrim(e) <> ''
  union
  select distinct au.email::text,
         coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(au.raw_user_meta_data->>'full_name'), ''), '')::text
    from b, business_users bu
    join auth.users au on au.id = bu.user_id
    left join profiles pr on pr.id = bu.user_id
   where coalesce(cardinality(b.list), 0) = 0
     and bu.business_id = p_business_id and bu.role = 'business_manager' and au.email is not null
     and au.email not like '%@frontdesk.atlas.local';
$function$;

create or replace function public.get_report_recipients(p_business_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if public.current_app_role(p_business_id) not in ('agency_admin', 'business_manager') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'custom', (select report_recipients from public.businesses where id = p_business_id),
    'effective', coalesce((select jsonb_agg(jsonb_build_object('email', r.email, 'name', r.name) order by r.email)
                             from public._report_recipients(p_business_id) r), '[]'::jsonb),
    'managers', coalesce((select jsonb_agg(distinct au.email::text)
                            from public.business_users bu join auth.users au on au.id = bu.user_id
                           where bu.business_id = p_business_id and bu.role = 'business_manager'
                             and au.email not like '%@frontdesk.atlas.local'), '[]'::jsonb),
    'me', (select email from auth.users where id = auth.uid()));
end $$;

create or replace function public.set_report_recipients(p_business_id uuid, p_emails text[])
returns text[] language plpgsql security definer set search_path to 'public' as $$
declare v text[];
begin
  if public.current_app_role(p_business_id) not in ('agency_admin', 'business_manager') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select array_agg(distinct lower(btrim(e))) into v from unnest(coalesce(p_emails, '{}')) e
   where btrim(e) ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  if coalesce(cardinality(v), 0) > 20 then raise exception 'at most 20 report emails'; end if;
  update public.businesses set report_recipients = nullif(v, '{}') where id = p_business_id;
  return v;
end $$;
revoke execute on function public.get_report_recipients(uuid) from public, anon;
revoke execute on function public.set_report_recipients(uuid, text[]) from public, anon;
grant execute on function public.get_report_recipients(uuid) to authenticated;
grant execute on function public.set_report_recipients(uuid, text[]) to authenticated;
