-- ============================================================================
-- CP-133.2 · Prizes can be deleted after they've been won
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Bug: mystery_reward_spins.prize_id was "on delete restrict" (CP-18), so any
-- prize that had ever been spun could not be deleted — and the builder hid
-- the error, so the row just stayed. prize_id has been nullable since CP-44
-- (default prizes record null), so the spin history can simply keep a null
-- prize when its prize is removed. The RPC also reports a real error now.
-- ============================================================================

-- Find the FK by what it points at (the name varies by how the table was made).
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
     where n.nspname = 'public' and rel.relname = 'mystery_reward_spins'
       and con.contype = 'f'
       and con.confrelid = 'public.mystery_reward_pool'::regclass
  loop
    execute format('alter table public.mystery_reward_spins drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.mystery_reward_spins
  alter column prize_id drop not null;

alter table public.mystery_reward_spins
  add constraint mystery_reward_spins_prize_id_fkey
  foreign key (prize_id) references public.mystery_reward_pool(id) on delete set null;

-- Same RPC, but says so when nothing was deleted.
create or replace function public.delete_mystery_prize(p_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  delete from public.mystery_reward_pool where id = p_id and business_id = p_business_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'prize not found'; end if;
end; $$;
grant execute on function public.delete_mystery_prize(uuid, uuid) to authenticated;
