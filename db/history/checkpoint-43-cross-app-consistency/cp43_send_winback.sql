-- =====================================================================
-- CP-43 — restore send_winback (the only object the diagnostic found
-- MISSING on the live DB). Powers the "We miss you" win-back composer in
-- the Insights tab. Idempotent + self-contained: safe to run as-is.
-- =====================================================================

-- The table the win-back message lands in (surfaced as the customer's
-- personal banner). Created here in case the cp18 migration was skipped.
create table if not exists public.customer_messages (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  membership_id   uuid not null references public.business_memberships(id) on delete cascade,
  kind            text not null check (kind in ('winback','reminder','offer','milestone')),
  title           text not null,
  body            text,
  bonus_points    int,
  expires_at      timestamptz,
  is_dismissed    boolean not null default false,
  created_at      timestamptz not null default now()
);

alter table public.customer_messages enable row level security;

-- Staff of the business can manage; the member can read their own.
drop policy if exists cm_staff_all on public.customer_messages;
create policy cm_staff_all on public.customer_messages
  for all using (public.staffs_business(business_id))
  with check (public.staffs_business(business_id));

drop policy if exists cm_member_read on public.customer_messages;
create policy cm_member_read on public.customer_messages
  for select using (
    exists (select 1 from public.business_memberships m
             where m.id = customer_messages.membership_id and m.user_id = auth.uid())
  );

-- The function the app calls (matches the existing signature exactly).
create or replace function public.send_winback(
  p_business_id   uuid,
  p_membership_id uuid,
  p_title         text default null,
  p_body          text default null,
  p_bonus_points  int  default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;

  insert into public.customer_messages
    (business_id, membership_id, kind, title, body, bonus_points, expires_at)
  values
    (p_business_id, p_membership_id, 'winback',
     coalesce(p_title, 'We miss you ☕'),
     coalesce(p_body, 'Tap to claim your come-back bonus.'),
     p_bonus_points,
     now() + interval '14 days')
  returning id into v_id;

  -- Drop the bonus points immediately if specified.
  if coalesce(p_bonus_points, 0) > 0 then
    insert into public.points_ledger
      (business_id, membership_id, delta, rule_type, notes)
    values
      (p_business_id, p_membership_id, p_bonus_points, 'winback_bonus',
       'Win-back bonus from come-back AI');
    update public.business_memberships
       set points_balance = points_balance + p_bonus_points,
           lifetime_points_earned = lifetime_points_earned + p_bonus_points
     where id = p_membership_id;
  end if;
  return v_id;
end; $$;

grant execute on function public.send_winback(uuid, uuid, text, text, int) to authenticated;

notify pgrst, 'reload schema';
