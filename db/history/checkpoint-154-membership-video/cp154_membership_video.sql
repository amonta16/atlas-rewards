-- CP-154 · membership sales video (YouTube / Vimeo link) on the Member tab
-- Safe to re-run. Separate RPCs so membership_billing_public is untouched.
alter table public.business_membership_billing add column if not exists video_url text;

drop function if exists public.set_membership_video(uuid, text);
create or replace function public.set_membership_video(p_business_id uuid, p_video_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.manages_business(p_business_id) then raise exception 'permission denied'; end if;
  insert into public.business_membership_billing (business_id, video_url)
       values (p_business_id, nullif(trim(p_video_url), ''))
  on conflict (business_id) do update set video_url = excluded.video_url, updated_at = now();
end $$;
revoke all on function public.set_membership_video(uuid, text) from public, anon;
grant execute on function public.set_membership_video(uuid, text) to authenticated;

drop function if exists public.membership_video_public(uuid);
create or replace function public.membership_video_public(p_business_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select video_url from public.business_membership_billing where business_id = p_business_id;
$$;
revoke all on function public.membership_video_public(uuid) from public, anon;
grant execute on function public.membership_video_public(uuid) to authenticated;
