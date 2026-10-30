# CP-36 / CP-36b — Invite Hardening, Insights Cleanup, Save-Offer Flow, 12h Cooldown, Notification Revamp, Gift QR

May 2026 polish pass driven by Andrew's debugging review.

## What changed

### Invites (team admin)
- **Role gate tightened.** Front desk (`business_staff`) sees no Invite UI
  at all. Managers (`business_manager`) can now invite both co-managers
  and front-desk staff for their own business — *never* agency admins.
  Agency admin is the only role that can mint another agency admin.
- **Email path removed.** No more Supabase magic-link invitation email.
  The route now returns a `{ token, url }` payload; the modal renders a
  copy-link panel so the inviter can paste the URL into whatever channel
  they want (SMS, Slack, in person). Removes the "magic link never
  arrives" support load.
- SQL: `create_invitation` updated to allow `business_manager → business_manager`.

### Insights tab
- **Removed:** Busiest Hours block, Come-Back AI predictions list. Both
  were under-used per Andrew.
- **Top Loyal Members:** unchanged data (already real), copy clarified.
- **Inactive Members:** cutoff bumped from 30 days to **60 days** (Andrew's
  "two months"). Adds the **"We miss you"** composer: choose bonus credits
  + tweak the message, then send to one row or fire to the whole list.

### Customer rewards tab
- **"Save to my rewards" actually saves now.** The offer-reveal popup now
  calls a new `save_offer` RPC when the customer taps the post-unwrap
  CTA. Their gift lands in a dramatic new **Your saved gifts** section
  at the top of the Rewards tab.

### Check-in
- Hard **12-hour cooldown** on `member_checkin` (was: one-per-period).
  A second scan inside 12h returns `already_checked_in=true` without
  advancing the streak or writing an audit row.
- New customer header pill behavior: when inside the cooldown the pill
  shows a live **"6 Hr"** countdown ticking down to the next allowed
  scan. After the cooldown ends it returns to "Check in" / "Spin ready".
- Daily spin still gates on calendar-day check-in (one spin/day total).

## Apply

```sh
psql "$DATABASE_URL" -f cp36_migration.sql
```

The migration is idempotent. New SQL:

- `create_invitation` (replaced) — allows manager → manager
- `customer_saved_offers` table + RLS
- `save_offer(p_offer_id)` RPC
- `my_saved_offers(p_business_id)` RPC
- `member_checkin_status(p_business_id, p_membership_id)` RPC
- `member_checkin` (replaced) — 12h cooldown

## Files touched (app)

- `components/team/invite-member-modal.tsx`
- `app/api/team/invite/route.ts`
- `components/manager/insights-dashboard.tsx`
- `components/manager/manager-dashboard.tsx` *(Notifications tab removed + scanner now resolves gift codes)*
- `components/customer/offer-reveal-popup.tsx`
- `components/customer/offer-reveal-watcher.tsx`
- `components/customer/rewards-client.tsx`
- `components/customer/saved-gifts-section.tsx` *(new — QR thumbnail per gift)*
- `components/customer/saved-gift-detail.tsx` *(new — full QR + code modal)*
- `components/customer/notification-preferences.tsx` *(new)*
- `components/customer/editable-profile.tsx` *(adds notification prefs panel)*
- `components/customer/header-actions.tsx`
- `components/customer/daily-mystery-modal.tsx` *(label tweak)*
- `components/agency/notification-settings-panel.tsx` *(new — per-business toggles + relocated broadcast composer)*
- `components/brand-editor/brand-editor.tsx` *(slots NotificationSettingsPanel into Settings tab)*
- `app/[business]/signup/page.tsx` *(notification consent checkbox)*

## CP-36b additions

- **Notifications relocated.** The Notifications tab is gone from the
  manager/front-desk view. The agency admin now owns:
  - per-type toggles (streak reminders, gift expiration, offer
    announcements, check-in available, we-miss-you, reward unlocked,
    birthday, review request) — `business_notification_settings`
  - the manual broadcast composer (used to live on the manager tab)
- **Customer preferences.** Profile tab gets a Notifications card with a
  master push switch + per-type toggles + "turn off all" shortcut.
  Signup adds an opt-out consent checkbox.
- **Gift QR.** Saved gifts now mint a 7-char `redeem_code` on save_offer.
  Customer taps a saved gift row → modal shows a big QR (`react-qr-code`)
  + the code in mono. The front-desk scanner pipeline picks up
  `resolve_saved_offer_by_code` → confirm dialog → `fulfill_saved_offer`.
- **Check-in countdown clarification.** The "6 Hr" pill is a real
  cooldown, so it only renders AFTER a real scan and within 12h. Fresh
  members see "Check in" + lock badge until staff scan them for the
  first time — by design, not a bug.

## New SQL (cp36b)

- `business_notification_settings` table + `get_…` / `update_…` RPCs
- `customer_notification_preferences` table + `get_my_…` / `update_my_…` RPCs
- `customer_saved_offers.redeem_code/fulfilled_at/fulfilled_by` columns
- `resolve_saved_offer_by_code` + `fulfill_saved_offer` RPCs
