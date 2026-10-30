# Checkpoint 62 — VA (Virtual Assistant) agency role

A new agency-side role, **`agency_va`**, with the same reach as an agency admin
over the **Apps deck** (create businesses, open/edit them, organize folders) but
two hard restrictions:

- **Can't delete a business.** The trash button files a **delete request** with a
  **required reason note**. An agency admin approves (business is deleted) or
  declines it — reviewed right on the Apps page.
- **Can't see the admin portal's Analytics, Pipeline, Team, or Settings.** Those
  tabs are hidden from the sidebar and blocked at the route level.

Everything else a VA does is identical to an admin.

---

## Apply the SQL

Run these in the Supabase SQL editor, in order (both idempotent):

1. **`cp62_migration.sql`** — the role, delete-requests, and route/invite plumbing (apply after cp60).
2. **`cp62_1_permissions_fix.sql`** — lets VAs upload images + save memberships/rewards/offers (apply after cp62).

> **CP-62.1 — why:** CP-62 opened the `businesses` table to VAs, but the rest of
> the app-builder (memberships, rewards, offers, news, image uploads) is gated by
> `is_business_manager()` / `staffs_business()` and an admin-only storage policy —
> none of which knew about VAs. 62.1 widens those helpers to treat a VA like an
> admin for per-business app data, and rebuilds the image-upload policy to include
> VAs. **Side effect:** a VA is now manager-level on every business, so if one
> navigates directly to a business's manager portal (`/<slug>/manage`) they could
> see that business's insights. Consistent with "same as admin"; tell me if you
> want that tightened.

What it does:

1. Widens the `role` CHECK constraint on `business_users` + `pending_invitations`
   to allow `agency_va`.
2. Adds `is_agency_va()` / `is_agency_staff()` helpers.
3. Opens `create_business` + `save_business_baseline` to staff (admin **or** VA).
4. RLS: VAs can read/insert/update `businesses` + `business_folders`. **No**
   staff DELETE policy — a VA's delete is denied at the row level. Admin delete
   is untouched.
5. New `business_delete_requests` table + RPCs:
   `request_business_delete`, `list_business_delete_requests`,
   `approve_business_delete`, `reject_business_delete`.
6. Teaches `team_invite_precheck`, `attach_team_role`, `create_invitation`, and
   `list_team_members` about `agency_va` (admin-only to invite).

---

## Create a VA

Agency → **Team** → **Invite** → pick **"VA (assistant)"** → set email +
password (or auto-generate). Hand them the credentials; they sign in at `/login`
like an admin. VAs show up on the Team page with a **VA** badge and can be
removed there.

---

## How the delete flow works

**As a VA:** the trash icon on an app opens **"Request deletion"** — a required
reason note, then *Send request*. The tile then shows a **"Delete requested"**
pill. Re-requesting updates the existing pending request instead of duplicating.

**As an admin:** a **"Delete requests waiting on you"** panel sits at the top of
the Apps page with a count badge. Each row shows the business, the reason, and
who asked. **Approve delete** runs the real cascade delete; **Decline** closes it
with an optional note back to the requester.

---

## Files changed (app)

- `app/(agency)/agency/page.tsx` — allow admin **or** VA; load delete requests.
- `app/(agency)/agency/layout.tsx` — resolve agency role, pass to sidebar.
- `app/(agency)/agency/pipeline/page.tsx` — admin-only guard (was open).
- `app/(agency)/agency/settings/page.tsx` — admin-only guard (was open).
- `components/agency/sidebar.tsx` — hide admin-only tabs for VAs.
- `components/agency/apps-admin-client.tsx` — role-aware delete + admin panel.
- `components/agency/request-delete-modal.tsx` — **new**, note-required request.
- `components/agency/delete-requests-panel.tsx` — **new**, admin approve/decline.
- `components/team/invite-member-modal.tsx` — VA role option.
- `components/team/team-members.tsx` — VA icon/label.
- `app/api/team/create-account/route.ts` — accept `agency_va`, `/login` routing.

> Analytics + Team pages already gated on `agency_admin`, so VAs were blocked
> there with no change needed.

---

## Test checklist

- [ ] Invite a VA from Team → sign in as them at `/login`.
- [ ] VA sidebar shows **only "My Apps"** (no Analytics/Pipeline/Team/Settings).
- [ ] Visiting `/agency/analytics`, `/agency/pipeline`, `/agency/settings`,
      `/agency/team` as the VA redirects/blocks back to the Apps deck.
- [ ] VA can **Add Business** and open/edit an app + move it between folders.
- [ ] VA trash → request modal requires a reason; sending shows the pending pill.
- [ ] As admin, the Apps page shows the request; **Approve** deletes the business,
      **Decline** clears it.

---

## Ship it

Files are already in your working folder. Nothing was committed from here — run
these yourself from the project root:

```bash
cd "C:/Users/andre/OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git add checkpoint-62-va-role "checkpoint-02-brand-engine/atlas-rewards-app"
git commit -m "CP-62: VA agency role — create/manage apps, request-to-delete with admin approval, no analytics"
git push
```
