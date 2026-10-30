# CP-209 · Managers build their own app, monthly report (email + dashboard), clearer tabs

**Check after push:** sign in as a manager at `/<slug>/manage`.
- Med spa: sidebar → **App builder** (Patient app group) · **Reports** (Business group) · Overview has "Edit your app" + "Monthly report" buttons.
- Any niche: **Reports** tab. Deep link from the email: `/<slug>/manage?tab=reports&month=2026-09`.

## 1. App builder for managers (med spas)
Before, treatments/shop/etc. could only be set up from the agency builder. Managers now get **App builder** with the exact same editors the agency uses:
Treatments & booking (incl. scheduling links + recall) · Shop (incl. pay-over-time) · Rewards · Providers · Aftercare · Before & after · Member credits · Practice info (phone, email, address, hours, maps link, Google review link, welcome line).
- Sticky save bar (Unsaved changes → Save / Discard), leave-page guard. Rewards save as you edit (same RewardsManager as agency).
- **Not** editable by managers: layout/niche, brand colors/logo/design, point values, billing.
- Fix: med spa image uploads went to `medspa/<id>/…`, which storage RLS only allows for agency staff → now `<id>/medspa/…` (managers can upload; agency unaffected). Old image URLs keep working.
- Agency builder (`/agency/businesses/<id>`) is unchanged — both sides can edit.

## 2. Monthly report
- **Email**: Vercel cron `0 16 1 * *` (1st of the month, 9am PT) → `/api/reports/monthly` builds last month's report for every non-demo business, stores it, and emails every **manager** (business_users role `business_manager`). Branded with the business's color; 6 headline numbers with vs-last-month change, "What it means" takeaways (Win / Watch / Do next), top treatments (med spa) or top members, button to the dashboard.
- **Dashboard**: Reports tab — "October so far" (live, compared with the same days last month) + every archived month, with "Emailed Oct 1 to …".
- Med spa headline numbers: treatments, new patients, app sales, membership revenue, returning patients, reviews. Venues: visits, new members, active members, rewards redeemed, returning members, reviews.
- Every number and takeaway is computed from their data — no invented benchmarks.
- Manual runs (with `Authorization: Bearer $CRON_SECRET`): `?dry=1` (build + store, no email), `?to=you@x.com` (send one test email), `?business=<id>`, `?month=2026-09`, `?force=1`.
- Needs: `RESEND_API_KEY` (already used by the funnel) and `CRON_SECRET` (already set). Optional `REPORTS_FROM_EMAIL`.

## 3. Clear "you are here" on the front desk
- Phones/tablets: tab bar is now filled pills; the active tab is a solid brand-color pill, sticky, auto-scrolls into view; page shows a title (section + tab name).
- Desktop: sidebar active item is a white chip with a brand bar (readable on any brand color — a pale primary used to wash out the white text); title bar shows a brand icon chip, breadcrumb (Practice / Patient app / Business) and a large tab name.

## 4. Layout lock — now enforced in the database too
Trigger `trg_pin_layout_preset` pins any change to a set layout (CP-208 only hid the UI). Verified: an update to `entertainment` on Spa by the Bay stayed `medspa`.

## SQL
`cp209_layout_lock_monthly_reports.sql` — **already applied to production**.

## Verified
`tsc` 0 errors, `next build` green. Playwright with fixture data: Reports tab (archived + month-to-date toggle), App builder (sub-tabs, save bar appears on edit), email HTML (UTF-8, renders cleanly). Report SQL smoke-tested on production data. Not yet exercised as a real signed-in manager or with a real Resend send — use `?to=` for that.

## CP-209b · Logo + color branded
- Email header and dashboard band show the **business's logo** (white chip, falls back to the square app icon, then to no logo) on its **primary color**, with the **secondary color** as a thin stripe.
- Text color is picked automatically: dark text on a pale brand (e.g. blush pink), white on a dark one. Accent text (links, "Do next") uses the brand color darkened until it's readable on white.
- Relative logo paths are made absolute in the email so Gmail/Outlook can load them.
- Footer: "Sent on the 1st of every month to <business>'s managers · Powered by Atlas Engine".
