-- CP-93 — let the raffle draw write its winner notifications.
--
-- The CP-92 search_path fix worked: gen_random_bytes resolves now, the
-- draw runs — and hits the NEXT wall: `notifications_kind_check` predates
-- raffles and rejects kind values like 'raffle_won' / 'raffle_winner_drawn'
-- / 'raffle_ended', so finalize_raffle's notification INSERT aborts the
-- whole sweep (every 5 minutes, in the Vercel logs).
--
-- Same medicine as CP-44.1 gave points_ledger's rule_type CHECK: drop it.
-- `kind` is routing/icon metadata, not integrity-critical — a CHECK here
-- has now broken production twice while protecting nothing. Do NOT re-add.

alter table public.notifications
  drop constraint if exists notifications_kind_check;

-- Verify: should return zero rows.
select conname
  from pg_constraint
 where conrelid = 'public.notifications'::regclass
   and conname = 'notifications_kind_check';
