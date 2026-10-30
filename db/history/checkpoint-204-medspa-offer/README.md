# CP-204 · /medspa: area lock, founding offer, three guarantees, no app preview

**Check after push:** https://www.atlas-engine.app/medspa · https://www.atlas-engine.app/medspa/start

## The offer (all numbers in `lib/landing/medspa-funnel.ts`)
- **One med spa per area.** `TERRITORY.radiusMiles` (10) around each client's zip. Taken areas show "A practice near <city> already holds this area" (never which practice) and offer a waitlist.
- **Founding practices.** `FOUNDING`: first 10 med spas pay $500 setup instead of $1,000, in exchange for a filmed testimonial + case study after 90 days. Spots left = 10 minus active founding territories (real count). The $1,000 must be what non-founding practices actually pay.
- **Guarantees** (`GUARANTEES`, shown with fine print on the page and on the pre-call page):
  1. Pays for itself in 90 days, or they don't pay until it does (membership dues + repeat treatments for app members vs. fees paid; conditions: QR out, desk logs treatments, one membership offered).
  2. Live in 7 days, or setup and month one are free.
  3. Leave any month; keep the banners, table tents and patient list.
  Put the same wording in the client agreement.

## The quiz now
Your area (zip → open/taken + founding spots) → Your practice (type + 4 taps) → estimate + the three promises + founding line → "Claim my area" → About you (compact) → gate (the server re-checks the area) → Calendly-style booking → pre-call page.
No app preview anywhere: no phone hero, no demo app, no name/color/app-icon steps.

## How areas get locked
- Automatically: when Andrew taps **They paid** in the after-call email, the practice's zip becomes an active row in `medspa_territories` (founding while spots remain).
- By hand: for clients closed outside the funnel, add a row in Supabase (`business, zip, lat, lng, city, state, radius_miles, founding`). Set `active=false` to reopen an area. Use a smaller `radius_miles` in dense cities (Beverly Hills to Santa Monica is 7 miles).

## A/B
Hero test retired (video only). Arms are now `landing` (came through /medspa) vs `quiz-first` (ad → /medspa/start). `select * from landing_funnel_by_variant;`

## SQL (already applied to production Oct 8 2026; safe to re-run)
`cp204_medspa_territories.sql`: `medspa_territories` (RLS on, server-only) + `landing_leads.zip/city/state/area_open`.

## Data credit
`lib/data/us-zips.json` (41k US zips → lat/lng/city/state) built from the `zipcodes` package (MIT); coordinates from GeoNames (geonames.org), CC BY 4.0.

## Files
New: `lib/landing/territory.ts`, `lib/data/us-zips.json`, `app/api/landing/area/route.ts`.
Changed: `lib/landing/medspa-funnel.ts`, `lib/landing/analytics.ts`, `app/api/landing/{lead,outcome,demo-request}/route.ts`, `components/medspa/{medspa-funnel,medspa-funnel-page,medspa-start-page,precall-page}.tsx`, `app/medspa/start/page.tsx`.

## Verified
`tsc` 0 errors, `next build` green. Clicked through open-area and taken-area paths at 1440 px and 390 px: no console errors, no overflow, no app-preview copy left on /medspa.
