-- CP-92 — finish the raffle pgcrypto fix.
--
-- The Aug 1 hotfix altered finalize_due_raffles(), but the actual
-- gen_random_bytes() calls live INSIDE the functions it invokes —
-- finalize_raffle(uuid) and redraw_raffle(...) (cp85_raffles.sql lines
-- 506 and 707). Each of those has its own `SET search_path = public`,
-- which OVERRIDES the caller's setting, so the every-5-minute sweep kept
-- failing with "function gen_random_bytes(integer) does not exist".
--
-- This catch-all finds EVERY public function whose body mentions
-- gen_random_bytes and appends the extensions schema to its search_path.
-- Same class of bug as the CP-87 PIN fix: on Supabase, pgcrypto lives in
-- the `extensions` schema.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc ilike '%gen_random_bytes%'
  loop
    execute format('alter function %s set search_path = public, extensions', r.sig);
    raise notice 'patched: %', r.sig;
  end loop;
end $$;

-- Verify: every row should show search_path=public, extensions
select p.oid::regprocedure as func,
       (select string_agg(c, ', ') from unnest(p.proconfig) c) as config
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosrc ilike '%gen_random_bytes%';
