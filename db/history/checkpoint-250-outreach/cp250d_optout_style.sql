-- CP-250d · How each outreach email lets people opt out. Additive and safe to re-run.
-- Applied to production 2026-11-23 as migration cp250d_optout_style (same statement).
--
-- The first test email landed in Gmail's Promotions tab. A visible unsubscribe link plus the
-- List-Unsubscribe / List-Unsubscribe-Post headers are bulk-mail signals. At 5–30 personal emails a day,
-- a plain reply-based opt-out meets CAN-SPAM (a working return address that honours requests), and the
-- engine already stops a lead on any reply and suppresses "no thanks" / "unsubscribe" / "stop".
--
--   'reply' (default)  footer ends: Not for you? Just reply "no thanks" and I won't email again.
--                      No link, no List-Unsubscribe headers.
--   'link'             CP-250 behaviour: the same line plus a signed one-click link, and the headers.
--
-- The postal address stays in every email in both modes. /api/outreach/unsubscribe keeps working for
-- links already sent.
--
-- Undo: alter table public.outreach_settings drop column if exists optout_style;

alter table public.outreach_settings
  add column if not exists optout_style text not null default 'reply' check (optout_style in ('reply', 'link'));
