-- =====================================================================
-- CP-112 — Bookkeeping & Expense Management (+ Live-MRR manager support)
-- =====================================================================
-- Apply AFTER cp111_founder_hq.sql. Idempotent — safe to re-run.
--
-- WHAT THIS SHIPS
--   1. expense_categories     — configurable category list (is_hosting flag
--                               marks hosting/infrastructure categories)
--   2. expense_documents      — receipts/invoices: private-bucket uploads
--                               (physical receipts photographed) OR links
--                               (digital receipts); sha256 dedupe
--   3. recurring_bills        — templates for repeating expenses (hosting,
--                               SaaS, insurance…), agency-wide or
--                               client-specific with optional allocation %
--   4. expense_transactions   — every actual payment (one row per payment;
--                               history NEVER rewritten when a bill's
--                               amount changes); one-time expenses are
--                               transactions with no bill_id
--   5. expense_splits         — split one transaction across categories
--   6. mileage_entries        — door-to-door mileage + travel costs,
--                               linkable to field_sales_events
--   7. mileage_rates          — configurable ¢/mile per tax year (NO rate
--                               is hard-coded or seeded — set it in the UI;
--                               estimates are labeled, never tax advice)
--   8. bookkeeping_audit_log  — who changed what, when (trigger-fed)
--   9. Storage bucket 'expense-receipts' — PRIVATE; agency admins only;
--                               files are served via short-lived signed
--                               URLs, never permanent public links
--  10. RPCs: pay_recurring_bill (duplicate-proof), agency_expense_monthly
--
-- IMPORTANT: this tool ORGANIZES records for the LLC's accountant. It
-- never decides tax treatment — that's what tax_review_status is for.
--
-- All money is integer cents (bigint) with an explicit currency column.
-- All tables are agency_admin-only via RLS (is_agency_admin()).
-- =====================================================================

create extension if not exists pgcrypto with schema public;

-- =====================================================================
-- 1. CATEGORIES (configurable — the app never hard-codes these)
-- =====================================================================
create table if not exists public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  is_hosting  boolean not null default false,
  is_active   boolean not null default true,
  sort        int not null default 100,
  created_at  timestamptz not null default now()
);

insert into public.expense_categories (name, is_hosting, sort) values
  ('Hosting & Infrastructure', true,  10),
  ('Databases & Storage',      true,  11),
  ('Domains',                  true,  12),
  ('Email & SMS Delivery',     true,  13),
  ('APIs & Integrations',      true,  14),
  ('Monitoring & Analytics',   true,  15),
  ('Software & SaaS',          false, 20),
  ('Advertising & Marketing',  false, 21),
  ('Equipment & Hardware',     false, 22),
  ('Office Supplies',          false, 23),
  ('Contractors',              false, 24),
  ('Legal & Professional',     false, 25),
  ('Insurance',                false, 26),
  ('Education',                false, 27),
  ('Travel',                   false, 28),
  ('Mileage',                  false, 29),
  ('Parking & Tolls',          false, 30),
  ('Business Meals',           false, 31),
  ('Licenses & Filing Fees',   false, 32),
  ('Phone & Communications',   false, 33),
  ('Refunds',                  false, 34),
  ('Miscellaneous',            false, 99)
on conflict (name) do nothing;

-- =====================================================================
-- 2. DOCUMENTS (receipts / invoices / contracts)
-- =====================================================================
create table if not exists public.expense_documents (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null check (kind in ('upload','link')),
  bucket        text not null default 'expense-receipts',
  storage_path  text,
  external_url  text,
  file_name     text,
  mime          text,
  size_bytes    bigint,
  sha256        text,
  uploaded_by   uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  constraint expense_documents_content_chk check (
    (kind = 'upload' and storage_path is not null)
    or (kind = 'link' and external_url is not null)
  )
);
-- Same file uploaded twice = same sha256 → reuse the existing row instead
-- of storing a second copy.
create unique index if not exists expense_documents_sha_idx
  on public.expense_documents(sha256) where sha256 is not null;

