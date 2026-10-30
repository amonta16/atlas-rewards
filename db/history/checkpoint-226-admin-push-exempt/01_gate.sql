-- CP-226 (applied Oct 27 2026, migration cp226_push_budget_admin_exempt):
-- Atlas admins (business_users.role = 'agency_admin') are exempt from the
-- 2-pushes / 20 h budget in _notif_gate so they can test sends freely.
-- Staff, managers and members keep the limit. The 90-second duplicate guard
-- still applies to everyone. Patched in place.
do $$
declare d text; n text;
  anchor text := E'and new.title not ilike ''%last call%'' then';
begin
  d := pg_get_functiondef('public._notif_gate'::regproc);
  if position('cp226' in d) = 0 then
    n := replace(d, anchor,
      E'and new.title not ilike ''%last call%''\n     and not exists (select 1 from public.business_users ab where ab.user_id = new.user_id and ab.role = ''agency_admin'') /* cp226 */ then');
    if n = d then raise exception 'gate anchor not found'; end if;
    execute n;
  end if;
end $$;
