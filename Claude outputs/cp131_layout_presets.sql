-- ============================================================================
-- CP-131 · Per-niche layout presets
-- ----------------------------------------------------------------------------
-- Run in the Supabase SQL editor BEFORE deploying the CP-131 app build.
-- Self-contained: safe to re-run.
--
-- One column. The app reads it to decide the bottom-nav tab set and the order
-- of Home modules (lib/layout-presets.ts):
--   custom        — the classic layout every existing app has today
--   smoke         — Home · Deals · Check in · Rewards · Streak
--   food          — Home · Offers · Check in · Rewards · Streak
--   medspa        — Home · Book · Member · Rewards · Check in   (no streaks)
--   entertainment — Home · Events · Check in · Pass · Rewards  (no streaks)
--
-- Existing rows stay 'custom' — nothing changes for a live business until
-- someone picks a preset in the builder. New demos and new businesses pick
-- their default from the niche/industry in the app (no trigger here, so the
-- mapping lives in one place: presetForIndustry / presetForNiche).
-- ============================================================================

alter table public.businesses
  add column if not exists layout_preset text not null default 'custom';

alter table public.businesses
  drop constraint if exists businesses_layout_preset_check;
alter table public.businesses
  add constraint businesses_layout_preset_check
  check (layout_preset in ('custom','smoke','food','medspa','entertainment'));

comment on column public.businesses.layout_preset is
  'CP-131 niche layout preset: custom | smoke | food | medspa | entertainment. Drives customer-app tabs + Home order (lib/layout-presets.ts).';

-- ── verify ──────────────────────────────────────────────────────────────
-- select layout_preset, count(*) from public.businesses group by 1;
