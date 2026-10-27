# CP-221 · Weekly home spin, its insights, and report emails

**Status:** SQL applied to production Oct 27 2026 (migrations cp221_01…03). `tsc` clean, `next build` green, `npm test` 12/12. Verified in rolled-back transactions: home spin works only with the flag on, second spin blocked, visit spin unaffected; job sends 27 for Flippo's (6 opted out skipped), second run sends 0. After deploy, switch it on for Flippo's in
Brand editor → Settings → **Weekly home spin** (or `update businesses set weekly_spin_enabled = true where slug = 'flippo-s-arcade-and-batting-cage'`).

## The feature (entertainment model)
- Every member gets **one free prize-wheel spin per week from home** (no check-in). Week = Mon 00:00 → Sun 23:59 business time.
- **Doesn't stack**: skip a week, you still have exactly one.
- The visit (check-in) spin is unchanged. `spin_daily_reward` uses today's check-in spin first, else the weekly home spin.
- `mystery_reward_spins.source` = `checkin` | `home`; `mystery_reward_status` now counts only check-in spins for the daily cooldown.
- On by default for `layout_preset = 'entertainment'` (new businesses / switching preset); existing businesses are left off until switched on.

## Notifications (`process_weekly_spin`, cron `atlas-weekly-spin`, :17 hourly)
Kept light (Andrew, Oct 27). Only to members who haven't spun this week, only inside opening hours (`booking_hours.week`; closed days skipped; none in the last 30 min before close). No "resets" wording.
1. **Spin ready** — once a week, first open day, 1 h after opening (Flippo's: Mon 11:00)
2. **Reminder** — at most once every 2 weeks per member: Thursday or later, ~4 pm, ≥48 h after the weekly push

Guardrails: one weekly-spin message per 20 h; shared 2-push/20 h budget checked first (deferred, never dropped); skipped if the member turned off push or "Check-in available"; demo/blocked never. `_notif_gate` patched in place so `weekly_spin` counts toward the budget + duplicate guard. Push link `/app?spin=1` opens the wheel.

## Where it shows
- **Customer Home** wheel card: "Free weekly spin" state; modal badge "Free weekly spin · no visit needed"; locked/claimed copy explains reset day. Header menu wheel uses the same status (`my_spin_status`, `lib/use-spin-status.ts`).
- **Admin**: Brand editor → Settings → Notifications → *Weekly home spin* switch; Automation Hub → Existing automations lists **🎡 Weekly home spin** with 30-day sends.
- **Insights** (manager dashboard): *Weekly home spin* card — % of members who spun this week, home spins 30 d (vs prior 30), came in within 7 days, pushes sent / reached, prizes & points won, 8-week bars (`weekly_spin_insights`).
- **Monthly report** (dashboard + email): *Weekly home spin* block + a "worth your attention" line (`_build_monthly_report.weekly_spin`).

## Report recipients
- `businesses.report_recipients` (new): when set, the report goes **only** to these addresses; empty = every manager login (front-desk logins excluded).
- Insights → Monthly reports → **Who gets this email** — add/remove addresses, **Send test** (to your own login email or anyone on the list; marked `[Test]`; doesn't affect the 1st). `POST /api/reports/test`.

Flippo's `report_recipients` set to Andrew only (Oct 27) for testing — add Mary in Insights → Monthly reports when ready.
