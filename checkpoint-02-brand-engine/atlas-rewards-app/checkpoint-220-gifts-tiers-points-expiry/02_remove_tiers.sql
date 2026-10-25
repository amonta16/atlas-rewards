-- CP-220 · part 2 — Bronze / Silver / Gold / VIP tiers are gone for good.
-- (CP-73 removed them from the customer screens, but the engine kept
-- assigning them and a few screens still printed them.) Paid memberships are
-- a separate feature (membership_payment_status) and are untouched.

-- recalc_tier is called from many places; it now leaves everyone a plain member.
create or replace function public.recalc_tier(p_membership_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.business_memberships set tier = 'Member'
   where id = p_membership_id and tier is distinct from 'Member';
end $$;

-- Backfill without firing a "tier.changed" automation event for every member.
alter table public.business_memberships disable trigger trg_wf_ev_membership;
update public.business_memberships set tier = 'Member' where tier is distinct from 'Member';
alter table public.business_memberships enable trigger trg_wf_ev_membership;

alter table public.business_memberships alter column tier set default 'Member';

-- No tier ladders left on any business.
update public.businesses set tiers = '[]'::jsonb where tiers is distinct from '[]'::jsonb;
alter table public.businesses alter column tiers set default '[]'::jsonb;
