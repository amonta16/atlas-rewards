-- CP-221 · part 2 — weekly-spin notifications, inside business hours
--
-- Kept light (Andrew, Oct 27): only while the member hasn't spun this week —
--   1. unlock     — once a week, first open day, 1 h after opening
--   2. reminder   — at most ONCE EVERY 2 WEEKS per member: Thursday or later,
--                   ~4 pm (clamped inside opening hours), ≥48 h after the
--                   unlock, and no reminder to them in the last 13 days
-- No "resets" / last-call message.
-- Hours come from businesses.booking_hours.week (ISO weekday → [open, close]);
-- a day the business is closed is skipped; no hours on file → 10:00–20:00.
-- Nothing is sent in the last 30 minutes before close.
-- Guardrails: one weekly-spin message per member per 20 h; the shared
-- 2-pushes / 20 h budget is checked first (deferred to the next hour, never
-- silently dropped); members who switched off push or "check-in available"
-- (the spin category) are skipped; demo / blocked members never.

create table if not exists public.weekly_spin_reminders (
  membership_id uuid not null references public.business_memberships(id) on delete cascade,
  week_start    date not null,
  stage         text not null check (stage in ('unlock','reminder','last_call')),
  sent_at       timestamptz not null default now(),
  primary key (membership_id, week_start, stage)
);
alter table public.weekly_spin_reminders enable row level security;   -- jobs only

-- [open, close] local times for a business on an ISO weekday; NULL = closed.
create or replace function public._business_open_window(p_hours jsonb, p_isodow int)
returns time[] language plpgsql immutable as $$
declare w jsonb;
begin
  if p_hours is null then return array['10:00'::time, '20:00'::time]; end if;
  if jsonb_typeof(p_hours->'days') = 'array' and not (p_hours->'days' @> to_jsonb(p_isodow)) then return null; end if;
  w := p_hours->'week'->(p_isodow::text);
  if jsonb_typeof(w) = 'array' and jsonb_array_length(w) >= 2 then
    return array[(w->>0)::time, (w->>1)::time];
  end if;
  if jsonb_typeof(p_hours->'week') = 'object' then return null; end if;   -- day missing from the week map = closed
  return array[coalesce((p_hours->>'start')::time, '10:00'), coalesce((p_hours->>'end')::time, '20:00')];
exception when others then
  return array['10:00'::time, '20:00'::time];
end $$;

create or replace function public.process_weekly_spin(p_dry boolean default false)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  r record; v_local timestamp; v_dow int; v_win time[]; v_now time; v_at time; v_stage text;
  v_unlock_at timestamptz; v_has_rem boolean; v_has_last boolean; v_ws timestamptz;
  v_title text; v_body text; v_id uuid; v_n int := 0;
begin
  for r in
    select m.id, m.user_id, m.business_id, btrim(b.name) as biz, b.booking_hours as hours,
           coalesce(public.business_timezone(b.id), 'America/Los_Angeles') as tz
      from public.business_memberships m
      join public.businesses b on b.id = m.business_id
     where b.weekly_spin_enabled
       and not coalesce(b.is_demo, false)
       and coalesce(b.status, 'active') = 'active'
       and not coalesce(m.is_demo, false)
       and m.status is distinct from 'blocked'
       and m.user_id is not null
  loop
    v_local := now() at time zone r.tz;
    v_dow := extract(isodow from v_local)::int;
    v_win := public._business_open_window(r.hours, v_dow);
    continue when v_win is null;                                     -- closed today
    v_now := v_local::time;
    continue when v_now < v_win[1] or v_now >= v_win[2] - interval '30 minutes';

    v_ws := public.weekly_spin_week_start(r.business_id);
    -- already spun this week → nothing to nudge
    continue when exists (select 1 from public.mystery_reward_spins s
                           where s.membership_id = r.id and s.source = 'home' and s.awarded_at >= v_ws);
    -- member opted out of push / the spin category
    continue when exists (select 1 from public.customer_notification_preferences p
                           where p.membership_id = r.id and (not p.push_enabled or not p.check_in_available));

    select max(sent_at) filter (where stage = 'unlock'), bool_or(stage = 'reminder'), bool_or(stage = 'last_call')
      into v_unlock_at, v_has_rem, v_has_last
      from public.weekly_spin_reminders where membership_id = r.id and week_start = v_ws::date;

    v_stage := null;
    if v_unlock_at is null and v_dow < 7 then
      v_stage := 'unlock'; v_at := v_win[1] + interval '1 hour';
    elsif v_dow >= 4 and v_unlock_at is not null and not coalesce(v_has_rem, false)
          and v_unlock_at <= now() - interval '48 hours'
          and not exists (select 1 from public.weekly_spin_reminders x
                           where x.membership_id = r.id and x.stage = 'reminder'
                             and x.sent_at > now() - interval '13 days') then
      v_stage := 'reminder';
      v_at := least(greatest(v_win[1] + interval '1 hour', '16:00'::time), v_win[2] - interval '1 hour');
    end if;
    continue when v_stage is null or v_now < v_at;

    -- one weekly-spin message per 20 h
    continue when exists (select 1 from public.notifications n
                           where n.user_id = r.user_id and n.business_id = r.business_id
                             and n.kind = 'weekly_spin' and n.created_at > now() - interval '20 hours');
    -- shared push budget (same rule as _notif_gate): wait for the next hour
    continue when (select count(*) from public.notifications n
                    where n.user_id = r.user_id and n.business_id = r.business_id
                      and (n.kind in ('check_in_available','reward_expiration','we_miss_you','customer_offer','automated_offer','streak','review_request','birthday','announcement','weekly_spin')
                           or (n.source = 'workflow' and n.family is distinct from 'booking'))
                      and n.push_sent_at is not null
                      and n.created_at > now() - interval '20 hours') >= 2;

    v_title := case v_stage
      when 'unlock' then '🎡 Your free weekly spin is ready'
      else               '🎁 Your free spin is waiting' end;
    v_body := case v_stage
      when 'unlock' then 'Spin the ' || r.biz || ' prize wheel from home — no visit needed. Points and prizes up for grabs.'
      else               'Take your free spin at ' || r.biz || ' — it only takes a second.' end;

    if p_dry then v_n := v_n + 1; continue; end if;

    v_id := null;
    insert into public.notifications (user_id, business_id, kind, title, body, link_path, source, family)
    values (r.user_id, r.business_id, 'weekly_spin', v_title, v_body, '/app?spin=1', 'legacy', 'weekly_spin')
    returning id into v_id;
    if v_id is not null then
      insert into public.weekly_spin_reminders (membership_id, week_start, stage)
      values (r.id, v_ws::date, v_stage) on conflict do nothing;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.process_weekly_spin(boolean) from public, anon, authenticated;
revoke execute on function public._business_open_window(jsonb, int) from public, anon;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'atlas-weekly-spin') then
    perform cron.schedule('atlas-weekly-spin', '17 * * * *', 'select public.process_weekly_spin();');
  end if;
end $$;

-- _notif_gate: weekly_spin counts toward (and is held to) the shared push
-- budget and the 90-second duplicate guard. Patched in place so nothing else
-- in the gate changes.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public._notif_gate'::regproc);
  if position('weekly_spin' in d) = 0 then
    n := replace(d, '''birthday'',''announcement'')', '''birthday'',''announcement'',''weekly_spin'')');
    n := replace(n, '''customer_offer'',''we_miss_you'') then', '''customer_offer'',''we_miss_you'',''weekly_spin'') then');
    if n = d then raise exception 'gate patch did not apply'; end if;
    execute n;
  end if;
end $$;
