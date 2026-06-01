-- =====================================================================
-- CP-37.10 — debug_atlas_base_url helper for the /api/notifications/debug
-- endpoint. Returns the value of the `atlas.base_url` Postgres custom
-- setting (the one the CP-42 universal push fan-out trigger reads to
-- decide which host to POST notifications to). If unset, returns NULL
-- and the trigger falls back to a hardcoded production URL.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.debug_atlas_base_url()
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url text;
BEGIN
  BEGIN
    v_url := current_setting('atlas.base_url');
  EXCEPTION WHEN OTHERS THEN
    v_url := NULL;
  END;
  RETURN v_url;
END; $$;

GRANT EXECUTE ON FUNCTION public.debug_atlas_base_url() TO authenticated;

NOTIFY pgrst, 'reload schema';
