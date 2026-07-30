# CP-86 — Front-desk fixes & upgrades

Andrew's July 29 front-desk review pass: deduct-points error, tier labels,
inactive members never working, PIN login broken, member visibility on scan,
membership passes, and announcements.

## What shipped

### 1. Deduct points — FIXED (SQL)
`new row for relation "points_ledger" violates check constraint
"points_ledger_rule_type_check"` — the CP-85 raffle migration rebuilt the
rule-type CHECK, but its list is missing `manual_removal` (what
`manager_remove_points` writes) plus other server-set types
(`winback_bonus`, `signup_bonus`, `streak_milestone`…). CP-86 drops the
constraint again, per the CP-44.1 doctrine (rule_type is only ever written
by SECURITY DEFINER RPCs — the enum adds no safety). **Do not re-add it.**

### 2. Bronze/Silver/Gold tier labels — REMOVED
Tiers were removed from the customer app in CP-73; the front desk still
said "140 pts · Gold". The award panel and the Users directory now just
say "pts".

### 3. Inactive members (60d+) — WORKS NOW
Root cause: the live DB was missing the `inactive_members` RPC (and
friends), and the error was swallowed → permanent "No one's inactive —
nice retention 👏". CP-86:
- Re-asserts `inactive_members` (v2): counts members whose last check-in
  is older than the window **or who never checked in** and joined longer
  than the window ago. Returns `joined_at` for the "Never checked in ·
  joined May 3" row copy.
- Adds a window picker (7/14/30/60/90 days — 60 stays the default) so
  newer businesses can actually use the list.
- Surfaces RPC errors in the card instead of rendering an empty list.
- Re-asserts `send_winback` + `customer_messages` (+ realtime) so the
  "We miss you" composer (bonus points + message, per-member or send-all,
  with instant push via /api/notifications/push-now) actually delivers.

### 4. Member badge on scan (front desk)
New `member_vip_status` RPC + a gold **MEMBER · <plan>** strip on the
award panel the moment a member is scanned/selected — with the expiry date
("Expires Sep 12, 2026") or "Active — renews monthly". A lapsed pass shows
an amber "Membership expired — offer them a renewal" strip. `is_vip`
everywhere now honors pass expiry.

### 5. Membership passes (bigger upfront orders)
- Manager → Membership tab → new **Plans & passes** card: toggle the
  recurring monthly plan on/off and add up to 6 one-time passes
  (1/3/6/12 months, each with its own price and label).
- Customer join modal shows a plan picker (Monthly vs passes); the CTA and
  price follow the selection.
- In-person / external-link: `request_membership_v2` snapshots the chosen
  plan server-side; the gold pending-membership queue shows exactly what
  to charge ("1-Year Pass · $99.00 (12 mo)"); Activate stamps
  `membership_expires_at` from the pass length.
- Stripe: a pass runs a one-time `mode=payment` Checkout (price re-read
  from the DB, never from the client); the webhook applies plan + expiry
  via the service-role `apply_membership_purchase` RPC.
- Customer membership card shows **Expires <date>** for passes (monthly
  keeps "Renews").

### 6. Announcements (manager-only)
- New **Announcement** card on the Front desk tab — managers/agency only,
  never rendered for business_staff (SQL RPCs are manager-gated too).
- One live message per business, duration 1 day / 3 days / 1 week / until
  cleared; posting a new one replaces the old one.
- Customers see a branded, dismissible megaphone banner on every tab
  (realtime — appears/clears without refresh; dismissal is per-device and
  a replaced message re-appears).
- Optional push + bell notification via new
  `/api/notifications/announce-message` (manager-gated, tenant-scoped
  push, same proven path as announce-offer).

### 7. Front-desk PINs — FIXED (SQL)
`Could not find the function public.set_my_front_desk_pin(...) in the
schema cache` — the live DB is missing the whole CP-49 Part A (which also
explains keypad logins failing: `verify_front_desk_pin` is missing too).
CP-86 re-asserts everything idempotently: `front_desk_pins`,
`front_desk_throttle`, `manages_business`, `set_front_desk_pin`,
`set_my_front_desk_pin`, `list_front_desk_pins`, `remove_front_desk_pin`,
`verify_front_desk_pin` (service-role only).

## Apply

1. **Run `cp86_migration.sql`** in the Supabase SQL editor (one paste,
   idempotent, self-contained — includes `notify pgrst, 'reload schema'`).
2. Deploy the app (git push → Vercel).

## Files touched

**SQL:** `checkpoint-86-frontdesk-fixes/cp86_migration.sql`

**NEW:** `components/manager/announcement-composer.tsx`,
`components/customer/announcement-banner.tsx`,
`app/api/notifications/announce-message/route.ts`

**MOD:** `components/manager/award-points-panel.tsx`,
`members-directory.tsx`, `insights-dashboard.tsx`,
`membership-billing-setup.tsx`, `pending-memberships-queue.tsx`,
`manager-dashboard.tsx`, `components/customer/membership-join-modal.tsx`,
`membership-section.tsx`, `app/[business]/app/layout.tsx`,
`app/api/[business]/membership/checkout/route.ts`,
`app/api/[business]/membership/webhook/route.ts`

## Verified

Full cloud-mirror `tsc --noEmit` (npm install + project tsconfig, matching
the Vercel gate): **0 errors**. Note: `package-lock.json` is still out of
sync with `package.json` (`npm ci` fails — Capacitor deps missing from the
lock, found in CP-85); run `npm install` locally and commit the refreshed
lockfile when convenient.
