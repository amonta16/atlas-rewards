# CP-47 — login routing · password reset · live data · points-gift fix

Apply `cp47_migration.sql` in the Supabase SQL editor, then deploy.

## 1. Points-award gift no longer shows a "code" or sits in Saved gifts
A points-bonus ("Award Points") welcome is credited instantly — it has no
redeemable code. It was wrongly appearing in the customer's **Saved gifts**
list, which then tried to generate a QR code → "Code not generated yet."
`my_saved_offers` now excludes `discount_type = 'points_bonus'`. The one-time
reveal popup still fires (that's a separate path). Saved gifts is now only
real discounts / reward gifts the front desk fulfills with a code.

## 2. Front-desk login routing — staff no longer land in the customer app
The `/<slug>/login` page always defaulted to `/app`, so a front-desk or
manager account dropped into the **customer** view. It's now role-aware:
anyone with a privileged role (agency_admin / business_manager /
business_staff) is routed to `/<slug>/manage`; pure customers go to `/app`.
An explicit `?next=` still wins. The page also shows a "Front desk sign-in"
heading when reached from the manage portal (or `?staff=1`), and has a
"Forgot password?" link. No SQL.

## 3. Forgot-password / reset flow (sustainable recovery)
New pages: `/<slug>/forgot-password` (sends a Supabase reset email) and
`/<slug>/reset-password` (sets the new password from the email link). Works
for customers and staff. This is the durable fix for "don't lose years of
points because you lost your account." **Needs SMTP configured — see §6.**

## 4. Live insights — "Inactive (60d+)" stat fixed
The stat read `rollup.inactive_60d`, which also counts members who NEVER
visited (`last_visit_at IS NULL`) — so it showed "7" while the win-back list
below was empty. It now uses the actual contactable win-back list length
("Win-back ready"), so the number always matches the members you can act on.

## 5. Revenue graph + visible "See all"
- The customer **revenue / transactions** graphs (`BusinessInsights`) are now
  on the front-desk Insights for managers/admins, alongside the Atlas Impact
  dashboard. (Front-desk staff stay gated out.)
- The Top-rewards **"See all"** is now a filled brand pill with a glow so it
  pops instead of reading as plain text.

## 6. Email domain for password-reset emails — how to set it up
Supabase's built-in email sender is rate-limited (≈2/day in 2026) — fine for
testing, **not** production. For real reset emails you connect a custom SMTP
provider once, at the Supabase **project** level. It covers **every** business
— the email is sent from *your* Atlas domain (not each client's), so one
domain serves them all. Steps:

1. Pick a transactional email provider (Resend is the simplest; SendGrid,
   Postmark, or AWS SES also work).
2. Add a sending domain you control, e.g. `auth.atlasrewards.com`, and add the
   **SPF, DKIM, DMARC** DNS records the provider gives you to that domain.
   (Use a dedicated auth subdomain so reset emails never affect any future
   marketing-email reputation.)
3. In Supabase: **Authentication → Emails → SMTP Settings** → enable custom
   SMTP and paste the provider's host / port / username / password, with a
   From address like `no-reply@auth.atlasrewards.com`.
4. (Optional) Set the redirect allow-list under **Authentication → URL
   Configuration** to your production domain so reset links resolve there
   instead of `localhost`.

That's the whole thing — one domain, one SMTP config, used only to deliver
password-reset (and confirm) emails for all sub-accounts.

## 7. Optional — remove the CP-1 demo data for a clean "live" slate
If you ran `checkpoint-01-foundation/04_seed_demo.sql`, a sample "Demo Rewards
Co." business (slug `demo`) and its seeded members still exist and can skew
demo-looking numbers. The live insights compute from real rows, not
hard-coded values — but to wipe the sample business entirely:

```sql
-- Deletes the demo business and everything under it (members, ledger, offers…)
DELETE FROM public.businesses WHERE slug = 'demo';
```

Your real businesses are untouched.
