# Checkpoint 8 — Birthday + milestone + reactivation rewards

The first checkpoint that lives mostly server-side. Scheduled jobs auto-fire bonuses based on time triggers — no manager intervention needed.

## What got built

**Backend — `01_milestones_and_cron.sql`:**
- Enables the `pg_cron` extension
- Adds `milestone_rules` JSONB to `businesses`, default `{"5": 100, "10": 250, "25": 500, "50": 1000, "100": 2500}`
- Adds `reactivation: 150` to default `point_rules`
- **Upgrades `award_points`** to:
  - Bump `visit_count` and `last_visit_at` when rule_type is `visit` or `purchase`
  - Auto-flip `status='dormant' → 'active'` if a dormant member transacts
  - Check `milestone_rules` after every visit/purchase and auto-fire a milestone bonus when a threshold is hit (recursive call with unique idempotency key)
- **`process_birthdays()`** — finds members whose profile birthday matches today (UTC), awards `point_rules.birthday`, skips anyone already awarded this year
- **`process_dormancy()`** — flags members `status='dormant'` after 60 days without a visit
- Both functions are scheduled via pg_cron to run daily

**Backend — `02_update_profile.sql`:**
- `update_my_profile(name, phone, birthday)` — RPC so the customer can set their birthday from the app

**Customer side:**
- **Profile tab is now editable** — tap "Edit" in the header → name, phone, birthday picker (date input), Save
- Birthday row shows "Set to earn a yearly bonus" if missing, the actual date if set
- Helper text under the birthday field: "You'll earn +X points automatically on your birthday"
- All editable inline; no modal

## How to install (2 min)

### 1. Schema + cron

Supabase SQL Editor → New query → paste and run `01_milestones_and_cron.sql`. 

**Note on pg_cron:** Supabase supports pg_cron on all tiers but it sometimes needs to be enabled first. If the `create extension if not exists pg_cron` line errors:
- Dashboard → **Database → Extensions**
- Search for `pg_cron`, toggle it **ON**
- Re-run the SQL

### 2. Profile update RPC

In a new SQL Editor query, paste and run `02_update_profile.sql`.

### 3. Restart dev

Ctrl + C → `npm run dev`.

## How to test (since you can't wait a day for the cron)

### Test milestones (immediate, event-driven)

1. Customer: note their `visit_count` — visit the manager app → "Type code" → enter the customer's code → award via **Purchase amount $1** (counts as a visit). visit_count goes up by 1.
2. Repeat 4 more times for 5 total visits.
3. On the 5th visit, the milestone fires automatically: customer gets a confetti burst for **+100 points (visit #5 milestone)** on top of the regular purchase points.

To make this faster, lower the threshold in `milestone_rules` for one business. SQL:
```sql
update public.businesses
   set milestone_rules = '{"2": 50}'::jsonb  -- milestone at 2 visits
 where slug = 'demo';
```
Then 2 purchases triggers the milestone.

### Test birthday (manual invocation)

1. Set your customer's birthday to today via the Profile tab (Edit → date picker → Save)
2. In SQL Editor, manually call the cron job:
   ```sql
   select public.process_birthdays();
   ```
3. The number returned = how many people got birthday bonuses. Customer instantly sees confetti via the existing Realtime watcher.

### Test dormancy

1. Manually backdate a member's `last_visit_at`:
   ```sql
   update public.business_memberships
      set last_visit_at = now() - interval '70 days'
    where id = '<their membership id>';
   ```
2. Run the dormancy check:
   ```sql
   select public.process_dormancy();
   ```
3. Customer's `status` is now `'dormant'`. The next time the manager awards them via Purchase, the customer automatically flips back to `'active'` (and CP 12 will fire a "Welcome back" SMS).

## What's NOT in CP 8

- **Reactivation SMS / push** — the dormancy job marks status only; sending the customer a comeback offer happens in CP 12 when we wire up the messaging providers
- **Agency-side milestone editor** — the `milestone_rules` field is in the schema but the brand editor doesn't have a UI for it yet. The defaults (5, 10, 25, 50, 100 visits) are sensible for now. Editor UI lands in CP 9.
- **Anniversary bonus** — schema doesn't have it yet; can add a `process_anniversaries()` cron later

## Approval gate

Once you've tested at least one of: a milestone firing on the Nth visit, OR `process_birthdays()` triggering for a member whose birthday is today, CP 8 is done. Next is **CP 9 — widget toggle builder** (the agency-side configurator that gives the business owner control over which features are on and lets you set all the points/milestones/etc. visually).
