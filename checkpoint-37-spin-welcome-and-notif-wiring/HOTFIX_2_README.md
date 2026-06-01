# CP-37.2 — Second hotfix bundle

Eight more bugs / requests from Andrew rolled into one checkpoint.

## What this ships

### 1. Admin / manager / front-desk can't log in
- `app/(agency)/login/page.tsx` — adds "Send me a sign-in link" magic-link button + smarter error mapping ("If you signed up via invite or forgot your password, tap below"). Same rescue pattern that CP-37.1 added to the customer login.
- **Action:** the most common cause is Supabase's Confirm-email setting blocking the invited managers. Disable it (Auth → Providers → Email → uncheck Confirm email) for the smoothest experience. The magic-link button is the universal fallback either way.

### 2. Streak cell text overlay
- `components/customer/streak-widget.tsx` — milestone cells with a reward image now show the reward NAME as a caption on a heavier scrim, and the period number moves to a small top-left badge. Both stay legible over any product photo.

### 3. Tab-switch loading screen — business logo
- `components/ui/atlas-loading.tsx` — accepts `logoUrl`; renders the business's logo art instead of the generic Atlas triangle when present.
- `components/ui/branded-loading.tsx` — threads cached `logo_url` through. (BrandCacheWriter already caches it from CP-42; no new wiring required.)

### 4. Daily Spin card on Rewards tab not flipping after spin
- `components/customer/mystery-reward-card.tsx` — now subscribes to `mystery_reward_spins` INSERTs + polls on focus, with a live HH:MM:SS countdown in the cooldown state. Matches the Home-tab DailySpinButton behavior introduced in CP-37.

### 5. Daily spin reveal — business logo instead of sparkle
- `components/customer/daily-mystery-modal.tsx` — when the slot machine settles on a prize, the celebratory emoji is replaced with the business's logo (in a white tile with a brand-color ring). Falls back to the emoji if no logo is set.
- `components/customer/mystery-reward-card.tsx` post-spin tile also uses the logo.

### 6. Send-test-notification panel
- `cp37_2_hotfix.sql` adds `send_test_notification(business_id, kind?)` RPC. Fires a sample of every enabled notification kind (or just one) to the calling agency admin / manager. Push fan-out happens via the existing CP-42 universal trigger.
- `components/agency/notification-settings-panel.tsx` — new "Test notifications" card with one "Send all" button + per-kind buttons.

### 7. Front-desk member history
- `cp37_2_hotfix.sql` adds `member_history_for_staff(business_id, membership_id)` RPC. Returns membership state, points/tier/lifetime, joined/last-visit, visit count, referrals brought, pending-membership flag, and the last 10 ledger entries.
- `components/manager/member-history-panel.tsx` — new component (Visits / Referrals / Lifetime stat row + pending-membership banner + activity ledger).
- `components/manager/award-points-panel.tsx` — renders the panel underneath the Check-in / By-transaction / Quick-award buttons, so the staff's primary actions stay at the top.

### 8. Boost contrast on the "By transaction" card
- `components/manager/award-points-panel.tsx` — the "Purchase amount · 2 pt per $1 spent" card is now filled with the brand gradient, white text, larger touch target, with a soft drop shadow. Reads as the primary action in the panel.

## How to apply

1. **Run `cp37_2_hotfix.sql`** in Supabase → SQL editor. Idempotent.
2. **Disable Confirm-email in Supabase Auth** (Auth → Providers → Email → uncheck Confirm email). This is the long-term login fix; the magic-link button is the immediate one.
3. **Push to GitHub** — see the standard block below.

## Files

| File | Purpose |
| --- | --- |
| `cp37_2_hotfix.sql` | send_test_notification + member_history_for_staff RPCs. |
| `app/(agency)/login/page.tsx` | Magic-link + error mapping for agency login. |
| `components/ui/atlas-loading.tsx` | Renders business logo on loading screens. |
| `components/ui/branded-loading.tsx` | Threads cached logo_url. |
| `components/customer/streak-widget.tsx` | Reward-name caption on milestone cells. |
| `components/customer/mystery-reward-card.tsx` | Realtime + countdown + brand logo on reveal. |
| `components/customer/daily-mystery-modal.tsx` | Brand logo on prize-reveal. |
| `components/agency/notification-settings-panel.tsx` | Send-test-notification panel. |
| `components/manager/member-history-panel.tsx` | New — member history widget. |
| `components/manager/award-points-panel.tsx` | History panel + boosted transaction CTA. |
