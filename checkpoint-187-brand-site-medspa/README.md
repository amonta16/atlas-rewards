# CP-187 · atlas-engine.app — med spa first, fresh design

Andrew: "now change our main website" → med spa first, fresh design (not a copy of /medspa).

## What changed
- **Root (`/`)** is now the brand site for independent med spas. The old family-entertainment root (CP-100 → CP-176) stays in `components/landing/landing-page.tsx` but is no longer routed; venues are served by `/venues` and linked from the nav ("For entertainment venues") and footer.
- **Design:** "pearl & aubergine". Pearl #F4F1F6 base, white panels, aubergine ink #221A2B, plum #5B2E6B accent, honey hairlines. Instrument Serif (display, with real italic) + Manrope (body). Deliberately different from /medspa's porcelain/teal/Fraunces so the ads page and the brand site don't blur together.
- **Hero:** the product on both sides at once — the live demo app (Luma Aesthetics) with a recall push banner landing on it, the front desk's "Patients due" list beside it, and the booking that comes back. One load sequence.
- **Sections:** facts strip (no invented logos) · three pillars with real screens drawn in code (due card + aftercare, member card with banked credit, the app) · dark "Front desk gets a list, not a dashboard" band · the week to launch · pricing shape (flat fee, no number, quoted on the call — same policy as CP-145) · six-question comparison vs. marketplace apps and POS add-ons · voices (real Flippo's Vimeo + two med spa slots under `SHOW_MEDSPA_TESTIMONIAL_SLOTS`) · team (same photos) · FAQ (`MEDSPA_FAQ`, also JSON-LD) · closing · footer.
- **Quiz:** every CTA opens the med spa app-builder quiz (CP-182) with `source = site:<where>`.
- **Metadata:** title/description/OG/JSON-LD rewritten for med spas. Theme color pearl.

## Claims
- Recall *sending* and the credit ledger are not live: copy describes what the app shows and what the desk does today ("the desk logs… her app shows the countdown"; "text her the reminder you wrote").
- No customers, counts or logos invented. Flippo's is labeled as an arcade and "the first business on Atlas".
- Comparison table uses categories ("Marketplace apps", "POS loyalty add-on"), no competitor names.

## Files
- `app/page.tsx` (rewritten), `app/site.css` (new), `lib/landing/site-fonts.ts` (new)
- `components/site/site-page.tsx`, `components/site/site-mocks.tsx` (new)
- `package.json` / `package-lock.json`: `@fontsource/instrument-serif`, `@fontsource-variable/manrope`

## Checks
`tsc --noEmit` clean. Rendered at 1440 and 390: no horizontal overflow, no runtime errors. Photos mocked in preview (image hosts blocked from the sandbox) — check the real Flippo's poster and med spa posters on Vercel.

## Follow-ups
- The shared demo app (`LiveApp`) still shows a "Daily Spin" card for the med spa demo practice; the real medspa layout has no spin. Worth a `spin` prop on LiveApp so the demo matches the product.
- OG image: still the 512px icon. A 1200×630 with the hero composition would help link previews.
