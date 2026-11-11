-- CP-241: AI skin scan. A signed-in patient's saved scan (scores only, never the photo),
-- listed on the med spa desk under "Skin scans".

create table if not exists public.medspa_skin_scans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_id uuid references public.business_memberships(id) on delete set null,
  overall integer not null check (overall between 0 and 100),
  skin_age integer check (skin_age between 10 and 99),
  metrics jsonb not null default '[]'::jsonb,     -- [{id, score}] weakest areas etc.
  goals text[] not null default '{}',             -- what they said they want to improve
  treatments text[] not null default '{}',        -- treatments the scan matched them to
  created_at timestamptz not null default now()
);
create index if not exists medspa_skin_scans_business_idx on public.medspa_skin_scans (business_id, created_at desc);

alter table public.medspa_skin_scans enable row level security;
-- Patients save and read their own; staff read their clinic's.
create policy medspa_skin_scans_self_insert on public.medspa_skin_scans for insert with check (user_id = auth.uid());
create policy medspa_skin_scans_read on public.medspa_skin_scans for select using (user_id = auth.uid() or staffs_business(business_id));

-- The desk list: scan + who it is. Same staff gate as medspa_shop_orders_desk.
create or replace function public.medspa_skin_scans_desk(p_business_id uuid, p_limit integer default 200)
returns table(id uuid, membership_id uuid, full_name text, phone text, email text, overall integer, skin_age integer,
              metrics jsonb, goals text[], treatments text[], created_at timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select s.id, s.membership_id, p.full_name, p.phone, p.email, s.overall, s.skin_age, s.metrics, s.goals, s.treatments, s.created_at
    from public.medspa_skin_scans s
    left join public.profiles p on p.id = s.user_id
   where s.business_id = p_business_id
     and exists (select 1 from public.business_users bu where bu.user_id = auth.uid()
                 and (bu.business_id = p_business_id or (bu.business_id is null and bu.role in ('agency_admin','agency_va'))))
   order by s.created_at desc
   limit p_limit
$$;
grant execute on function public.medspa_skin_scans_desk(uuid, integer) to authenticated;
