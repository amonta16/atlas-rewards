# Checkpoint 31 — Team invites + backend hardening

Three workstreams in one ship: role-gated team invitations via
magic link, an app-wide toast system to replace `alert()`, and a
fresh-project runbook covering CP-03 → CP-31.

## What Andrew asked for

1. **Managers can create front-desk login accounts.**
2. **Agency admin (Andrew) can add assistant-admin accounts** with
   the same ability.
3. Backend hardening to call this thing launch-ready.

Bundle plan we locked: agency-admin → can invite anyone; manager →
can invite front-desk staff for their own business only. Magic-link
email by default.

## What CP-31 ships

### 1. Team invitation flow (SQL + API + UI)

#### SQL (`cp31_migration.sql`)

New `pending_invitations` table:

```
id, email, business_id, role, token, invited_by, expires_at,
accepted_at, accepted_by, revoked_at, created_at
```

with an `EXCLUDE` constraint preventing two open invites for the
same `(email, business_id, role)` triple.

Five RPCs (all `SECURITY DEFINER`, role-gated, idempotent):

- `create_invitation(email, role, business_id)` — checks caller's
  permissions, inserts row, returns `(id, token)`. Refuses
  `agency_admin` invites from non-admins; refuses non-staff invites
  from managers.
- `accept_invitation(token)` — validates token (not revoked,
  not expired, email matches signed-in user), upserts the
  `business_users` row, marks accepted. Idempotent.
- `revoke_invitation(token)` — marks invite as revoked. Caller must
  be the inviter, an agency_admin, or the business's manager.
- `remove_team_member(user_id, business_id, role)` — deletes a
  `business_users` row. Self-removal prevented.
- `list_team_members(business_id)` — returns active members +
  pending invitations for a business (pass `NULL` for the agency
  team). Returns `kind`, `status`, `role`, `token` columns.

RLS on `pending_invitations`: agency_admin sees all; manager sees
invites for their business; everyone else sees nothing.

#### API routes (`/app/api/team/`)

- **POST `/api/team/invite`** — calls `create_invitation` then
  `supabase.auth.admin.inviteUserByEmail()` with redirect URL
  `${origin}/accept-invitation/<token>`. Falls back to
  `generateLink({ type: "magiclink" })` if the user is already in
  `auth.users`.
- **POST `/api/team/accept`** — calls `accept_invitation` and
  returns role + business_id so the client can route to the right
  dashboard.
- **POST `/api/team/revoke`** — thin wrapper over `revoke_invitation`.

`lib/supabase/admin.ts` — service-role client factory (cached
singleton). Required env var `SUPABASE_SERVICE_ROLE_KEY`.

#### UI

- **`components/team/team-members.tsx`** — list component used by
  both agency and manager dashboards. Active members + Pending
  invitations sections + collapsed Expired/Revoked. Each row has
  role pill (Crown / Shield / User), 3-dot menu with Remove or
  Revoke.
- **`components/team/invite-member-modal.tsx`** — email + role
  picker. Role options are filtered by caller's permissions.
- **`/agency/team/page.tsx`** — agency-side Team page. Redirects
  away non-admins.
- **Sidebar entry**: "Team" link added to the agency sidebar.
- **Manager dashboard tab**: "Team" tab added (visible only to
  `business_manager` / `agency_admin`). Renders `TeamMembers`
  scoped to that business.

#### Accept-invitation landing

- **`/accept-invitation/[token]/page.tsx`** — server component.
  Redirects unauthenticated users to `/login?next=...`.
- **`accept-invitation-client.tsx`** — calls `/api/team/accept`,
  toasts success, routes to `/agency` or `/<slug>/manage` based
  on role.
- The agency login page now respects `?next=…` query param so the
  post-login redirect bounces back to the accept page.

### 2. Toast system (`components/ui/toast.tsx`)

Tiny zero-dependency `ToastProvider` mounted at the root layout.
Used everywhere going forward via:

```tsx
const { toast } = useToast();
toast.success("Invite sent!");
toast.error("Couldn't send invite.");
```

CP-31 wires it into the new team flows. Existing `alert()` calls
across the agency / manager components will be migrated to
`toast.error()` in CP-32 polish; the new TeamMembers / Invite flow
uses it natively.

### 3. Fresh-project runbook (`RUNBOOK.md`)

Lists every SQL migration in order (CP-03 → CP-31), prerequisites
(`pgcrypto`, `btree_gist`, `uuid-ossp`), env vars (including the
new `SUPABASE_SERVICE_ROLE_KEY`), and smoke-test queries.

Rather than concatenate ~30 migration files into one giant SQL
blob (impossible to maintain), the runbook is a clean index of
what to paste in what order. Every migration in the project is
already idempotent so re-runs are safe.

Also covers the Supabase Auth SMTP + redirect-URL configuration
the team-invite magic links require.

## Files added/touched

```
checkpoint-31-team-invites-and-hardening/cp31_migration.sql      (new)
checkpoint-31-team-invites-and-hardening/RUNBOOK.md              (new)
checkpoint-31-team-invites-and-hardening/README.md               (new)
lib/supabase/admin.ts                                            (new)
app/api/team/invite/route.ts                                     (new)
app/api/team/accept/route.ts                                     (new)
app/api/team/revoke/route.ts                                     (new)
app/accept-invitation/[token]/page.tsx                           (new)
app/accept-invitation/[token]/accept-invitation-client.tsx       (new)
app/(agency)/agency/team/page.tsx                                (new)
components/team/team-members.tsx                                 (new)
components/team/invite-member-modal.tsx                          (new)
components/ui/toast.tsx                                          (new)
app/layout.tsx                                                   (mount ToastProvider)
components/agency/sidebar.tsx                                    (add Team link)
components/manager/manager-dashboard.tsx                         (add Team tab)
app/(agency)/login/page.tsx                                      (respect ?next=)
```

## SQL to run

1. Apply `cp31_migration.sql` in the Supabase SQL editor.
2. (One-time fresh project) follow `RUNBOOK.md` for the full
   CP-03 → CP-31 sequence.

Verify:

```sql
SELECT proname FROM pg_proc WHERE proname IN (
  'create_invitation','accept_invitation','revoke_invitation',
  'remove_team_member','list_team_members'
);

SELECT * FROM public.list_team_members(NULL);  -- as agency_admin
```

## Env vars added

```
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Used by `lib/supabase/admin.ts` to send invitation emails via
`auth.admin.inviteUserByEmail`. Get it from Supabase dashboard →
Project Settings → API → service_role key. **Never** expose this
in client code.

## Supabase Auth config

For team invites to deliver real email in production:

1. Project Settings → Auth → **SMTP**: configure your sender
   (SendGrid, Resend, AWS SES, etc.).
2. Project Settings → Auth → **URL Configuration**:
   - Add `https://<your-domain>/accept-invitation/*` to the
     redirect allow-list.
   - Set Site URL to your production URL.

Without these, the magic-link email either won't send or will
redirect to localhost.

## What's next

CP-32 — the rest of the hardening: migrate every remaining
`alert(...)` call to `toast.error(...)`, audit RLS on the half-
dozen tables that haven't been touched since their initial
checkpoint, add UNIQUE / FK / trigger guards against duplicates
and orphans (idempotency-key collisions, abandoned ledger entries,
etc.).

Then CP-33 — admin tab agency-wide controls (per-sub-account
toggles, MRR view, all-clients leaderboard, plan/seat management)
unless you re-prioritize.
