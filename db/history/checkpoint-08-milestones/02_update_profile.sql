-- Customer-side: update own profile (birthday, name, phone).
-- RLS already lets a customer write their own row, but a simple RPC
-- keeps the client code clean.
create or replace function public.update_my_profile(
  p_full_name text default null,
  p_phone     text default null,
  p_birthday  date default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.profiles
     set full_name = coalesce(p_full_name, full_name),
         phone     = coalesce(p_phone,     phone),
         birthday  = coalesce(p_birthday,  birthday),
         updated_at = now()
   where id = auth.uid();
end; $$;
grant execute on function public.update_my_profile(text, text, date) to authenticated;
