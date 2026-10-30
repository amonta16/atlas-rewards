-- =====================================================================
-- CHECKPOINT 12 — Automation rules RPCs + Push subscriptions
-- =====================================================================

-- Push subscriptions table (web push API)
create table if not exists public.push_subscriptions (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  business_id     uuid not null references public.businesses(id) on delete cascade,
  endpoint        text not null,
  p256dh_key      text not null,
  auth_key        text not null,
  created_at      timestamptz not null default now(),
  unique (user_id, business_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
do $$
begin
  begin drop policy "push_self" on public.push_subscriptions; exception when undefined_object then null; end;
end $$;
create policy "push_self" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- Automation rules CRUD (table from CP 1 already exists)
-- =====================================================================
create or replace function public.upsert_automation_rule(
  p_id           uuid,
  p_business_id  uuid,
  p_name         text,
  p_trigger      jsonb,
  p_action       jsonb,
  p_is_active    boolean default true
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  if p_id is null then
    insert into public.automation_rules (business_id, name, trigger, action, is_active)
    values (p_business_id, p_name, p_trigger, p_action, p_is_active)
    returning id into v_id;
  else
    update public.automation_rules
       set name = p_name, trigger = p_trigger, action = p_action,
           is_active = p_is_active, updated_at = now()
     where id = p_id and business_id = p_business_id
    returning id into v_id;
  end if;
  return v_id;
end; $$;
grant execute on function public.upsert_automation_rule(uuid, uuid, text, jsonb, jsonb, boolean) to authenticated;

create or replace function public.delete_automation_rule(p_id uuid, p_business_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staffs_business(p_business_id) then raise exception 'permission denied'; end if;
  delete from public.automation_rules where id = p_id and business_id = p_business_id;
end; $$;
grant execute on function public.delete_automation_rule(uuid, uuid) to authenticated;

-- =====================================================================
-- Automation dispatcher — fires when a ledger entry matches a rule's trigger
-- This writes to a queue table; the edge function picks it up and sends.
-- =====================================================================
create table if not exists public.automation_queue (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  rule_id         uuid references public.automation_rules(id) on delete set null,
  membership_id   uuid references public.business_memberships(id) on delete set null,
  channel         text not null,    -- 'sms' | 'email' | 'push'
  recipient       text,             -- phone / email / push endpoint
  template        text not null,
  variables       jsonb not null default '{}'::jsonb,
  status          text not null default 'pending', -- pending / sent / failed
  sent_at         timestamptz,
  error           text,
  created_at      timestamptz not null default now()
);
create index if not exists automation_queue_pending_idx
  on public.automation_queue(status, created_at) where status = 'pending';

alter table public.automation_queue enable row level security;
do $$
begin
  begin drop policy "auto_q_staff" on public.automation_queue; exception when undefined_object then null; end;
end $$;
create policy "auto_q_staff" on public.automation_queue for select to authenticated
  using (public.staffs_business(business_id));

-- Trigger: evaluate rules on every ledger insert
create or replace function public.fire_automation_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_match boolean;
  v_member record;
  v_phone text;
  v_email text;
begin
  -- Pull member contact info
  select m.id as membership_id, p.phone, p.email::text as email, p.full_name
    into v_member
    from public.business_memberships m
    join public.profiles p on p.id = m.user_id
   where m.id = new.membership_id;

  for r in
    select * from public.automation_rules
     where business_id = new.business_id and is_active
  loop
    v_match := false;

    -- Trigger types: rule_type, points_reached, balance_above
    if r.trigger->>'type' = 'rule_type' and r.trigger->>'value' = new.rule_type then
      v_match := true;
    elsif r.trigger->>'type' = 'balance_above'
      and new.balance_after >= (r.trigger->>'value')::int then
      v_match := true;
    end if;

    if v_match then
      -- Enqueue the action
      insert into public.automation_queue
        (business_id, rule_id, membership_id, channel, recipient, template, variables)
      values (
        new.business_id, r.id, new.membership_id,
        coalesce(r.action->>'channel', 'sms'),
        case r.action->>'channel'
          when 'sms'   then v_member.phone
          when 'email' then v_member.email
          else null
        end,
        coalesce(r.action->>'template', ''),
        jsonb_build_object(
          'name', v_member.full_name,
          'balance', new.balance_after,
          'delta', new.delta,
          'rule_type', new.rule_type
        )
      );
    end if;
  end loop;
  return new;
end; $$;

drop trigger if exists trg_fire_automation on public.points_ledger;
create trigger trg_fire_automation
  after insert on public.points_ledger
  for each row execute function public.fire_automation_rules();
