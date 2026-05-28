# Checkpoint 1 — Foundation

Everything in this folder is the spine the rest of Atlas Rewards hangs off. Run the SQL files in order against your Supabase project and you'll have a working multi-tenant rewards database with row-level security enforcing the agency / manager / customer split.

## What you have

```
checkpoint-01-foundation/
├── 01_schema.sql      → tables, columns, indexes, triggers, profile auto-create
├── 02_rls.sql         → row-level security policies (the 3-tier access wall)
├── 03_functions.sql   → award_points, enroll_member, recalc_tier, resolve_business_by_slug
├── 04_seed_demo.sql   → one demo business + 4 sample rewards so you can see it working
├── 05_routing.md      → how joesgym.atlasrewards.app actually works
└── README.md          → this file
```

## How to install (10 minutes)

1. **Create a Supabase project** at supabase.com (free tier is fine for now).
2. Project → **SQL Editor** → New query.
3. Paste in `01_schema.sql`, click Run. Should see "Success. No rows returned."
4. Repeat for `02_rls.sql`, then `03_functions.sql`, then `04_seed_demo.sql`.
5. Project → **Table Editor** → confirm you see 12 tables and the `demo` business in `businesses`.

## How to enable the auth methods

Supabase dashboard → **Authentication → Providers**:

- **Phone** → enable, then connect Twilio (or use Supabase's built-in SMS at higher tiers). The phone-OTP flow is the default for new customers.
- **Google** → enable, paste your Google OAuth client ID/secret (Google Cloud Console, takes ~5 min to set up).
- **Apple** → enable when ready (requires Apple Developer account, $99/yr — fine to skip until just before launch).
- **Email** → enable email/password as the fallback. Disable "confirm email" for dev, re-enable for production.

**Persistent sessions** are on by default — Supabase issues a 60-day refresh token that auto-rotates. Customer signs in once, stays signed in until they explicitly sign out or 60 days of inactivity pass.

## How the three-tier RLS actually works

Three roles, all enforced at the database:

- **Agency admin** (you): rows in `business_users` with `role='agency_admin'` and `business_id=NULL`. Can see and modify everything across all businesses.
- **Business manager** (your client — the salon owner, the gym manager): rows in `business_users` with `role='business_manager'` and `business_id=<their business>`. Can only see/modify their own business's data.
- **Customer** (end user): no row in `business_users`. Has rows in `business_memberships` for each business they belong to. Can only see their own membership rows and the public-facing rewards catalog.

A customer trying to query another business's members will get an empty result, not an error — RLS just silently filters them out. There's no application-layer "is this user authorized" check needed; the database refuses to return the rows.

## How to create your agency admin user

After signing yourself up through the app or Supabase auth UI:

```sql
insert into public.business_users (user_id, role)
values ('<your auth.users.id>', 'agency_admin');
```

Now you're the agency admin and can see/edit everything.

## How to test the foundation works

In SQL Editor, run:

```sql
-- Should return the demo business
select * from public.resolve_business_by_slug('demo');

-- Should return the 4 rewards (you'll need to be signed in or use service_role)
select name, point_cost from public.rewards
 where business_id = (select id from public.businesses where slug='demo');

-- Simulate a customer earning points
-- (replace the IDs with real ones after signing up a test member)
-- select * from public.award_points('<membership_id>', 200, 'review', null, 'test-1', 'Test review');
```

## What's NOT in this checkpoint (and why)

- **Customer UI** — that's Checkpoint 3. The schema is ready for it.
- **Brand customization UI** — Checkpoint 2 builds the agency-side editor; the schema columns already exist.
- **Edge functions for webhooks** — Checkpoint 11. We defined `webhook_endpoints` so the schema is forward-compatible.
- **Push / SMS sending** — Checkpoint 12.

## Approval gate

Once you've run the SQL and confirmed the tables + demo business exist, that's checkpoint 1 done. Ping me and we'll start Checkpoint 2 (brand customization engine).
