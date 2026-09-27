-- CP-167 · desk realtime: bookings join the realtime publication
--
-- The manager dashboard now mounts one realtime channel that listens to
-- bookings / redemptions / reviews / points_ledger / business_memberships /
-- check_in_events. All of those except `bookings` were already published.
-- Without this, a booking made in the app still only shows up on the desk
-- on the Refresh button / 3-minute safety poll.
--
-- Idempotent. Safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings'
  ) then
    alter publication supabase_realtime add table public.bookings;
  end if;
end $$;

-- Realtime needs REPLICA IDENTITY to send UPDATE/DELETE rows with the
-- business_id filter column; FULL is the safe default for a small table.
alter table public.bookings replica identity full;

select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by 1;
