# CP-202 · /medspa: video, quiz-first page, Calendly-style booking, A/B arms, offer slot

**Check after push:**
- Landing, video hero: https://www.atlas-engine.app/medspa?hero=video
- Landing, phone hero: https://www.atlas-engine.app/medspa?hero=phone
- Quiz first (no landing): https://www.atlas-engine.app/medspa/start

## What changed
- **Video placeholder.** /medspa hero arm "video": headline + a big video frame on the blue-lines ocean, the CTA under it (ScaleClients layout). Until `LANDING_VSL.embed` is set, tapping it says the video is on its way and offers "See your practice's app". The pre-call page has a matching placeholder (the written version stays under it).
- **Theme.** The blue-lines ocean artwork now carries the funnel: the video hero, the whole /medspa/start page (white logo, one white card), and the top of the pre-call page.
- **Quiz first.** New page /medspa/start = the funnel on its own page. Every button on /medspa now goes there too (UTMs/fbclid carried over), so both entry points share one funnel. The old modal is gone from /medspa.
- **Calendly-style booking.** Left: Andrew, "Atlas app walkthrough", 20 min, video. Middle: month grid (Mon first), open days in blue circles, today dotted, time zone picker. Right: the day's times; a time splits into [time | Next]; then one confirm screen, "Schedule event". Same backend (Google Calendar availability, gate re-checked on the server).
- **A/B arms.** Saved on each lead (`landing_leads.variant`) and in the source string:
  - `lp-phone` / `lp-video`: came through /medspa, saw that hero. 50/50, sticky per browser. Force with `?hero=video|phone`.
  - `quiz-first`: landed on /medspa/start straight from an ad.
  - Read results: `select * from landing_funnel_by_variant;` (leads, qualified, booked, confirmed, showed, paid, book rate per arm).
- **Offer slot.** `OFFER.guarantee` and `OFFER.founding` in `lib/landing/medspa-funnel.ts` render an ocean guarantee card and a founding-pricing pill in "Everything your practice gets". **Both ship as null**: a guarantee is a promise, so it only goes live when Andrew fills it in.

## Running the tests in Meta
1. One campaign, Meta A/B test (or two ad sets, same creative, same budget):
   - A → `https://www.atlas-engine.app/medspa?utm_source=meta&utm_campaign=ms_entry&utm_content=landing`
   - B → `https://www.atlas-engine.app/medspa/start?utm_source=meta&utm_campaign=ms_entry&utm_content=quizfirst`
2. The hero test runs inside A automatically.
3. Judge on **qualified leads and booked calls per dollar**, not clicks. Give each arm ~$300–500 or ~20 qualified leads before calling it.

## SQL (already applied to production Oct 7 2026; safe to re-run)
`cp202_medspa_ab.sql`: `landing_leads.variant` + view `landing_funnel_by_variant` (security_invoker, not exposed to anon).

## Files
New: `app/medspa/start/page.tsx`, `components/medspa/medspa-start-page.tsx`, `lib/landing/ab.ts`.
Changed: `components/medspa/medspa-funnel-page.tsx`, `components/medspa/medspa-funnel.tsx` (Calendly picker, variant), `components/medspa/precall-page.tsx`, `lib/landing/medspa-funnel.ts` (LANDING_VSL, OFFER, HERO_ARMS), `lib/landing/analytics.ts`, `app/api/landing/lead/route.ts` (variant), `app/api/landing/reminders/route.ts` (link → /medspa/start?lead=).

## Verified
`tsc --noEmit` 0 errors, `next build` green. Clicked through both hero arms and the full quiz-first funnel to the pre-call page at 1440 px and 390 px: no console errors, no horizontal overflow; leads carry the right arm.
