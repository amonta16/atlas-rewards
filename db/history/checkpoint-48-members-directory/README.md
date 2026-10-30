# CP-48 — front-desk Users directory + member password reset

Apply `cp48_migration.sql` in the Supabase SQL editor, then deploy.

## What this adds
A new **Users** tab on the manager/front-desk portal (visible to front-desk
staff too) that lists **every app user** of the business. Click any row to
open the same member panel you get from a QR scan — award points, see
history, and now **reset their password**. Useful as a support/debug surface,
especially as a stopgap until the email-based reset (CP-47) is live with SMTP.

### Revision notes
- `list_business_members` returns columns with explicit `::text` casts —
  `profiles.email` is `citext`, which otherwise trips "structure of query
  does not match function result type." It also returns `is_vip`
  (`membership_payment_status = 'paid'`), shown as a gold **VIP** chip in the
  list.
- Insights (Atlas Impact + revenue/transactions graphs) now live **only in
  the Insights tab**, not the Front-desk tab. The desk stays ops-focused.
  (Front-desk staff don't have an Insights tab, so they don't see revenue.)

### Pieces
- `list_business_members(business, limit, offset)` RPC — all members + VIP
  flag, staff-gated. (`search_members` only handles typed queries / caps at 10.)
- `components/manager/members-directory.tsx` — the list + client-side search.
- New **Users** tab in `manager-dashboard.tsx`; clicking a member reuses the
  existing `AwardPointsPanel`.
- `components/manager/member-password-reset.tsx` — an "Account access" card
  inside the member panel.
- `POST /api/team/reset-member-password` + `staff_can_manage_member(user_id)`
  RPC — sets a new password via the Admin SDK, gated to agency_admin or a
  manager/front-desk of a business the member belongs to.

## Important: you can't display a member's CURRENT password
Supabase (like any sane auth system) stores only a one-way **bcrypt hash** of
the password. The plaintext is mathematically unrecoverable — not by staff,
not by an admin, not even by us. So the panel does **not** show the current
password; it lets staff **set a new one** and shows that once to share. The UI
says this plainly so it doesn't look like a missing feature.

## Security note
This lets front-desk staff set a new password for any member of their
business (and read the new one), which is effectively account-takeover power.
That's intentional for your stopgap support need. Once the email self-serve
reset (CP-47) is fully live, consider restricting this to managers/admins
only — flip the tab/route gate from `staffs_business` to `is_business_manager`
if you want front-desk staff to see the directory but not reset passwords.