-- =====================================================================
-- 3. RECURRING BILLS (templates; hosting is a category, not a hard-code)
-- =====================================================================
create table if not exists public.recurring_bills (
  id                   uuid primary key default gen_random_uuid(),
  vendor               text not null,
  service_name         text,
  description          text,
  category_id          uuid references public.expense_categories(id) on delete set null,
  amount_cents         bigint not null default 0 check (amount_cents >= 0),
  currency             text not null default 'USD',
  frequency            text not null default 'monthly'
                         check (frequency in ('weekly','monthly','quarterly','annually')),
  start_date           date,
  next_due_date        date not null,
  end_date             date,
  auto_renew           boolean not null default true,
  payment_method_label text,          -- e.g. "Business Visa •1234" — NEVER full card data
  status               text not null default 'active' check (status in ('active','cancelled')),
  cancelled_at         timestamptz,
  -- Cost ownership: null business_id = shared / agency-wide (the honest
  -- default — shared bills are never force-assigned to one client).
  business_id          uuid references public.businesses(id) on delete set null,
  allocation_pct       int check (allocation_pct is null or (allocation_pct >= 0 and allocation_pct <= 100)),
  billing_url          text,
  document_id          uuid references public.expense_documents(id) on delete set null,
  notes                text,
  created_by           uuid default auth.uid(),
  updated_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists recurring_bills_due_idx
  on public.recurring_bills(status, next_due_date);

-- =====================================================================
-- 4. TRANSACTIONS (every actual payment — the immutable history)
-- =====================================================================
create table if not exists public.expense_transactions (
  id                    uuid primary key default gen_random_uuid(),
  bill_id               uuid references public.recurring_bills(id) on delete set null,
  period_due_date       date,        -- which occurrence of the bill this paid
  txn_date              date not null,
  paid_date             date,
  vendor                text not null,
  description           text,
  category_id           uuid references public.expense_categories(id) on delete set null,
  amount_cents          bigint not null default 0 check (amount_cents >= 0),
  currency              text not null default 'USD',
  payment_method_label  text,
  business_id           uuid references public.businesses(id) on delete set null,
  project_label         text,
  founder_user_id       uuid,
  purpose               text,        -- business purpose (evidence, not a tax claim)
  reimbursement_status  text not null default 'none'
                          check (reimbursement_status in ('none','pending','reimbursed')),
  tax_review_status     text not null default 'unreviewed'
                          check (tax_review_status in
                            ('unreviewed','purpose_documented','needs_accountant',
                             'accountant_confirmed','not_deductible')),
  status                text not null default 'paid'
                          check (status in ('paid','scheduled','cancelled')),
  document_id           uuid references public.expense_documents(id) on delete set null,
  archived              boolean not null default false,
  notes                 text,
  created_by            uuid default auth.uid(),
  updated_by            uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists expense_txn_date_idx
  on public.expense_transactions(status, txn_date);
create index if not exists expense_txn_bill_idx
  on public.expense_transactions(bill_id, period_due_date);
-- THE duplicate-payment backstop: one payment per bill occurrence, no
-- matter how many admins/tabs/retries hit "mark paid" at once.
create unique index if not exists expense_txn_bill_period_uniq
  on public.expense_transactions(bill_id, period_due_date)
  where bill_id is not null and period_due_date is not null;

-- =====================================================================
-- 5. SPLITS (one transaction across several categories)
-- =====================================================================
create table if not exists public.expense_splits (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null references public.expense_transactions(id) on delete cascade,
  category_id     uuid references public.expense_categories(id) on delete set null,
  amount_cents    bigint not null check (amount_cents > 0),
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists expense_splits_txn_idx on public.expense_splits(transaction_id);

-- =====================================================================
-- 6. MILEAGE (door-to-door runs; linkable to the HQ sales calendar)
-- =====================================================================
create table if not exists public.mileage_entries (
  id               uuid primary key default gen_random_uuid(),
  trip_date        date not null,
  driver_user_id   uuid,
  driver_name      text,
  start_location   text,
  destination      text,
  territory        text,
  miles            numeric(8,1) not null default 0 check (miles >= 0),
  purpose          text,
  field_event_id   uuid references public.field_sales_events(id) on delete set null,
  parking_cents    bigint not null default 0 check (parking_cents >= 0),
  tolls_cents      bigint not null default 0 check (tolls_cents  >= 0),
  other_cents      bigint not null default 0 check (other_cents  >= 0),
  currency         text not null default 'USD',
  document_id      uuid references public.expense_documents(id) on delete set null,
  notes            text,
  created_by       uuid default auth.uid(),
  updated_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists mileage_entries_date_idx on public.mileage_entries(trip_date);

-- ¢/mile is CONFIGURED per tax year — deliberately NOT seeded. Set it in
-- Bookkeeping → Mileage → "Mileage rate"; the UI labels every figure an
-- estimate for the accountant to confirm.
create table if not exists public.mileage_rates (
  tax_year        int not null,
  jurisdiction    text not null default 'US federal',
  cents_per_mile  int not null check (cents_per_mile > 0),
  note            text,
  updated_by      uuid,
  updated_at      timestamptz not null default now(),
  primary key (tax_year, jurisdiction)
);

-- =====================================================================
-- 7. AUDIT LOG (trigger-fed; read-only from the app)
-- =====================================================================
create table if not exists public.bookkeeping_audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   uuid,
  action      text not null,          -- created / updated / deleted
  changes     jsonb,                  -- material old→new values
  actor       uuid,
  created_at  timestamptz not null default now()
);
create index if not exists bk_audit_record_idx
  on public.bookkeeping_audit_log(table_name, record_id, created_at desc);

create or replace function public.bookkeeping_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_keys text[] := array[
    'amount_cents','status','paid_date','txn_date','next_due_date','vendor',
    'frequency','tax_review_status','reimbursement_status','archived',
    'cancelled_at','miles','category_id','business_id','document_id',
    'cents_per_mile','period_due_date','auto_renew','end_date'
  ];
  v_old jsonb; v_new jsonb; v_diff jsonb := '{}'::jsonb;
  k text;
  v_id uuid;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    for k in select unnest(v_keys) loop
      if v_new ? k and v_new->k is not null and v_new->>k is not null then
        v_diff := v_diff || jsonb_build_object(k, v_new->k);
      end if;
    end loop;
    begin v_id := (v_new->>'id')::uuid; exception when others then v_id := null; end;
    insert into public.bookkeeping_audit_log (table_name, record_id, action, changes, actor)
    values (tg_table_name, v_id, 'created', v_diff, auth.uid());
    return new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new);
    for k in select unnest(v_keys) loop
      if (v_old->k) is distinct from (v_new->k) then
        v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('from', v_old->k, 'to', v_new->k));
      end if;
    end loop;
    if v_diff = '{}'::jsonb then return new; end if;  -- nothing material
    begin v_id := (v_new->>'id')::uuid; exception when others then v_id := null; end;
    insert into public.bookkeeping_audit_log (table_name, record_id, action, changes, actor)
    values (tg_table_name, v_id, 'updated', v_diff, auth.uid());
    return new;
  else
    v_old := to_jsonb(old);
    begin v_id := (v_old->>'id')::uuid; exception when others then v_id := null; end;
    insert into public.bookkeeping_audit_log (table_name, record_id, action, changes, actor)
    values (tg_table_name, v_id, 'deleted',
            jsonb_build_object('vendor', v_old->'vendor', 'amount_cents', v_old->'amount_cents'),
            auth.uid());
    return old;
  end if;
end; $$;

drop trigger if exists trg_bk_audit_bills on public.recurring_bills;
create trigger trg_bk_audit_bills
  after insert or update or delete on public.recurring_bills
  for each row execute function public.bookkeeping_audit();

drop trigger if exists trg_bk_audit_txns on public.expense_transactions;
create trigger trg_bk_audit_txns
  after insert or update or delete on public.expense_transactions
  for each row execute function public.bookkeeping_audit();

drop trigger if exists trg_bk_audit_mileage on public.mileage_entries;
create trigger trg_bk_audit_mileage
  after insert or update or delete on public.mileage_entries
  for each row execute function public.bookkeeping_audit();

-- =====================================================================
-- 8. RLS + updated_at / updated_by stamping
-- =====================================================================
alter table public.expense_categories    enable row level security;
alter table public.expense_documents     enable row level security;
alter table public.recurring_bills       enable row level security;
alter table public.expense_transactions  enable row level security;
alter table public.expense_splits        enable row level security;
alter table public.mileage_entries       enable row level security;
alter table public.mileage_rates         enable row level security;
alter table public.bookkeeping_audit_log enable row level security;

do $$ begin
  begin drop policy "expense_categories_admin"   on public.expense_categories;    exception when undefined_object then null; end;
  begin drop policy "expense_documents_admin"    on public.expense_documents;     exception when undefined_object then null; end;
  begin drop policy "recurring_bills_admin"      on public.recurring_bills;       exception when undefined_object then null; end;
  begin drop policy "expense_transactions_admin" on public.expense_transactions;  exception when undefined_object then null; end;
  begin drop policy "expense_splits_admin"       on public.expense_splits;        exception when undefined_object then null; end;
  begin drop policy "mileage_entries_admin"      on public.mileage_entries;       exception when undefined_object then null; end;
  begin drop policy "mileage_rates_admin"        on public.mileage_rates;         exception when undefined_object then null; end;
  begin drop policy "bk_audit_read"              on public.bookkeeping_audit_log; exception when undefined_object then null; end;
end $$;

create policy "expense_categories_admin" on public.expense_categories
  for all to authenticated using (public.is_agency_admin()) with check (public.is_agency_admin());
create policy "expense_documents_admin" on public.expense_documents
  for all to authenticated using (public.is_agency_admin()) with check (public.is_agency_admin());
create policy "recurring_bills_admin" on public.recurring_bills
  for all to authenticated using (public.is_agency_admin()) with check (public.is_agency_admin());
create policy "expense_transactions_admin" on public.expense_transactions
  for all to authenticated using (public.is_agency_admin()) with check (public.is_agency_admin());
create policy "expense_splits_admin" on public.expense_splits
  for all to authenticated using (public.is_agency_admin()) with check (public.is_agency_admin());
create policy "mileage_entries_admin" on public.mileage_entries
  for all to authenticated using (public.is_agency_admin()) with check (public.is_agency_admin());
create policy "mileage_rates_admin" on public.mileage_rates
  for all to authenticated using (public.is_agency_admin()) with check (public.is_agency_admin());
-- Audit log: admins can READ; rows are written only by the trigger
-- (SECURITY DEFINER) — no client can insert, rewrite, or delete history.
create policy "bk_audit_read" on public.bookkeeping_audit_log
  for select to authenticated using (public.is_agency_admin());

drop trigger if exists trg_recurring_bills_updated on public.recurring_bills;
create trigger trg_recurring_bills_updated before update on public.recurring_bills
  for each row execute function public.set_updated_at();
drop trigger if exists trg_expense_txn_updated on public.expense_transactions;
create trigger trg_expense_txn_updated before update on public.expense_transactions
  for each row execute function public.set_updated_at();
drop trigger if exists trg_mileage_updated on public.mileage_entries;
create trigger trg_mileage_updated before update on public.mileage_entries
  for each row execute function public.set_updated_at();

-- who-last-edited stamping (reuses CP-111's hq_stamp_updated_by)
drop trigger if exists trg_recurring_bills_by on public.recurring_bills;
create trigger trg_recurring_bills_by before update on public.recurring_bills
  for each row execute function public.hq_stamp_updated_by();
drop trigger if exists trg_expense_txn_by on public.expense_transactions;
create trigger trg_expense_txn_by before update on public.expense_transactions
  for each row execute function public.hq_stamp_updated_by();
drop trigger if exists trg_mileage_by on public.mileage_entries;
create trigger trg_mileage_by before update on public.mileage_entries
  for each row execute function public.hq_stamp_updated_by();

-- =====================================================================
-- 9. PRIVATE RECEIPTS BUCKET (no public URLs — signed URLs only)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('expense-receipts', 'expense-receipts', false)
on conflict (id) do update set public = false;

do $$ begin
  begin drop policy "Receipts admin all"  on storage.objects; exception when undefined_object then null; end;
end $$;
create policy "Receipts admin all" on storage.objects
  for all to authenticated
  using (bucket_id = 'expense-receipts' and public.is_agency_admin())
  with check (bucket_id = 'expense-receipts' and public.is_agency_admin());

-- =====================================================================
-- 10. RPCs
-- =====================================================================

-- Advance a due date by one billing period.
create or replace function public.bk_advance_due(p_date date, p_frequency text)
returns date language sql immutable as $$
  select case p_frequency
    when 'weekly'    then p_date + interval '7 days'
    when 'monthly'   then p_date + interval '1 month'
    when 'quarterly' then p_date + interval '3 months'
    when 'annually'  then p_date + interval '1 year'
    else p_date + interval '1 month'
  end::date;
$$;
grant execute on function public.bk_advance_due(date, text) to authenticated;

-- Mark one occurrence of a recurring bill paid, atomically:
--   • writes ONE payment row (unique (bill_id, period_due_date) makes
--     retries/double-clicks/two admins a no-op, never a duplicate)
--   • advances next_due_date only when this occurrence was the current one
--   • the payment stores its OWN amount — later template edits never
--     rewrite it
create or replace function public.pay_recurring_bill(
  p_bill_id      uuid,
  p_due_date     date   default null,
  p_amount_cents bigint default null,
  p_paid_date    date   default null
)
returns setof public.expense_transactions
language plpgsql security definer set search_path = public as $$
declare
  v_bill     public.recurring_bills%rowtype;
  v_due      date;
  v_amount   bigint;
  v_inserted uuid;
begin
  if not public.is_agency_admin() then
    raise exception 'agency admins only';
  end if;

  select * into v_bill from public.recurring_bills where id = p_bill_id for update;
  if v_bill.id is null then
    raise exception 'bill not found';
  end if;

  v_due    := coalesce(p_due_date, v_bill.next_due_date);
  v_amount := coalesce(p_amount_cents, v_bill.amount_cents);
  if v_amount < 0 then raise exception 'amount must be >= 0'; end if;

  insert into public.expense_transactions
    (bill_id, period_due_date, txn_date, paid_date, vendor, description,
     category_id, amount_cents, currency, payment_method_label, business_id,
     status, created_by)
  values
    (v_bill.id, v_due, v_due, coalesce(p_paid_date, current_date),
     v_bill.vendor,
     coalesce(v_bill.service_name, v_bill.description),
     v_bill.category_id, v_amount, v_bill.currency,
     v_bill.payment_method_label, v_bill.business_id,
     'paid', auth.uid())
  on conflict (bill_id, period_due_date) where bill_id is not null and period_due_date is not null
  do nothing
  returning id into v_inserted;

  -- Advance the template only when we actually paid the CURRENT occurrence.
  if v_inserted is not null and v_due >= v_bill.next_due_date then
    update public.recurring_bills
       set next_due_date = public.bk_advance_due(v_due, v_bill.frequency),
           updated_at = now()
     where id = v_bill.id;
  end if;

  return query
    select * from public.expense_transactions
     where bill_id = v_bill.id and period_due_date = v_due;
end; $$;
grant execute on function public.pay_recurring_bill(uuid, date, bigint, date) to authenticated;

-- Monthly PAID expense rollup for the analytics charts. Historical months
-- are built purely from stored payment rows, so editing a bill's current
-- amount never rewrites history. Hosting = the category's is_hosting flag.
create or replace function public.agency_expense_monthly(p_months int default 12)
returns table (
  month_start     date,
  hosting_cents   bigint,
  recurring_cents bigint,   -- non-hosting payments tied to a recurring bill
  onetime_cents   bigint,   -- non-hosting one-time payments
  total_cents     bigint
)
language sql stable security definer set search_path = public as $$
  with months as (
    select (date_trunc('month', now())::date - (interval '1 month' * g))::date as month_start
      from generate_series(0, greatest(0, least(p_months, 60)) - 1) g
  ),
  paid as (
    select t.*, coalesce(c.is_hosting, false) as is_hosting,
           date_trunc('month', coalesce(t.paid_date, t.txn_date))::date as m
      from public.expense_transactions t
      left join public.expense_categories c on c.id = t.category_id
     where t.status = 'paid' and t.archived = false
  )
  select m.month_start,
    coalesce(sum(p.amount_cents) filter (where p.is_hosting), 0)::bigint,
    coalesce(sum(p.amount_cents) filter (where not p.is_hosting and p.bill_id is not null), 0)::bigint,
    coalesce(sum(p.amount_cents) filter (where not p.is_hosting and p.bill_id is null), 0)::bigint,
    coalesce(sum(p.amount_cents), 0)::bigint
  from months m
  left join paid p on p.m = m.month_start
  where public.is_agency_admin()
  group by m.month_start
  order by m.month_start;
$$;
grant execute on function public.agency_expense_monthly(int) to authenticated;

-- =====================================================================
-- Done. The Bookkeeping tab reads everything above; nothing here touches
-- revenue/pipeline tables, and no existing data is modified.
-- =====================================================================
