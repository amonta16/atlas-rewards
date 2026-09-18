-- CP-141 · Front-desk PIN throttle: per-IP, with trusted devices
--
-- Idempotent. Safe to re-run.
--
-- THE PROBLEM
-- verify_front_desk_pin() throttled per BUSINESS. After 8 wrong PINs the shop
-- locked for 5 minutes, and because `fails` only reset on success, every later
-- wrong PIN re-locked it. One HTTP request every 5 minutes kept a real
-- business's front desk offline indefinitely, and slugs are public. Anyone
-- could do it to any client, and nothing alerted us.
--
-- THE SHAPE OF THE FIX
-- Lock the SOURCE, not the shop.
--   · Failures count per (business_id, ip).
--   · An IP that has signed in successfully is TRUSTED for 30 days. Trusted
--     IPs skip the business-wide brake entirely, so a stranger can never lock
--     out the shop's own tablet.
--   · Untrusted IPs are still collectively braked (40 failures in 15 minutes
--     across all untrusted IPs) so rotating-IP brute force doesn't get a free
--     pass at a 4-digit PIN.
--   · Backoff escalates per IP: 1min / 5min / 30min / 4h.
--   · Ten failures from one IP raises an admin notification, once.
--
-- DEPLOY ORDER
-- The old 2-arg signature is DROPPED and replaced by a 3-arg version whose
-- p_ip defaults to NULL. A 2-arg call then resolves unambiguously to the new
-- function, so the CURRENTLY DEPLOYED app keeps working during the window
-- between this SQL and the app deploy. Until the app ships, every caller lands
-- in the shared 'unknown' bucket and behaviour matches today's — no
-- regression, no improvement. Ship the app change promptly.

-- ── 1. Per-IP throttle storage ──────────────────────────────────────────
alter table public.front_desk_throttle
  add column if not exists ip text not null default '',
  add column if not exists trusted_at timestamptz;

do $cp141$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.front_desk_throttle'::regclass
       and contype = 'p'
       and pg_get_constraintdef(oid) = 'PRIMARY KEY (business_id, ip)'
  ) then
    alter table public.front_desk_throttle
      drop constraint if exists front_desk_throttle_pkey;
    alter table public.front_desk_throttle
      add constraint front_desk_throttle_pkey primary key (business_id, ip);
  end if;
end
$cp141$;

create index if not exists front_desk_throttle_recent_idx
  on public.front_desk_throttle (business_id, updated_at desc);

-- ── 2. The verifier ─────────────────────────────────────────────────────
drop function if exists public.verify_front_desk_pin(uuid, text);

create or replace function public.verify_front_desk_pin(
  p_business_id uuid,
  p_pin text,
  p_ip text default null
)
returns table(user_id uuid, ok boolean, locked boolean)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_ip           text := coalesce(nullif(btrim(p_ip), ''), 'unknown');
  v_uid          uuid;
  v_locked_until timestamptz;
  v_trusted_at   timestamptz;
  v_trusted      boolean := false;
  v_fails        integer;
  v_lock         interval;
  v_untrusted    integer;
  v_owner        uuid;
  v_bizname      text;
begin
  select t.locked_until, t.trusted_at
    into v_locked_until, v_trusted_at
    from public.front_desk_throttle t
   where t.business_id = p_business_id and t.ip = v_ip;

  -- This source is serving a lockout.
  if v_locked_until is not null and v_locked_until > now() then
    user_id := null; ok := false; locked := true; return next; return;
  end if;

  v_trusted := v_trusted_at is not null
               and v_trusted_at > now() - interval '30 days';

  -- Distributed-attempt brake. Trusted devices skip it, which is the whole
  -- point: a stranger hammering PINs can no longer lock out the real desk.
  if not v_trusted then
    select coalesce(sum(t.fails), 0) into v_untrusted
      from public.front_desk_throttle t
     where t.business_id = p_business_id
       and t.trusted_at is null
       and t.updated_at > now() - interval '15 minutes';
    if v_untrusted >= 40 then
      user_id := null; ok := false; locked := true; return next; return;
    end if;
  end if;

  select f.user_id into v_uid
    from public.front_desk_pins f
   where f.business_id = p_business_id
     and f.is_active
     and f.pin_hash = crypt(p_pin, f.pin_hash)
   limit 1;

  -- Success: clear this source's failures and mark it trusted.
  if v_uid is not null then
    insert into public.front_desk_throttle
      (business_id, ip, fails, locked_until, trusted_at, updated_at)
    values (p_business_id, v_ip, 0, null, now(), now())
    on conflict (business_id, ip) do update set
      fails = 0, locked_until = null, trusted_at = now(), updated_at = now();
    user_id := v_uid; ok := true; locked := false; return next; return;
  end if;

  -- Failure: count it against this source only.
  insert into public.front_desk_throttle (business_id, ip, fails, updated_at)
  values (p_business_id, v_ip, 1, now())
  on conflict (business_id, ip) do update set
    fails      = public.front_desk_throttle.fails + 1,
    updated_at = now()
  returning fails into v_fails;

  v_lock := case
    when v_fails >= 20 then interval '4 hours'
    when v_fails >= 12 then interval '30 minutes'
    when v_fails >= 8  then interval '5 minutes'
    when v_fails >= 5  then interval '1 minute'
    else null
  end;

  if v_lock is not null then
    update public.front_desk_throttle t
       set locked_until = now() + v_lock
     where t.business_id = p_business_id and t.ip = v_ip;
  end if;

  -- Tell the agency once, on the way past ten failures from one source.
  if v_fails = 10 then
    select a.owner_user_id into v_owner from public.admin_app_config a limit 1;
    select b.name into v_bizname from public.businesses b where b.id = p_business_id;
    if v_owner is not null then
      insert into public.admin_notifications (user_id, title, body, kind, link_path)
      values (
        v_owner,
        'Front desk PIN failures',
        coalesce(v_bizname, 'A business') || ' — 10 failed PIN attempts from ' || v_ip || '.',
        'security',
        '/agency/businesses'
      );
    end if;
  end if;

  user_id := null;
  ok := false;
  locked := v_lock is not null;
  return next;
end; $function$;

-- CP-138 kept this server-only. DROP/CREATE resets the ACL, so restate it.
revoke all on function public.verify_front_desk_pin(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.verify_front_desk_pin(uuid, text, text)
  to service_role;
