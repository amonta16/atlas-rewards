-- =====================================================================
-- CHECKPOINT 24 — Realtime for offers / streak tables + offer fallback
-- =====================================================================
-- Symptoms Andrew reported after the CP-24 UI shipped:
--   1. "I am still not seeing the custom offer headline on top of the
--      screen when I actually log in." — the FeaturedOfferBanner
--      subscribes to postgres_changes on `public.offers` but the offers
--      table was never added to the supabase_realtime publication, so
--      the events never fire. Layout still server-renders the banner
--      from featured_offer() — but that returns NULL unless the offer
--      is explicitly ⭐ Featured. If the agency just creates an offer
--      without ticking Featured, the banner stays blank.
--   2. "I also activated streak option and it's not updating" — same
--      story: streak_config + member_streaks weren't in supabase_realtime
--      either, so the customer header flame never refreshes after the
--      agency toggles streaks on.
--
-- This patch is idempotent and safe to paste into the Supabase SQL
-- editor. Run it once. No restart required.
-- =====================================================================

-- ----- 1. Enable realtime for offers, streak_config, member_streaks -----
-- Skip silently if the table is already in the publication.
do $$
begin
  begin
    alter publication supabase_realtime add table public.offers;
  exception when duplicate_object then null; when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.streak_config;
  exception when duplicate_object then null; when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.member_streaks;
  exception when duplicate_object then null; when undefined_table then null;
  end;
  begin
    alter publication supabase_realtime add table public.check_in_events;
  exception when duplicate_object then null; when undefined_table then null;
  end;
end $$;

-- ----- 2. featured_offer() — fall back to most-recent active offer ------
-- The agency frequently creates offers without ticking ⭐ Featured. Before
-- this patch the banner stayed blank in that case. Now we prefer a
-- featured offer when one exists, but fall back to the most recently
-- created active (non-expired) offer otherwise. This matches the
-- agency's mental model that "the offer I just created should appear on
-- the customer side."
create or replace function public.featured_offer(p_business_id uuid)
returns table (
  id          uuid,
  title       text,
  description text,
  image_url   text,
  expires_at  timestamptz
)
language sql stable security definer set search_path = public as $$
  select o.id, o.title, o.description, o.image_url, o.expires_at
    from public.offers o
   where o.business_id = p_business_id
     and o.is_active
     and (o.expires_at is null or o.expires_at > now())
   order by
     -- ⭐ Featured offers win.
     o.is_featured desc,
     -- Then the lowest sort_order (curated position).
     coalesce(o.sort_order, 0) asc,
     -- Then the most recently created.
     o.created_at desc
   limit 1;
$$;

grant execute on function public.featured_offer(uuid) to anon, authenticated;

-- ----- 3. Tell PostgREST to reload its schema cache ---------------------
notify pgrst, 'reload schema';
