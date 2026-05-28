# Checkpoint 32 — Atlas Impact, manager invites, review hotfix, in-app notifications + PWA push

Eight workstreams in one ship. Andrew's word-for-word brief drove every
one of them — this README maps each ask to what we built.

## What Andrew asked for, in his words

> Admin should be able to add manager roles, also I noticed you kept
> both of their roles inside front desk which is fine

> Can you give manager better analytics like, "Atlas Impact, Atlas
> drove $5,540 for this business." just example, dont constraint
> yourself to that but, yeah just a better UI for analytics,
> distinguishing the difference with our app vs without us, also,
> google review performance tracking and everything. Involve
> infographics, the business owner has to look at this and realize it
> would be an expense to cancel with us.

> I also notice the UI is not full screen, lets make it full screen.

> Also little bug: I can't accept or reject, google review pending
> option at front desk.

> Also I on the APP, I want the google review button, on "need more
> points" to have a red "!" over it and also on the "rewards" button
> menu between "scan" and "profile". so that way it is an itch to get
> rid of it, the only way to get rid of it is to submit a google
> review, which will then turn orange, indicator for pending, once
> accepted, it goes away.

> Also the milestones for the streak look the same as every other
> cube, you should make it a bit more distinctive, like idk Heavy
> White and gold or something, whatever you think will look best.

> (OOH I forgot most important thing: In app notifications, ability to
> set automated app notifications: You can section it into:
> Streaks/Google Review/Daily Check/Automated Offers/Customer
> offers/Active rewards expiration. Of course, every user gets their
> own notifications (automated because its based on their data/points)
> but for custom offers that are available to everyone. It can be sent
> out manually out to everyone in that businesses APP).

## What CP-32 ships

### 1. Manager invites surfaced from the agency Team page

- `components/team/invite-member-modal.tsx` — added a "Which business?"
  dropdown that only appears when an agency admin is inviting a
  non-admin role from the agency-wide Team page (where `businessId`
  prop is null).
- `components/team/all-business-teams.tsx` — **new**. Shows every
  manager + front-desk grouped by business in collapsible cards.
- `app/(agency)/agency/team/page.tsx` — rebuilt as two sections: agency
  admins on top, every business team below.
- The CP-31 permission model was already permissive enough; CP-32 just
  surfaces the path and the SQL refresh tightens error messages.

### 2. Atlas Impact dashboard

- `components/manager/insights-dashboard.tsx` — **rebuilt**. New
  layout, top to bottom:
  - **Atlas Impact hero** — giant "Atlas drove $X for {business}"
    headline + four source chips (repeat visits, review value, win-back,
    avg member LTV) + retention-lift badge.
  - **With Atlas / Without Atlas** comparison row — revenue, repeat
    visits, reviews. "Without" values are struck-through in rose so
    it's obvious how much would evaporate.
  - **Google review performance** — 3-cell funnel (Asks → Submitted →
    Verified), 6-month bar chart of reviews-per-month, before/after
    star-average panel with a "since Atlas turned on" caption.
  - The legacy ops dashboard (rollup, busiest hours, top loyal members,
    Come-Back AI, inactive list) is kept beneath so day-to-day work
    isn't lost.
- Backed by three new RPCs:
  - `atlas_impact_rollup(p_business_id)`
  - `atlas_impact_monthly(p_business_id)`
  - `atlas_review_funnel(p_business_id)`
- The component is resilient: if the migration hasn't been applied yet
  the hero shows a "preview mode" caption and the legacy cards still
  render.

### 3. Full-screen manager dashboard

`components/manager/manager-dashboard.tsx` — flipped `max-w-2xl
mx-auto` to `max-w-2xl lg:max-w-7xl mx-auto`. Mobile-first front-desk
layout stays untouched; on lg+ screens the entire dashboard fills the
viewport so Insights and Notifications don't feel cramped.

### 4. Review approve/reject hotfix at front desk

- The CP-7 RPCs already gated on `staffs_business()` which permits
  business_staff. The real-world bug was:
  - **point_rules->>'review' = 0** would make `approve_review()` throw
    instead of crediting points.
- `cp32_migration.sql` re-declares both functions:
  - Approve now falls back to **5 pts** when the rule is unset/zero —
    so the button never silently breaks for a fresh sub-account.
  - Both functions return clearer error messages mentioning the team
    invite path.
- `components/manager/review-queue.tsx` — now surfaces the RPC error
  inline (was silently swallowed before), toasts the result, and
  optimistically removes the row from the queue on success.

### 5. Red "!" Google Review nudge in the customer app

- `lib/hooks/use-review-status.ts` — **new**. Single source of truth
  for the customer's `my_review_status` result + recommended badge
  tone.
