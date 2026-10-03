# CP-177 · /venues — Meta ads landing page (deep-ocean theme)

New ads-only page at **https://www.atlas-engine.app/venues**. No SQL. The homepage, /book-demo,
customer apps and portals are untouched.

## What it is
A long-form sales page built on Sabri Suby's *Sell Like Crazy* logic: call out the audience →
name the leak → the three pillars (app · follow-ups done for you · memberships) → try Flippo's
real app → testimonials + sourced proof → the offer stack → risk reversal and the reason for it →
ONE action (build your app + book, the CP-176 DemoBooker inline) → FAQ → P.S.
No site nav, so ad traffic can't wander. `noindex`, so it never competes with the homepage.

Theme: midnight navy → deep ocean gradient, sea-glass glow, champagne accent. Scoped under
`.lpv` in `app/venues/venues.css`, so nothing leaks elsewhere. Roll it to the homepage later if it wins.

## Files
- `app/venues/page.tsx` — route, metadata (noindex), Pixel
- `app/venues/venues.css` — the theme
- `components/venues/venues-page.tsx` — the page
- `components/venues/meta-pixel.tsx` — Meta Pixel, loads only when the env var is set
- `lib/landing/venues-offer.ts` — **all copy you'll edit**: offer, risk reversal, testimonials, FAQ, proof
- `lib/landing/analytics.ts` — one added line: `demo_requested` also fires Meta's standard `Lead`

## Before you run ads
1. **Pixel:** create a Meta Pixel → Vercel env `NEXT_PUBLIC_META_PIXEL_ID=<digits>` (Production) → redeploy.
   Check with Meta Pixel Helper: PageView on load, Lead after booking a test demo.
2. **Testimonials:** upload Larry, Chris and Mary (vertical, unlisted Vimeo/YouTube) → paste each
   embed URL, real role and one real quote into `VENUES_TESTIMONIALS`. Cards without a video are
   hidden in production automatically.
3. **Offer:** if you switch from the 30-day free trial to a paid pilot, change `riskReversal`,
   `rationale` and the FAQ "What does it cost?" answer. Keep the Messaging Library in sync.
4. **Scarcity:** `capacityLine` stays `null` unless it's literally true.
5. **Ad URLs carry UTMs**, e.g. `/venues?utm_source=meta&utm_campaign=p1_party&utm_content=larry_v1`.
   They're saved as the demo request's `source`, so you can see which ad booked which walkthrough.
6. Later: Conversions API (server-side Lead) for iOS signal loss.

## Verified
`tsc --noEmit` clean. Rendered at 1440px and 390px: no console errors besides blocked external
images in the test sandbox, no horizontal overflow.
