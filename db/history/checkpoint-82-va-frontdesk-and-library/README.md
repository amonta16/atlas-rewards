# CP-82 — VA front-desk access + image-library uploads

Fixes the two errors the VA hit:

| Error she saw | What she was doing | Cause |
|---|---|---|
| `permission denied: business_manager required` | opening a business's **front desk**, saving a membership | `is_business_manager()` only knew `agency_admin` + that business's own manager |
| `new row violates row-level security policy` | **uploading a photo** into the shared image library | CP-64's library policies let only `agency_admin` write to the `image_library` table and the `image-library` bucket |

Both were supposed to be fixed by `cp62_1_permissions_fix.sql` (CP-62.1) and
`cp64_1_library_uploads.sql` (CP-64.1). The errors prove at least one of those
never got run in Supabase. **`cp82_va_permissions.sql` is self-contained** — it
re-asserts everything those two files did, plus the new CP-82 bits. Run it on
its own; you don't need to find the older files.

---

## 1. Run the SQL

Supabase → SQL Editor → paste `cp82_va_permissions.sql` → Run. Idempotent, safe
to re-run.

It does:

1. Makes `agency_va` a legal value in the `business_users` / `pending_invitations` role CHECK (no-op if CP-62 ran).
2. (Re)creates `is_agency_va()` + `is_agency_staff()`.
3. Teaches **`is_business_manager()`**, **`staffs_business()`** and **`manages_business()`** about VAs — this is the fix for "business_manager required". It also means `current_app_role()` hands a VA the full manager tab set on the desk instead of the front-desk subset.
4. Rebuilds the per-business image bucket policy (hero/logo/reward/offer/news/membership) so the agency branch is admin **or** VA.
5. `image_library` table: adds INSERT + UPDATE policies for `agency_admin` + `agency_va`. DELETE stays admin-only.
6. `image-library` bucket: adds INSERT + UPDATE policies for `agency_admin` + `agency_va`; public read re-asserted.

### Verify after running

The SQL file ends with copy-pasteable verification queries. **Run query (a)
first** — it confirms she actually has an `agency_va` row in `business_users`.
If that comes back empty, no amount of policy work will help; the insert
snippet to add the role is right there in the file.

## 2. Deploy the app changes

Two files changed:

- `app/[business]/manage/layout.tsx` — the front-desk route gate now accepts
  `agency_va` alongside `agency_admin`. Without this she gets the "Manager
  access required" card before any SQL is ever consulted.
- `app/[business]/login/page.tsx` — a VA signing in from a business login URL
  now routes to `/manage` instead of the customer app.

The UI gate and the SQL are two halves of one fix — shipping only the UI change
trades the access card for RLS errors on the desk, and shipping only the SQL
leaves her staring at the access card.

---

## What the VA can do after this

- Open **`/<slug>/manage`** — the front desk — for any business, with the same
  tabs an agency admin sees (Front desk, Users, Insights, Offers, News,
  Billing, Membership, Team). The "Front desk" button in the brand editor now
  works for her.
- Scan / award / redeem, save memberships, edit offers, news and rewards.
- **Choose from library** in every builder image field.
- **Upload** her own photos into the library — existing niche or a new one —
  and soft-hide / retitle library rows.

## What she still can't do (unchanged)

- Delete a business (still the request-to-delete → admin approval flow).
- Agency Analytics / Pipeline / Team / Settings.
- Approve delete requests.
- Hard-delete rows out of the image library.

## Note worth knowing

`manages_business()` now returns true for VAs, which means a VA on a business's
**Team** tab can create front-desk PIN logins and reset member passwords for
that business. That follows from "VA = admin over the apps she builds" — but if
you'd rather she not have account-creation power, say so and I'll split that
helper back out so PIN tools stay admin/manager-only.