- `components/customer/rewards-client.tsx` — the existing "Need more
  points → Review on Google" earn row now uses a tri-state alert:
    - **red "!"** — no review submitted (or last one rejected)
    - **orange "!"** — submitted, pending verification
    - **hidden** — verified
- `components/customer/app-shell.tsx` — the **Rewards tab in the
  bottom nav** wears the same red/orange "!" badge, so the user can't
  miss the nudge from any screen. Disappears the moment staff approve.

### 6. Distinctive streak milestones

`components/customer/streak-widget.tsx` — milestone cells in the
streak grid get a "heavy white + gold" treatment:

- 12% scale-up so they physically stand out
- Gold gradient base (`#fffbeb → #f59e0b`) with a 2.5px white rim and
  warm shadow, vs. the orange/red flame fill of normal cells
- Always-on shimmer ring (radial gold glow)
- A small **★ REWARD** badge tag floating above un-claimed milestones
- Icons recolor to amber on milestone cells for readability

Net effect: at a glance you can see "next week I get a reward" from
the trail without needing the legend.

### 7. In-app notification center + PWA push

**Data layer (`cp32_migration.sql`):**

- `notifications` table — `(id, user_id, business_id, kind, title,
  body, link_path, read_at, created_at)` with `kind` constrained to
  Andrew's six sections + `generic`.
- `push_subscriptions` table — `(user_id, business_id, endpoint,
  p256dh, auth)` with unique on `(user_id, endpoint)`.
- RPCs: `list_notifications`, `unread_notification_count`,
  `mark_all_notifications_read`, `broadcast_notification`,
  `upsert_push_subscription`, `notify_expiring_redemptions`.
- Auto-triggers — automatic notifications for:
  - Review verified → `kind = 'review'`
  - First daily check-in → `kind = 'daily_check'`
  - Automated offer assignment (if the `automated_offer_assignments`
    table exists from CP-29) → `kind = 'automated_offer'`
- Cron-able RPC for reward-expiration warnings (call
  `notify_expiring_redemptions(business_id)` from pg_cron daily).

**UI (`components/notifications/`):**

- `notification-bell.tsx` — bell + unread badge, wired into the
  customer Home hero header. Registers push on mount.
- `notification-center.tsx` — slide-up sheet listing all notifications,
  color-coded by Andrew's sections. Marks-all-read on open.
- `notification-broadcast.tsx` — manager-side composer for the
  "customer offers / manual broadcast" case.

**Push plumbing:**

- `public/sw-push.js` — dedicated push service worker (separate from
  the existing PWA-install `/sw.js`).
- `lib/notifications/push-client.ts` — feature-detects, requests
  permission, subscribes via VAPID, POSTs subscription server-side.
- `app/api/notifications/vapid-public-key/route.ts` — serves the
  rotatable VAPID public key from env.
- `app/api/notifications/subscribe/route.ts` — persists the
  subscription via `upsert_push_subscription`.
- `app/api/notifications/broadcast/route.ts` — calls
  `broadcast_notification` RPC and (optionally) fans web-push to
  every subscription for the business. The route logs the fan-out
  count today; wiring the actual `web-push` library is a TODO since
  in-app already delivers the message — push is the "while-app-closed"
  bonus.

**New manager dashboard tab:** "Notifications" — surfaces the
broadcast composer. Visible to `business_manager` and `agency_admin`,
hidden from front-desk.

## How to deploy

1. Apply `cp32_migration.sql` in the Supabase SQL editor.
2. Add the VAPID env vars (skip if you only want in-app, no push):

   ```
   VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY
   ```

   Generate them with `npx web-push generate-vapid-keys` (you'll need
   to `npm i web-push` first if you want to actually send pushes from
   `/api/notifications/broadcast`).

3. Optional: schedule `notify_expiring_redemptions()` daily via
   pg_cron:

   ```sql
   select cron.schedule(
     'cp32-expiring-reward-warnings',
     '0 14 * * *',
     $$ select public.notify_expiring_redemptions(b.id)
          from public.businesses b $$
   );
   ```

4. Restart `next dev` — the new Insights, bell, and Notifications tab
   light up immediately.

## What didn't change

- The agency dashboard layout was already `flex` + `flex-1 min-w-0`
  with `px-8` content — already full-width. Manager dashboard was the
  one constrained to `max-w-2xl`; that's what CP-32 fixed.
- The CP-31 magic-link invite path is unchanged. Manager invites use
  the same `/accept-invitation/[token]` landing page.
- Per-user notification preferences (mute streaks, mute offers, etc.)
  are not in CP-32 — Andrew's brief was "ability to set automated app
  notifications" which we read as the broadcast composer + the
  per-kind triggers. A preferences panel is the natural CP-33 follow-up.
