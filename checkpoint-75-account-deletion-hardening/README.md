# CP-75 — Account-Deletion Hardening + Version Gate + Email Setup

Store-compliance checkpoint. Apple (5.1.1(v)) and Google both require **working** in-app account deletion, and Play's Data safety form requires a public deletion-info URL. We had deletion since CP-40 — but it was silently broken for a big slice of customers.

## The bug this fixes

`delete_my_account()` (CP-40) ends with `delete from auth.users`. Six foreign keys were created with no on-delete action (Postgres default = **NO ACTION**), so the delete **throws** for any customer who was ever **referred** (`referrals.referee_user_id`, `referee_membership_id`) or is referenced as an actor on another row (`points_ledger.created_by`, `redemptions.fulfilled_by`, `reviews.verified_by`, `check_in_events.checked_in_by_user_id`). A store reviewer testing deletion with a referred account = guaranteed rejection.

## What shipped

**SQL — `cp75_migration.sql`:**
- Dynamically finds those six FKs (whatever Postgres named them) and retargets to `ON DELETE SET NULL`. They're all nullable audit/"who did it" fields — nulling is correct. Cascading FKs are untouched.
- `delete_my_account()` hardened: staff guard (managers/front-desk get a clear "ask your admin" error instead of orphaning a business), defensive `push_subscriptions` cleanup.
- `app_config` single-row table (`min_supported_build`, `latest_build`, `update_message`, `kill_switch`, `kill_message`). Anon-readable, service-role-writable. The Capacitor shell (CP-76) reads it at boot for the "Please update" wall.

**App:**
- `/account/delete` — public page describing in-app + email deletion. **Paste this URL into the Play Data safety form** and link it from the privacy policy. Support email defaults to Andrew's gmail; override with `NEXT_PUBLIC_SUPPORT_EMAIL` once a real domain exists.

## Email (SMTP) — do this in dashboards, no code

Supabase's built-in mailer is rate-limited (~a handful/hour) and lands in spam — fine for dev, fatal in production for password resets. Set up before launch:

1. Buy/choose the production domain (e.g. `atlasrewards.app`) if not done.
2. Create a **Resend** account (free tier: 3k emails/mo — plenty to start; Postmark is the alternative). Add the domain, add the DKIM/SPF DNS records it gives you, verify.
3. Supabase Dashboard → Authentication → **SMTP Settings**: host `smtp.resend.com`, port 465, user `resend`, password = Resend API key, sender `no-reply@<domain>` with a friendly name ("Atlas Rewards").
4. Authentication → **Email Templates**: reword Reset Password / Confirm Signup / Invite in the Atlas voice (the CP-47 reset pages already handle the app side).
5. Test: trigger a reset from `/forgot-password` on a Gmail address → arrives in inbox, not spam.
6. Later, mobile deep-linking of reset links is handled in the Capacitor checkpoint (Universal Links catch the reset URL).

## Apply
1. Run `cp75_migration.sql` in the Supabase SQL editor (after cp74).
2. Deploy.
3. Verify:
   - Test customer **with a referral row** can delete their account from Profile.
   - A manager attempting deletion gets the friendly staff error.
   - `/account/delete` renders.
   - `select * from app_config;` → one row.
