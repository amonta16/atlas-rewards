-- CP-245: the 4-hour launch bonus on the app page (/p/<slug>).
--
-- · bonus_deadline_at  first time the owner saw their app + 4 hours. Set once, by the page's
--                      app_rendered event (/api/preview/event), so a refresh never restarts it.
-- · bonus_claimed_at   they BOOKED their walkthrough before the deadline (/api/landing/demo-request).
--                      Andrew's booking email says whether the bonuses are owed.
--
-- Additive; the code before CP-245 ignores both. Applied to production 2026-11-11 as migration cp245_launch_bonus.
--
-- Undo:
--   alter table public.app_previews drop column if exists bonus_deadline_at, drop column if exists bonus_claimed_at;

alter table public.app_previews
  add column if not exists bonus_deadline_at timestamptz,
  add column if not exists bonus_claimed_at  timestamptz;
