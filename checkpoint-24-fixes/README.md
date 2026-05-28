# Checkpoint 24 — Customer-side parity, orange streak, enrollment fix

## ⚠️ Run the SQL first

Before reloading the customer app, paste
[`01_realtime_and_offer_fallback.sql`](./01_realtime_and_offer_fallback.sql)
into the Supabase SQL editor and Run. Without this:

- The custom-offer banner won't update live (offers table isn't in the
  realtime publication yet).
- The streak header icon won't refresh when you toggle streaks on
  (streak_config + member_streaks weren't in realtime either).
- An offer you create without ticking ⭐ Featured will still not show on
  the customer side, because `featured_offer()` strictly required the
  ⭐ toggle. CP-24 SQL changes that to "prefer ⭐, fall back to the most
  recently created active offer."



Andrew flagged a stack of small-but-visible bugs after CP-23 went out:

1. Custom offers added in the admin dashboard appeared in the phone *preview*
   but the persistent banner was **missing on the live customer app**.
2. The admin phone preview still showed the legacy **Search / Cart icons**
   in the header — never matched what the customer actually sees.
3. New users were stuck on `Enrolling…` — **no QR code, no member ID** was
   generated.
4. The single-membership card on both the preview and the live page rendered
   in **black** — Andrew called it "off."
5. The streak panel was a giant blue 5-wide ice-cube tray. He wanted **3x4,
   orange/fire, and updating week-by-week**.
6. Tapping the Fast Actions / streak button **didn't open the widget** (it
   was routing to `/app/rewards` instead).
7. On the Rewards tab the brand header + the custom-offer banner **both
   disappeared** — header was never rendered, and rewards-client had its
   own duplicate banner that conflicted with the layout one.
8. Active rewards were missing the reward image on the Rewards tab.
9. Rewards on the Home tab and Rewards tab didn't show the same image
   (Home rendered the uploaded image, Rewards rendered only the Gift icon).

## What CP-24 ships (UI only — no SQL)

### Persistent customer header on every tab
- `app/[business]/app/rewards/page.tsx`, `…/scan/page.tsx`, `…/profile/page.tsx`
  now each render the same logo + `<HeaderActions>` block that Home has.
- Removed the duplicate sticky offer banner from inside `rewards-client.tsx`;
  the layout-level `FeaturedOfferBanner` is now the single source of truth.

### Realtime featured-offer banner
- `components/customer/featured-offer-banner.tsx` is now a stateful client
  component that **subscribes to realtime `offers` changes** for this
  business. The moment the agency flips an offer to ⭐ Featured, the
  customer banner appears (or updates) without a reload.
- Layout passes `businessId` through so the subscription can attach.

### Admin phone preview matches the live customer app exactly
- `components/customer-preview/customer-preview.tsx`:
  - Header icons rewritten — no more `Search` / `ShoppingCart`. Now shows
    Gift (daily check-in, with the lock badge), User (membership) and an
    orange Flame (streak), each with a thin outline so they read as
    tappable buttons.
  - Membership preview card switched from black gradient to the same
    branded gradient the live `<MembershipSection>` now uses.

### Membership recolored — no more black
- `components/customer/membership-section.tsx`: non-member card is now a
  warm brand-tinted gradient (was `#0a0a0a → #111111 → #0a0a0a`).
  Perks, value pills, join CTA, and fine print recolored for the new
  background. Reads as premium without looking dead.

### Compact orange streak widget (3x4, fire-themed)
- New `components/customer/streak-widget.tsx` — a 3-column × 4-row tray
  that pages forward in 12-cell windows as the streak grows. Always
  orange (`#fb923c → #ef4444`). Filled cells render a Flame icon on a
  gradient cube; milestones overlay Gift / Sparkles / Trophy; the current
  cell pulses; rewards-along-the-way legend is compact and scrollable.
- `components/customer/header-actions.tsx`: the flame icon now opens the
  new widget directly (no more navigating to /app/rewards). Backgrounds
  on the three header icons gained a thin 1-px outline so they read as
  buttons.
- `components/customer/streak-trail.tsx`: rewritten — pill is still
  rendered on the Rewards tab but opens `<StreakWidget>` instead of the
  old StreakMapInner modal. Dead 5-wide blue tray code deleted.

### Reward image parity (Home ↔ Rewards)
- `components/customer/rewards-client.tsx`: the Rewards-tab grid now
  renders `reward.image_url` when present and falls back to the brand
  gradient + Gift icon only when no image was uploaded. Home tab already
  did this — CP-24 brings Rewards tab in line.

### New-user enrollment / QR generation
- `app/[business]/signup/page.tsx`: `enroll_member` errors are now
  surfaced instead of silently swallowed, so a failed enrollment never
  silently dumps the user into a membership-less app shell.
- `components/customer/scan-client.tsx`: client-side poll for up to ~10s.
  Calls `enroll_member` (idempotent) once per second until `my_membership`
  returns a row with a `referral_code`, then `router.refresh()`s so the
  rest of the app picks up the new membership. The QR placeholder also
  got a proper spinner + "Setting up your QR…" copy.

## Files touched

```
app/[business]/app/layout.tsx
app/[business]/app/rewards/page.tsx
app/[business]/app/scan/page.tsx
app/[business]/app/profile/page.tsx
app/[business]/signup/page.tsx
components/customer/app-shell.tsx                    (no change — already correct)
components/customer/featured-offer-banner.tsx         (realtime + businessId)
components/customer/header-actions.tsx                (outlines, streak modal, orange flame)
components/customer/membership-section.tsx            (branded gradient, perks contrast)
components/customer/rewards-client.tsx                (reward images, removed duplicate banner)
components/customer/scan-client.tsx                   (enrollment poll + spinner)
components/customer/streak-trail.tsx                  (rewrite — uses StreakWidget)
components/customer/streak-widget.tsx                 (NEW — compact 3x4 orange)
components/customer-preview/customer-preview.tsx      (header icons + membership recolor)
```

## To verify

1. Reload the customer Atlas tab.
2. Hit the customer app while logged in — confirm header (logo + 3 outlined
   icons) is visible on Home, Scan, Rewards, and Profile tabs.
3. Confirm the "10% OFF Tuesday" banner shows across every tab.
4. Add a NEW offer in the agency editor → flip the ⭐ Featured toggle. The
   customer banner should update in seconds without a reload (realtime).
5. Tap the orange flame icon in the header — the 3x4 streak widget opens.
6. Open the Rewards tab — the streak pill is now orange; tapping it opens
   the same 3x4 widget.
7. Sign up a brand-new user — the Scan tab shows the spinner briefly,
   then the QR code + member ID render.
8. Reward images uploaded in the Rewards manager show on both Home and
   Rewards tabs.
9. Membership card is no longer black.

No SQL changes — purely client/UI.
