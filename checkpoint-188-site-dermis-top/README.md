# CP-188 · atlas-engine.app: Dermis-style top, Owner-style review band, white glass & ocean blue

Andrew: "make the top exactly like Dermis, add Patient Financing like Klarna, Owner.com-style moving testimonials on our blue, we are white glass and ocean blue."

## Theme (replaces CP-187's pearl/aubergine)
White base, frosted glass panels, ocean-blue gradient (`#39A0FF → #0B5FD6 → #06318F`) for bands and the primary button, ink `#0B1B2B`. Manrope throughout (the serif is gone from this page). The ocean band uses Andrew's arcs artwork at `public/landing/ocean-arcs.jpg` (desk band, review band, closing).

## Top of the page (Dermis geometry, both breakpoints)
**Desktop (lg+):** centered headline "Sell more treatments & memberships." → "See how" → bouncing arrow → a row of four feature tabs across the page (Recall reminders · Memberships · [phone] · Rewards · Patient financing) with faint column guides, the phone centered in the middle slot and hanging down into a full-bleed ocean band. The band explains the active feature: title + blurb + "Build my app" on the left, two plain facts on the right (no invented stats). Active tab: blue top edge + ice fade, auto-advances every 4.5 s, hover pauses, click selects. Front desk isn't a tab here because it has its own band further down.

**Phones/tablets:**
- Headline "Sell more treatments and memberships." · lead · "See how ↓" (arrow bounces).
- **Left rail** of features with icons: Recall reminders · Memberships · Rewards · **Patient financing (In development)** · Front desk. The active item fills its left edge over 4.5 s, then advances; click any item; hover pauses. The active item's one-line blurb expands under it (sm+).
- **Phone** on the right, screens cross-fade per feature: Home with the due card + a recall push banner; the member card with what it includes; Rewards; a pay-over-time checkout; the front desk list.
- On phones: rail narrow on the left (icon over label), phone hanging off the right edge, **sticky bottom bar** "Build my app in 60 seconds →" (hidden on desktop). Same as Dermis.

## Patient financing — how it's presented, and how it would ship
- Shown on the rail and the phone as **"In development"**; the screen carries an "In development · 2027" pill so nothing claims it's live (Messaging Library rule).
- Path to real: Atlas already uses **Stripe Connect** for memberships. Stripe offers buy-now-pay-later (Affirm, Klarna, Afterpay) as payment methods on Checkout/Payment Intents on the connected account, so "pay over time" is a Stripe configuration + a checkout flow for treatments, not a new vendor or connector. Needs: treatment checkout in the app (not built), BNPL enabled on each practice's Stripe account, and the practice's own eligibility.

## Review band (Owner.com pattern)
Rounded ocean panel with the arcs art, "See what owners say about Atlas.", three fact badges (no ratings, no counts: we have none), then cards sliding across (55 s loop, pause on hover). The first card is the **real Flippo's Vimeo**. The others are **review slots**, drawn as dashed glass cards that say plainly they fill with real words later. Driven by `lib/landing/site-reviews.ts`: add a real quote and the card turns solid; set `SHOW_REVIEW_SLOTS = false` before ads so only real reviews show (band hides if none).

## Files
- `app/site.css` (theme rewrite), `app/page.tsx` (theme color)
- `components/site/site-page.tsx` (Showcase, MobileBar, ReviewsBand; sections re-themed), `components/site/site-mocks.tsx` (+ PhoneShell, ScreenRecall/Membership/Rewards/Financing)
- `lib/landing/site-reviews.ts` (new), `public/landing/ocean-arcs.jpg` (new)

## Checks
`tsc --noEmit` clean. 1440 and 390 wide: no horizontal overflow, no runtime errors. Photos other than the Flippo's poster are mocked in the sandbox preview.

## Tools Andrew asked about
"taste", "web-design-guidelines", "awesome-design-md", "image-to-code" aren't in the plugin catalog this account can see; the closest installed is the **Design** plugin (critique, a11y review, UX copy) and **Playwright** (now installed; the sandbox already used Playwright for every preview here).
