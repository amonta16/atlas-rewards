-- CP-213 · Layout lock fix. APPLIED to production Oct 22 2026 via the Supabase MCP
-- (migration cp213_layout_lock_grace_period). Safe to re-run.
-- The CP-209 lock assumed new businesses insert with a NULL layout, but the
-- column defaults to 'custom', so picking Medspa / Food / Smoke when creating
-- an app (new-business modal, instant + batch demos) was pinned back to Classic.
-- Layout can now change during the first 30 minutes after creation; locked after.
create or replace function public.pin_layout_preset()
returns trigger language plpgsql as $$
begin
  if old.layout_preset is not null
     and new.layout_preset is distinct from old.layout_preset
     and coalesce(current_setting('atlas.allow_layout_change', true), '') <> 'on'
     and coalesce(old.created_at, now() - interval '1 day') < now() - interval '30 minutes' then
    new.layout_preset := old.layout_preset;
  end if;
  return new;
end;
$$;
