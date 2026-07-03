-- CP-59 — One account per phone/email  +  admin-portal folders
--
-- WHY: businesses hand out welcome gifts for downloading the app. People farm
-- them by making a fresh account with the same phone + a new email. Email is
-- already unique (Supabase auth won't allow two accounts on one email), so the
-- gap is the PHONE. This locks a phone number to a single Atlas account.
--
-- Note a phone/account is shared across ALL businesses (one human = one Atlas
-- profile), so a returning customer joining a second business keeps the SAME
-- account (same id, same email) — that path must NOT be blocked. Only a phone
-- showing up on a DIFFERENT email is farming.

-- ---------------------------------------------------------------------------
-- 1. Phone normalizer — keep the last 10 digits (US numbers). Adjust the tail
--    length if you go international.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_phone(p text)
returns text language sql immutable as $$
  select case
    when p is null then null
    else right(regexp_replace(p, '\D', '', 'g'), 10)
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Backstop trigger — a phone can live on at most one profile. Runs
--    SECURITY DEFINER so it can see every profile (past RLS). The `id <> new.id`
--    guard means a customer editing their OWN profile, or a returning customer
--    (same auth id across businesses), is never blocked — only a *new* profile
--    trying to claim a phone another profile already owns.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_unique_customer_phone()
returns trigger language plpgsql security definer set search_path = public as $$
declare norm text;
begin
  norm := public.normalize_phone(new.phone);
  if norm is not null and length(norm) = 10 then
    if exists (
      select 1 from public.profiles
      where id <> new.id
        and public.normalize_phone(phone) = norm
    ) then
      raise exception 'PHONE_IN_USE' using errcode = 'unique_violation';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_unique_customer_phone on public.profiles;
create trigger trg_unique_customer_phone
  before insert or update of phone on public.profiles
  for each row execute function public.enforce_unique_customer_phone();

-- ---------------------------------------------------------------------------
-- 3. Pre-signup availability check. The customer signup page calls this BEFORE
--    creating anything, so we can block farming with a clean message instead of
--    leaving a half-built account. Privacy-safe: it never returns anyone's
--    email — just booleans.
--
--    phone_conflict = the phone is already tied to an account on a DIFFERENT
--                     email (→ block the signup).
--    email_exists   = an account with this email already exists (→ the client
--                     falls through to its existing "sign in & enroll at this
--                     business" flow; this is a legit returning customer).
-- ---------------------------------------------------------------------------
create or replace function public.signup_identity_available(
  p_email text, p_phone text
) returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'phone_conflict', (
      exists (
        select 1 from public.profiles p
        where public.normalize_phone(p.phone) = public.normalize_phone(p_phone)
          and public.normalize_phone(p_phone) is not null
          and length(public.normalize_phone(p_phone)) = 10
          and p.email is distinct from p_email::citext
      )
    ),
    'email_exists', (
      exists (select 1 from public.profiles p where p.email = p_email::citext)
    )
  );
$$;

grant execute on function public.normalize_phone(text)             to anon, authenticated;
grant execute on function public.signup_identity_available(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Admin-portal folders — a plain per-business folder name the agency sets on
--    the dashboard. NULL = "Unfiled". Manual folders live here; the dashboard
--    also offers an auto "group by industry" view that needs no column.
-- ---------------------------------------------------------------------------
alter table public.businesses add column if not exists folder text;
comment on column public.businesses.folder is
  'CP-59 admin-portal folder name (manual grouping). NULL = Unfiled.';
