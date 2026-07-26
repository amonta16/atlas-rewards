-- =====================================================================
-- CP-85 — RAFFLE GIVEAWAY (a new offer type inside Custom Offers)
-- =====================================================================
-- Self-contained. Idempotent. Paste into the Supabase SQL editor and Run.
--
-- What this ships:
--   1) raffles / raffle_entries / raffle_audit tables + RLS
--   2) points_ledger rule types: raffle_entry / raffle_refund
--   3) RPCs:
--        upsert_raffle            — staff create/edit (validated, audited)
--        list_active_raffles      — customer card feed (computed state,
--                                   totals, my entries, winner display name)
--        enter_raffle             — ATOMIC points deduction + entry, with
--                                   client idempotency key (no double charge
--                                   on rapid taps / retries / refreshes)
--        finalize_raffle          — backend winner draw. Secure random
--                                   (pgcrypto gen_random_bytes), once-only
--                                   under a row lock. Writes in-app
--                                   notifications for winner + staff.
--        finalize_due_raffles     — sweep all due raffles (cron + API route)
--        cancel_raffle            — cancels + AUTO-REFUNDS every entry
--                                   (Andrew's call, Jul 2026), audited
--        redraw_raffle            — manager-only, reason required, logged
--        set_raffle_claim_status  — staff mark Not Claimed / Claimed / Expired
--        raffle_admin_detail      — staff header stats
--        raffle_participants      — staff participant list w/ entry counts
--   4) Realtime publication for raffles (card flips state live)
--   5) Optional pg_cron backstop sweep (guarded — safe if cron is absent)
--
-- Winner selection notes (the "secure on the backend" requirements):
--   • Draw happens in finalize_raffle (SECURITY DEFINER, server-side).
--   • Randomness = ORDER BY encode(gen_random_bytes(8),'hex') — pgcrypto's
--     CSPRNG, one fresh value per entry row, uniform over entries.
--   • Once-only: the raffle row is locked FOR UPDATE and the status guard
--     (status='active') means a second concurrent call no-ops. enter_raffle
--     takes the SAME lock, so an entry can never slip in mid-draw.
--   • The result is permanent: winner_entry_id / winner_membership_id /
--     drawn_at are only ever written by finalize_raffle (or the logged
--     redraw_raffle path).
-- =====================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1) TABLES
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.raffles (
  id                       uuid primary key default uuid_generate_v4(),
  business_id              uuid not null references public.businesses(id) on delete cascade,
  title                    text not null,
  description              text,
  image_url                text,
  prize                    text not null,
  -- 0 = Free Entry
  entry_cost_points        int  not null default 0 check (entry_cost_points >= 0),
  starts_at                timestamptz not null default now(),
  ends_at                  timestamptz not null,
  -- IANA zone the OWNER picked. Storage is UTC (timestamptz); this is the
  -- zone the manager UI displays/edits times in.
  timezone                 text not null default 'America/Los_Angeles',
  max_entries_per_customer int  not null default 1 check (max_entries_per_customer >= 1),
  total_entry_limit        int  check (total_entry_limit is null or total_entry_limit >= 1),
  terms                    text,
  -- 'first_last_initial' → "Khaled M."   'full_name' → full legal name
  winner_display           text not null default 'first_last_initial'
                           check (winner_display in ('first_last_initial','full_name')),
  claim_deadline_days      int  check (claim_deadline_days is null or claim_deadline_days >= 1),
  -- Lifecycle status. Scheduled/Open/Ended are DERIVED from the clock while
  -- status='active' (see raffle_state below) so transitions are automatic.
  status                   text not null default 'active'
                           check (status in ('active','winner_selected','ended_no_entries','cancelled')),
  winner_entry_id          uuid,
  winner_membership_id     uuid references public.business_memberships(id) on delete set null,
  drawn_at                 timestamptz,
  prize_claim_status       text not null default 'not_claimed'
                           check (prize_claim_status in ('not_claimed','claimed','expired')),
  created_by               uuid references auth.users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists raffles_business_idx on public.raffles(business_id, status, ends_at);

create table if not exists public.raffle_entries (
  id             uuid primary key default uuid_generate_v4(),
  raffle_id      uuid not null references public.raffles(id) on delete cascade,
  business_id    uuid not null references public.businesses(id) on delete cascade,
  membership_id  uuid not null references public.business_memberships(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  -- Client-generated idempotency key: a retried/duplicated submit of the
  -- SAME attempt hits the unique index and returns the existing entry
  -- instead of charging twice.
  entry_key      text not null unique,
  points_spent   int  not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists raffle_entries_raffle_idx     on public.raffle_entries(raffle_id, created_at);
create index if not exists raffle_entries_membership_idx on public.raffle_entries(raffle_id, membership_id);

-- FK for the winner pointer (added after raffle_entries exists).
do $$ begin
  alter table public.raffles
    add constraint raffles_winner_entry_fk
    foreign key (winner_entry_id) references public.raffle_entries(id) on delete set null;
exception when duplicate_object then null;
end $$;

-- Audit log: entries, deductions, draws, cancellations, refunds, claims.
create table if not exists public.raffle_audit (
  id          uuid primary key default uuid_generate_v4(),
  raffle_id   uuid not null references public.raffles(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor       uuid,                -- auth.uid() or NULL for system/cron
  action      text not null,      -- created/updated/entered/finalized/no_entries/redraw/cancelled/refunded/claim_status
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists raffle_audit_raffle_idx on public.raffle_audit(raffle_id, created_at desc);

-- updated_at trigger (same helper the other tables use)
drop trigger if exists trg_updated_at on public.raffles;
create trigger trg_updated_at before update on public.raffles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 2) RLS
-- ─────────────────────────────────────────────────────────────────────

alter table public.raffles       enable row level security;
alter table public.raffle_entries enable row level security;
alter table public.raffle_audit   enable row level security;

do $$ begin
  begin drop policy "raffles_public_read"  on public.raffles;        exception when undefined_object then null; end;
  begin drop policy "raffles_staff_write"  on public.raffles;        exception when undefined_object then null; end;
  begin drop policy "raffle_entries_read"  on public.raffle_entries; exception when undefined_object then null; end;
  begin drop policy "raffle_audit_staff"   on public.raffle_audit;   exception when undefined_object then null; end;
end $$;

-- Customers see every non-cancelled raffle (scheduled ones show a
-- "starts in…" card); staff additionally see cancelled ones.
create policy "raffles_public_read" on public.raffles
  for select to anon, authenticated
  using (status <> 'cancelled' or public.staffs_business(business_id));

create policy "raffles_staff_write" on public.raffles
  for all to authenticated
  using      (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

-- Entries: a customer reads their own; staff read all for their business.
-- There is NO insert policy — entries are only created via enter_raffle
-- (SECURITY DEFINER), which is what makes the charge+entry atomic.
create policy "raffle_entries_read" on public.raffle_entries
  for select to authenticated
  using (user_id = auth.uid() or public.staffs_business(business_id));

create policy "raffle_audit_staff" on public.raffle_audit
  for select to authenticated
  using (public.staffs_business(business_id));

-- ─────────────────────────────────────────────────────────────────────
-- 3) points_ledger rule types
-- ─────────────────────────────────────────────────────────────────────
-- The original CP-01 check constraint doesn't know raffle types (and later
-- checkpoints added values like 'mystery_bonus'). Rebuild it NOT VALID so
-- existing rows — whatever rule types they already carry — are untouched,
-- while new rows get validated against the full list.
alter table public.points_ledger drop constraint if exists points_ledger_rule_type_check;
alter table public.points_ledger add constraint points_ledger_rule_type_check
  check (rule_type in (
    'review','referral_referrer','referral_referee','birthday','visit',
    'purchase','social_follow','profile_complete','first_visit_bonus',
    'milestone','reactivation','redemption','manual_adjust','reversal',
    'mystery_bonus','streak_bonus','checkin',
    'raffle_entry','raffle_refund'
  )) not valid;

-- ─────────────────────────────────────────────────────────────────────
-- Helper: format a winner's public display name
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.raffle_winner_display_name(p_raffle_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when r.winner_membership_id is null then null
    when r.winner_display = 'full_name' then coalesce(nullif(trim(p.full_name), ''), 'A lucky member')
    else
      case
        when nullif(trim(p.full_name), '') is null then 'A lucky member'
        else
          split_part(trim(p.full_name), ' ', 1) ||
          case
            when array_length(regexp_split_to_array(trim(p.full_name), '\s+'), 1) > 1
            then ' ' || upper(left((regexp_split_to_array(trim(p.full_name), '\s+'))[array_length(regexp_split_to_array(trim(p.full_name), '\s+'), 1)], 1)) || '.'
            else ''
          end
      end
  end
  from public.raffles r
  left join public.business_memberships m on m.id = r.winner_membership_id
  left join public.profiles p on p.id = m.user_id
  where r.id = p_raffle_id;
$$;
grant execute on function public.raffle_winner_display_name(uuid) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 4) upsert_raffle — staff create/edit
-- ─────────────────────────────────────────────────────────────────────
drop function if exists public.upsert_raffle(uuid, uuid, text, text, text, text, int, timestamptz, timestamptz, text, int, int, text, text, int);

create or replace function public.upsert_raffle(
  p_id                        uuid,
  p_business_id               uuid,
  p_title                     text,
  p_description               text default null,
  p_image_url                 text default null,
  p_prize                     text default '',
  p_entry_cost_points         int  default 0,
  p_starts_at                 timestamptz default now(),
  p_ends_at                   timestamptz default null,
  p_timezone                  text default 'America/Los_Angeles',
  p_max_entries_per_customer  int  default 1,
  p_total_entry_limit         int  default null,
  p_terms                     text default null,
  p_winner_display            text default 'first_last_initial',
  p_claim_deadline_days       int  default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_status text;
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;
  if p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'end time must be after start time';
  end if;
  if coalesce(p_title, '') = '' or coalesce(p_prize, '') = '' then
    raise exception 'title and prize are required';
  end if;

  if p_id is null then
    insert into public.raffles
      (business_id, title, description, image_url, prize, entry_cost_points,
       starts_at, ends_at, timezone, max_entries_per_customer, total_entry_limit,
       terms, winner_display, claim_deadline_days, created_by)
    values
      (p_business_id, p_title, p_description, p_image_url, p_prize, p_entry_cost_points,
       p_starts_at, p_ends_at, p_timezone, p_max_entries_per_customer, p_total_entry_limit,
       p_terms, p_winner_display, p_claim_deadline_days, auth.uid())
    returning id into v_id;

    insert into public.raffle_audit (raffle_id, business_id, actor, action, detail)
    values (v_id, p_business_id, auth.uid(), 'created',
            jsonb_build_object('title', p_title, 'entry_cost', p_entry_cost_points,
                               'ends_at', p_ends_at, 'timezone', p_timezone));
  else
    select status into v_status from public.raffles
     where id = p_id and business_id = p_business_id
     for update;
    if v_status is null then
      raise exception 'raffle not found';
    end if;
    -- Once the draw happened (or it was cancelled) the config is frozen —
    -- edits can't move an end time backwards past a completed draw.
    if v_status <> 'active' then
      raise exception 'this raffle is % — it can no longer be edited', v_status;
    end if;

    update public.raffles set
      title                    = p_title,
      description              = p_description,
      image_url                = p_image_url,
      prize                    = p_prize,
      entry_cost_points        = p_entry_cost_points,
      starts_at                = p_starts_at,
      ends_at                  = p_ends_at,
      timezone                 = p_timezone,
      max_entries_per_customer = p_max_entries_per_customer,
      total_entry_limit        = p_total_entry_limit,
      terms                    = p_terms,
      winner_display           = p_winner_display,
      claim_deadline_days      = p_claim_deadline_days,
      updated_at               = now()
    where id = p_id and business_id = p_business_id
    returning id into v_id;

    insert into public.raffle_audit (raffle_id, business_id, actor, action, detail)
    values (v_id, p_business_id, auth.uid(), 'updated',
            jsonb_build_object('title', p_title, 'ends_at', p_ends_at, 'timezone', p_timezone));
  end if;

  return v_id;
end; $$;

grant execute on function public.upsert_raffle(uuid, uuid, text, text, text, text, int, timestamptz, timestamptz, text, int, int, text, text, int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 5) list_active_raffles — the customer card feed
-- ─────────────────────────────────────────────────────────────────────
-- Computed `state`: scheduled | open | ended | winner_selected | cancelled.
-- "ended" covers both awaiting-draw and ended-with-no-entries.
-- Winner-selected raffles stay in the feed for 14 days so non-winners see
-- the result screen; no-entry endings drop out after 2 days.
drop function if exists public.list_active_raffles(uuid);

create or replace function public.list_active_raffles(p_business_id uuid)
returns table (
  id                        uuid,
  title                     text,
  description               text,
  image_url                 text,
  prize                     text,
  entry_cost_points         int,
  starts_at                 timestamptz,
  ends_at                   timestamptz,
  timezone                  text,
  max_entries_per_customer  int,
  total_entry_limit         int,
  terms                     text,
  claim_deadline_days       int,
  state                     text,
  total_entries             int,
  drawn_at                  timestamptz,
  winner_display_name       text,
  i_won                     boolean,
  my_entry_count            int
)
language sql stable security definer set search_path = public as $$
  select
    r.id, r.title, r.description, r.image_url, r.prize, r.entry_cost_points,
    r.starts_at, r.ends_at, r.timezone, r.max_entries_per_customer,
    r.total_entry_limit, r.terms, r.claim_deadline_days,
    case
      when r.status = 'cancelled'        then 'cancelled'
      when r.status = 'winner_selected'  then 'winner_selected'
      when r.status = 'ended_no_entries' then 'ended'
      when now() < r.starts_at           then 'scheduled'
      when now() < r.ends_at             then 'open'
      else 'ended'
    end as state,
    (select count(*)::int from public.raffle_entries e where e.raffle_id = r.id) as total_entries,
    r.drawn_at,
    public.raffle_winner_display_name(r.id) as winner_display_name,
    (r.winner_membership_id is not null and exists (
       select 1 from public.business_memberships m
        where m.id = r.winner_membership_id and m.user_id = auth.uid()
    )) as i_won,
    coalesce((
      select count(*)::int from public.raffle_entries e
        join public.business_memberships m on m.id = e.membership_id
       where e.raffle_id = r.id and m.user_id = auth.uid()
    ), 0) as my_entry_count
  from public.raffles r
  where r.business_id = p_business_id
    and r.status <> 'cancelled'
    and (
      r.status = 'active'
      or (r.status = 'winner_selected'  and r.drawn_at > now() - interval '14 days')
      or (r.status = 'ended_no_entries' and r.ends_at  > now() - interval '2 days')
    )
  order by
    case when r.status = 'active' and now() >= r.starts_at and now() < r.ends_at then 0
         when r.status = 'active' and now() <  r.starts_at then 1
         else 2 end,
    r.ends_at asc;
$$;

grant execute on function public.list_active_raffles(uuid) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 6) enter_raffle — atomic charge + entry
-- ─────────────────────────────────────────────────────────────────────
drop function if exists public.enter_raffle(uuid, text);

create or replace function public.enter_raffle(
  p_raffle_id uuid,
  p_entry_key text
)
returns table (entry_id uuid, my_entry_count int, total_entries int, new_balance int)
language plpgsql security definer set search_path = public as $$
declare
  v_r             public.raffles%rowtype;
  v_membership_id uuid;
  v_balance       int;
  v_mine          int;
  v_total         int;
  v_entry_id      uuid;
  v_existing      public.raffle_entries%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if coalesce(p_entry_key, '') = '' then
    raise exception 'missing entry key';
  end if;

  -- Idempotency FIRST: a retry of the same attempt (double tap, flaky
  -- connection, page refresh mid-submit) returns the already-recorded
  -- entry — award_points was already applied inside the original call.
  select * into v_existing from public.raffle_entries where entry_key = p_entry_key;
  if v_existing.id is not null then
    select points_balance into v_balance from public.business_memberships where id = v_existing.membership_id;
    select count(*)::int into v_mine from public.raffle_entries
     where raffle_id = v_existing.raffle_id and membership_id = v_existing.membership_id;
    select count(*)::int into v_total from public.raffle_entries where raffle_id = v_existing.raffle_id;
    return query select v_existing.id, v_mine, v_total, v_balance;
    return;
  end if;

  -- Lock the raffle row: serializes the total-entry-limit check AND
  -- guarantees no entry lands while finalize_raffle is mid-draw (it takes
  -- the same lock).
  select * into v_r from public.raffles where id = p_raffle_id for update;
  if v_r.id is null then
    raise exception 'raffle not found';
  end if;
  if v_r.status = 'cancelled' then
    raise exception 'this raffle was cancelled';
  end if;
  if v_r.status <> 'active' or now() >= v_r.ends_at then
    raise exception 'this raffle has ended';
  end if;
  if now() < v_r.starts_at then
    raise exception 'this raffle has not started yet';
  end if;

  select id, points_balance into v_membership_id, v_balance
    from public.business_memberships
   where business_id = v_r.business_id and user_id = auth.uid();
  if v_membership_id is null then
    raise exception 'join the rewards program first to enter';
  end if;

  select count(*)::int into v_mine from public.raffle_entries
   where raffle_id = p_raffle_id and membership_id = v_membership_id;
  if v_mine >= v_r.max_entries_per_customer then
    raise exception 'entry limit reached (max % per member)', v_r.max_entries_per_customer;
  end if;

  select count(*)::int into v_total from public.raffle_entries where raffle_id = p_raffle_id;
  if v_r.total_entry_limit is not null and v_total >= v_r.total_entry_limit then
    raise exception 'this raffle is full';
  end if;

  -- Charge first (award_points re-checks balance under its own row lock
  -- and raises 'insufficient points' cleanly), then record the entry —
  -- one transaction, so a failure at either step rolls back both.
  if v_r.entry_cost_points > 0 then
    perform public.award_points(
      v_membership_id,
      -v_r.entry_cost_points,
      'raffle_entry',
      p_raffle_id,
      'raffle_entry_' || p_entry_key,
      'Raffle entry: ' || v_r.title
    );
    select points_balance into v_balance from public.business_memberships where id = v_membership_id;
  end if;

  insert into public.raffle_entries
    (raffle_id, business_id, membership_id, user_id, entry_key, points_spent)
  values
    (p_raffle_id, v_r.business_id, v_membership_id, auth.uid(), p_entry_key, v_r.entry_cost_points)
  returning id into v_entry_id;

  insert into public.raffle_audit (raffle_id, business_id, actor, action, detail)
  values (p_raffle_id, v_r.business_id, auth.uid(), 'entered',
          jsonb_build_object('entry_id', v_entry_id, 'points_spent', v_r.entry_cost_points));

  return query select v_entry_id, v_mine + 1, v_total + 1, v_balance;
end; $$;

grant execute on function public.enter_raffle(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 7) finalize_raffle — the draw (backend, secure, once-only)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.finalize_raffle(p_raffle_id uuid)
returns table (raffle_id uuid, out_state text, winner_user_id uuid, winner_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_r        public.raffles%rowtype;
  v_entry    public.raffle_entries%rowtype;
  v_winner_uid uuid;
  v_name     text;
  v_staff    uuid;
begin
  select * into v_r from public.raffles where id = p_raffle_id for update;
  if v_r.id is null then return; end if;

  -- Once-only guard: anything but an active raffle past its end is a no-op.
  if v_r.status <> 'active' or now() < v_r.ends_at then return; end if;

  -- Pick one valid entry, uniformly, with pgcrypto's CSPRNG.
  select * into v_entry
    from public.raffle_entries e
   where e.raffle_id = p_raffle_id
   order by encode(gen_random_bytes(8), 'hex')
   limit 1;

  if v_entry.id is null then
    update public.raffles
       set status = 'ended_no_entries', drawn_at = now()
     where id = p_raffle_id;

    insert into public.raffle_audit (raffle_id, business_id, actor, action, detail)
    values (p_raffle_id, v_r.business_id, auth.uid(), 'no_entries',
            jsonb_build_object('ended_at', v_r.ends_at));

    -- Tell the owner/front-desk team.
    for v_staff in
      select distinct user_id from public.business_users
       where business_id = v_r.business_id or (business_id is null and role = 'agency_admin')
    loop
      insert into public.notifications (user_id, business_id, kind, title, body, link_path)
      values (v_staff, v_r.business_id, 'raffle_ended',
              'Raffle ended — no entries',
              '"' || v_r.title || '" ended with no eligible entries. No winner was drawn.',
              '/manage');
    end loop;

    return query select p_raffle_id, 'ended_no_entries'::text, null::uuid, null::text;
    return;
  end if;

  update public.raffles
     set status               = 'winner_selected',
         winner_entry_id      = v_entry.id,
         winner_membership_id = v_entry.membership_id,
         drawn_at             = now(),
         prize_claim_status   = 'not_claimed'
   where id = p_raffle_id;

  v_winner_uid := v_entry.user_id;
  v_name := public.raffle_winner_display_name(p_raffle_id);

  insert into public.raffle_audit (raffle_id, business_id, actor, action, detail)
  values (p_raffle_id, v_r.business_id, auth.uid(), 'finalized',
          jsonb_build_object('winner_entry_id', v_entry.id,
                             'winner_membership_id', v_entry.membership_id,
                             'drawn_at', now(),
                             'total_entries', (select count(*) from public.raffle_entries where public.raffle_entries.raffle_id = p_raffle_id)));

  -- In-app: the winner…
  insert into public.notifications (user_id, business_id, kind, title, body, link_path)
  values (v_winner_uid, v_r.business_id, 'raffle_won',
          '🎉 You won the giveaway!',
          'You won "' || v_r.title || '" — ' || v_r.prize || '. Open the Rewards tab to see how to claim it.',
          '/app/rewards');

  -- …and the owner/front-desk team.
  for v_staff in
    select distinct user_id from public.business_users
     where business_id = v_r.business_id or (business_id is null and role = 'agency_admin')
  loop
    insert into public.notifications (user_id, business_id, kind, title, body, link_path)
    values (v_staff, v_r.business_id, 'raffle_winner_drawn',
            'Raffle winner selected 🎟️',
            'Winner drawn for "' || v_r.title || '": ' || coalesce(v_name, 'a member') || '. Prize: ' || v_r.prize || '.',
            '/manage');
  end loop;

  return query select p_raffle_id, 'winner_selected'::text, v_winner_uid, v_name;
end; $$;

grant execute on function public.finalize_raffle(uuid) to authenticated, service_role;

-- Sweep every due raffle. Returns what it finalized so the API route can
-- fire push notifications for exactly the draws IT performed (no doubles).
create or replace function public.finalize_due_raffles()
returns table (raffle_id uuid, business_id uuid, title text, prize text, out_state text, winner_user_id uuid, winner_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_row record;
  v_res record;
begin
  for v_row in
    select r.id, r.business_id, r.title, r.prize from public.raffles r
     where r.status = 'active' and now() >= r.ends_at
  loop
    for v_res in select * from public.finalize_raffle(v_row.id) loop
      return query select v_row.id, v_row.business_id, v_row.title, v_row.prize,
                          v_res.out_state, v_res.winner_user_id, v_res.winner_name;
    end loop;
  end loop;
end; $$;

grant execute on function public.finalize_due_raffles() to service_role;

-- ─────────────────────────────────────────────────────────────────────
-- 8) cancel_raffle — auto-refund every entry (Andrew's call, Jul 2026)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.cancel_raffle(
  p_raffle_id   uuid,
  p_business_id uuid
)
returns table (refunded_entries int, refunded_points bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_r       public.raffles%rowtype;
  v_e       record;
  v_count   int := 0;
  v_points  bigint := 0;
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;

  select * into v_r from public.raffles
   where id = p_raffle_id and business_id = p_business_id
   for update;
  if v_r.id is null then raise exception 'raffle not found'; end if;
  if v_r.status <> 'active' then
    raise exception 'only an active raffle can be cancelled (this one is %)', v_r.status;
  end if;

  update public.raffles set status = 'cancelled', updated_at = now()
   where id = p_raffle_id;

  -- Refund every paid entry. award_points' idempotency key makes this safe
  -- even if the function were somehow re-run mid-flight.
  for v_e in
    select id, membership_id, user_id, points_spent
      from public.raffle_entries where raffle_entries.raffle_id = p_raffle_id
  loop
    if v_e.points_spent > 0 then
      perform public.award_points(
        v_e.membership_id, v_e.points_spent, 'raffle_refund',
        p_raffle_id, 'raffle_refund_' || v_e.id,
        'Raffle cancelled — entry refunded: ' || v_r.title
      );
      v_points := v_points + v_e.points_spent;
    end if;
    v_count := v_count + 1;
  end loop;

  -- Tell entrants their points came back.
  for v_e in
    select distinct user_id from public.raffle_entries where raffle_entries.raffle_id = p_raffle_id
  loop
    insert into public.notifications (user_id, business_id, kind, title, body, link_path)
    values (v_e.user_id, p_business_id, 'raffle_cancelled',
            'Giveaway cancelled',
            '"' || v_r.title || '" was cancelled.' ||
            case when v_r.entry_cost_points > 0 then ' Your entry points have been refunded.' else '' end,
            '/app/rewards');
  end loop;

  insert into public.raffle_audit (raffle_id, business_id, actor, action, detail)
  values (p_raffle_id, p_business_id, auth.uid(), 'cancelled',
          jsonb_build_object('refunded_entries', v_count, 'refunded_points', v_points));

  return query select v_count, v_points;
end; $$;

grant execute on function public.cancel_raffle(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 9) redraw_raffle — manager-only, reason required, fully logged
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.redraw_raffle(
  p_raffle_id   uuid,
  p_business_id uuid,
  p_reason      text
)
returns table (winner_user_id uuid, winner_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_r      public.raffles%rowtype;
  v_entry  public.raffle_entries%rowtype;
  v_prev_membership uuid;
  v_name   text;
begin
  if not public.is_business_manager(p_business_id) then
    raise exception 'permission denied: manager or admin required for a redraw';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required for an administrative redraw';
  end if;

  select * into v_r from public.raffles
   where id = p_raffle_id and business_id = p_business_id
   for update;
  if v_r.id is null then raise exception 'raffle not found'; end if;
  if v_r.status <> 'winner_selected' then
    raise exception 'redraw is only available after a winner was selected';
  end if;
  if v_r.prize_claim_status = 'claimed' then
    raise exception 'prize already claimed — redraw not allowed';
  end if;

  v_prev_membership := v_r.winner_membership_id;

  -- New draw over all entries EXCLUDING the previous winner's.
  select * into v_entry
    from public.raffle_entries e
   where e.raffle_id = p_raffle_id
     and e.membership_id is distinct from v_prev_membership
   order by encode(gen_random_bytes(8), 'hex')
   limit 1;

  if v_entry.id is null then
    raise exception 'no other eligible entries to redraw from';
  end if;

  update public.raffles
     set winner_entry_id      = v_entry.id,
         winner_membership_id = v_entry.membership_id,
         drawn_at             = now(),
         prize_claim_status   = 'not_claimed',
         updated_at           = now()
   where id = p_raffle_id;

  v_name := public.raffle_winner_display_name(p_raffle_id);

  insert into public.raffle_audit (raffle_id, business_id, actor, action, detail)
  values (p_raffle_id, p_business_id, auth.uid(), 'redraw',
          jsonb_build_object('reason', trim(p_reason),
                             'previous_winner_membership_id', v_prev_membership,
                             'new_winner_entry_id', v_entry.id,
                             'new_winner_membership_id', v_entry.membership_id));

  insert into public.notifications (user_id, business_id, kind, title, body, link_path)
  values (v_entry.user_id, p_business_id, 'raffle_won',
          '🎉 You won the giveaway!',
          'You won "' || v_r.title || '" — ' || v_r.prize || '. Open the Rewards tab to see how to claim it.',
          '/app/rewards');

  return query select v_entry.user_id, v_name;
end; $$;

grant execute on function public.redraw_raffle(uuid, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 10) claim status + staff detail RPCs
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.set_raffle_claim_status(
  p_raffle_id   uuid,
  p_business_id uuid,
  p_status      text
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then
    raise exception 'permission denied';
  end if;
  if p_status not in ('not_claimed','claimed','expired') then
    raise exception 'invalid claim status';
  end if;

  update public.raffles
     set prize_claim_status = p_status, updated_at = now()
   where id = p_raffle_id and business_id = p_business_id
     and status = 'winner_selected';
  if not found then
    raise exception 'raffle not found or no winner selected yet';
  end if;

  insert into public.raffle_audit (raffle_id, business_id, actor, action, detail)
  values (p_raffle_id, p_business_id, auth.uid(), 'claim_status',
          jsonb_build_object('status', p_status));
end; $$;

grant execute on function public.set_raffle_claim_status(uuid, uuid, text) to authenticated;

-- Staff list (feeds the raffle rows inside the Offers manager) — includes
-- cancelled + fully-ended raffles, unlike the customer feed.
drop function if exists public.list_raffles_for_business(uuid);

create or replace function public.list_raffles_for_business(p_business_id uuid)
returns table (
  id uuid, title text, description text, image_url text, prize text,
  entry_cost_points int, starts_at timestamptz, ends_at timestamptz,
  timezone text, max_entries_per_customer int, total_entry_limit int,
  terms text, winner_display text, claim_deadline_days int,
  status text, state text, prize_claim_status text, drawn_at timestamptz,
  total_entries int, unique_participants int, winner_display_name text
)
language sql stable security definer set search_path = public as $$
  select
    r.id, r.title, r.description, r.image_url, r.prize,
    r.entry_cost_points, r.starts_at, r.ends_at,
    r.timezone, r.max_entries_per_customer, r.total_entry_limit,
    r.terms, r.winner_display, r.claim_deadline_days,
    r.status,
    case
      when r.status = 'cancelled'        then 'cancelled'
      when r.status = 'winner_selected'  then 'winner_selected'
      when r.status = 'ended_no_entries' then 'ended'
      when now() < r.starts_at           then 'scheduled'
      when now() < r.ends_at             then 'open'
      else 'ended'
    end as state,
    r.prize_claim_status, r.drawn_at,
    (select count(*)::int from public.raffle_entries e where e.raffle_id = r.id),
    (select count(distinct e.membership_id)::int from public.raffle_entries e where e.raffle_id = r.id),
    public.raffle_winner_display_name(r.id)
  from public.raffles r
  where r.business_id = p_business_id
    and public.staffs_business(p_business_id)
  order by r.created_at desc;
$$;

grant execute on function public.list_raffles_for_business(uuid) to authenticated;

-- Participant list for the staff detail view (search happens client-side).
drop function if exists public.raffle_participants(uuid, uuid);

create or replace function public.raffle_participants(
  p_raffle_id   uuid,
  p_business_id uuid
)
returns table (
  membership_id   uuid,
  full_name       text,
  entry_count     int,
  points_spent    bigint,
  first_entry_at  timestamptz,
  last_entry_at   timestamptz,
  is_winner       boolean
)
language sql stable security definer set search_path = public as $$
  select
    e.membership_id,
    coalesce(nullif(trim(p.full_name), ''), 'Member') as full_name,
    count(*)::int as entry_count,
    sum(e.points_spent)::bigint as points_spent,
    min(e.created_at) as first_entry_at,
    max(e.created_at) as last_entry_at,
    bool_or(e.membership_id = r.winner_membership_id) as is_winner
  from public.raffle_entries e
  join public.raffles r on r.id = e.raffle_id
  join public.business_memberships m on m.id = e.membership_id
  left join public.profiles p on p.id = m.user_id
  where e.raffle_id = p_raffle_id
    and r.business_id = p_business_id
    and public.staffs_business(p_business_id)
  group by e.membership_id, p.full_name, r.winner_membership_id
  order by count(*) desc, min(e.created_at) asc;
$$;

grant execute on function public.raffle_participants(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 11) Realtime — customer cards flip state (open→ended→winner) live
-- ─────────────────────────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table public.raffles;
exception when duplicate_object then null;
          when undefined_object then null;
end $$;

commit;

-- ─────────────────────────────────────────────────────────────────────
-- 12) OPTIONAL — pg_cron backstop sweep (outside the transaction)
-- ─────────────────────────────────────────────────────────────────────
-- The app already sweeps lazily: the customer Rewards tab and the staff
-- raffle panel each POST /api/raffles/sweep on load, which draws any due
-- raffle and sends the pushes. This cron is the backstop for raffles that
-- end while nobody has the app open — winner still gets drawn on time and
-- the in-app notifications land. Safe to skip if pg_cron isn't enabled.
do $$ begin
  perform cron.unschedule('finalize-due-raffles');
exception when others then null;
end $$;
do $$ begin
  perform cron.schedule(
    'finalize-due-raffles',
    '*/5 * * * *',
    $cron$ select public.finalize_due_raffles(); $cron$
  );
exception when others then
  raise notice 'pg_cron unavailable — backstop sweep not scheduled (%). The lazy /api/raffles/sweep path still draws winners.', sqlerrm;
end $$;

-- Refresh PostgREST so the new RPCs are callable immediately.
notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
-- Verification:
--   select proname from pg_proc where proname like '%raffle%';
--   select * from cron.job where jobname = 'finalize-due-raffles';
--   -- constraint accepts raffle types:
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'points_ledger_rule_type_check';
-- ─────────────────────────────────────────────────────────────────────
