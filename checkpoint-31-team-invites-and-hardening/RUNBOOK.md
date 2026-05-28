# Atlas — Fresh-project SQL runbook (CP-03 → CP-31)

Use this when standing up Atlas on a brand-new Supabase project.
Every migration is idempotent (uses `IF NOT EXISTS` / `DROP+CREATE` /
`ON CONFLICT DO NOTHING`), so re-running the same file is safe.

## Prerequisites

In the new Supabase project, enable these extensions in
**Database → Extensions** (or they'll be created by the first
schema file anyway):

- `pgcrypto` (for `gen_random_uuid`)
- `btree_gist` (for the CP-31 invitation uniqueness constraint)
- `uuid-ossp` (for `uuid_generate_v4`, used by the original CP-01
  schema)

## Run order

Paste each file's contents into the Supabase **SQL editor** and click
Run. The order matters: later checkpoints assume earlier ones.

| # | File                                                                | What it does                          |
|---|---------------------------------------------------------------------|---------------------------------------|
| 1 | `checkpoint-01-foundation/01_schema.sql`                            | Core tables (businesses, profiles, ledger, rewards, redemptions, business_users, etc.) |
| 2 | `checkpoint-01-foundation/02_rls.sql`                               | Base RLS policies + role helpers (is_agency_admin, staffs_business) |
| 3 | `checkpoint-01-foundation/04_seed_demo.sql`                         | Demo business + seed data (skip on prod) |
| 4 | `checkpoint-02-brand-engine/atlas-rewards-app/supabase/storage-setup.sql` | Logo storage bucket |
| 5 | `checkpoint-03-customer-and-manager/01_schema_addition.sql`         | my_membership, resolve_member_by_code |
| 6 | `checkpoint-04-realtime-rules/01_enable_realtime.sql`               | Add tables to supabase_realtime publication |
| 7 | `checkpoint-05-redemption/01_redemption_rpcs.sql`                   | Reward redemption flow                |
| 8 | `checkpoint-07-reviews/01_review_rpcs.sql`                          | Google review submit + verify         |
| 9 | `checkpoint-08-milestones/01_milestones_and_cron.sql`               | Milestone awards + birthday cron      |
|10 | `checkpoint-08-milestones/02_update_profile.sql`                    | update_my_profile RPC (profiles table) |
|11 | `checkpoint-09-agency-builder/01_storage_and_rpcs.sql`              | Agency builder support tables         |
|12 | `checkpoint-10-analytics/01_analytics_and_logo_fix.sql`             | Analytics rollup RPC                  |
|13 | `checkpoint-11-webhooks/01_webhooks.sql`                            | Webhook delivery infra                |
|14 | `checkpoint-12-launch/01_automation_rpcs.sql`                       | Automation rule plumbing              |
|15 | `checkpoint-13-fixes/01_fixes.sql`                                  | Bug fixes (CP-13)                     |
|16 | `checkpoint-14-bug-fixes/01_storage_all_buckets.sql`                | All other storage buckets             |
|17 | `checkpoint-14-bug-fixes/02_schema_news_and_membership.sql`         | News table + early membership schema  |
|18 | `checkpoint-15-templates-and-toggles/01_widget_config_migration.sql`| Widget toggle groups                  |
|19 | `checkpoint-16-booking/01_booking_schema.sql`                       | (Legacy — booking now removed)        |
|20 | `checkpoint-17-ghl-booking/01_ghl_and_images.sql`                   | GHL webhook integration               |
|21 | `checkpoint-17-ghl-booking/02_billing_schema.sql`                   | Agency billing tables                 |
|22 | `checkpoint-18-engagement/01_automated_offers_and_mystery.sql`      | Automated offer templates + cron      |
|23 | `checkpoint-18-engagement/02_analytics_and_winback.sql`             | Come-back AI tables                   |
|24 | `checkpoint-19-streaks/01_streaks.sql`                              | Streak config + check_in_events       |
|25 | `checkpoint-20-fixes/01_fixes.sql`                                  | Bug fixes (CP-20)                     |
|26 | `checkpoint-21-offers-fix/01_upsert_offer.sql`                      | upsert_offer RPC + RLS                |
|27 | `checkpoint-22-membership-and-roles/01_roles_and_membership.sql`    | is_business_manager + membership benefit fields |
|28 | `checkpoint-23-membership-hotfix/01_membership_and_storage.sql`     | Self-contained membership hotfix      |
|29 | `checkpoint-24-fixes/01_realtime_and_offer_fallback.sql`            | Realtime publication + featured_offer fallback |
|30 | `checkpoint-25-enrollment-and-streak/01_*` (if present)             | enroll_member hotfix                  |
|31 | `checkpoint-28-cp28-ui-polish-and-points-only/cp28_migration.sql`   | Birthday lock + cash credit zero-out  |
|32 | `checkpoint-29-automated-offers-revamp/cp29_migration.sql`          | voice_message_url + st_patricks       |
|33 | `checkpoint-29-automated-offers-revamp/cp29_1_popup_and_discount.sql`| Discount propagation + list_active_offers |
|34 | `checkpoint-30-manager-ops-and-scanner/cp30_migration.sql`          | search_members + manager_daily_recap + reverse_last_award |
|35 | `checkpoint-31-team-invites-and-hardening/cp31_migration.sql`       | pending_invitations + invite RPCs     |

Files not listed (e.g. CP-06 fixes that became no-ops, CP-26/27 which
were UI-only with no SQL) intentionally have no entry.

## Verifying a fresh-project install

After running everything, smoke-test:

```sql
-- Tables exist
SELECT count(*) FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'businesses', 'profiles', 'business_users', 'business_memberships',
    'points_ledger', 'rewards', 'redemptions', 'offers',
    'business_automated_offers', 'automated_offer_templates',
    'streak_config', 'check_in_events', 'pending_invitations'
  );  -- should be 13

-- Core RPCs callable
SELECT count(*) FROM pg_proc WHERE proname IN (
  'is_agency_admin','is_business_manager','staffs_business',
  'current_app_role','resolve_member_by_code','quick_award',
  'award_points','my_membership','featured_offer',
  'list_automated_offers_for_business','upsert_business_automated_offer',
  'trigger_automated_offers','search_members','manager_daily_recap',
  'reverse_last_award','create_invitation','accept_invitation',
  'list_team_members'
);  -- should be 18+

-- Storage buckets present
SELECT id, public FROM storage.buckets ORDER BY id;
-- expect: business-logos, business-heroes, reward-images, offer-images,
--         news-images, membership-images, voice-messages
```

## Env vars to set in Vercel / your hosting

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # NEW in CP-31 — used by /api/team/invite
STRIPE_SECRET_KEY=<sk_live_...>
STRIPE_WEBHOOK_SECRET=<whsec_...>
GHL_API_KEY=<from-GHL-dashboard>               # optional, per-business
```

## Supabase auth config for team invites

The CP-31 `/api/team/invite` route calls
`supabase.auth.admin.inviteUserByEmail()` which sends a magic link
through the project's configured email provider. For local dev
this uses the built-in Supabase inbucket; for prod you'll want a
real SMTP provider configured in **Project Settings → Auth → SMTP**.

The magic link redirects to
`https://<your-domain>/accept-invitation/<token>` — that's hardcoded
based on the request `origin` so you don't have to set it anywhere.
But make sure your production domain is in
**Project Settings → Auth → URL Configuration → Site URL + redirect
allow-list**, otherwise Supabase will block the magic-link redirect.
