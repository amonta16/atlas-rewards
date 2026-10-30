# CP-182 · /medspa — med spa ads landing page + quiz

No SQL. New page at **https://www.atlas-engine.app/medspa** (noindex). /venues, the homepage and
the customer apps are unchanged.

## What it is
The /venues page (CP-177/181) adapted for med spas, same deep-ocean theme and quiz popup:
- **Headline:** "Bring patients back before their treatment wears off."
- **Leak:** treatment wears off → patients drift to the spa with the better deal → the front desk
  has no time to chase.
- **Pillars:** your patient app · recall done for you · memberships that bill monthly.
- **Demo phone:** a fictional practice ("Luma Aesthetics"): injectables and skin treatments,
  med spa rewards, a "Glow Week" offer. Med spa photos from our image library.
- **Quiz (7 questions):** practice type, name, color/logo, visits per month, visit value,
  on-time rebook rate, how they recall today → "estimated recovered revenue" → book a walkthrough.
- **Risk reversal:** month to month, no 90-day cancellation notice (the RepeatMD contrast).

## Files
- `app/medspa/page.tsx` — route, metadata, Pixel (reuses `app/venues/venues.css`)
- `components/medspa/medspa-page.tsx` — the page
- `components/medspa/medspa-quiz.tsx` — the med spa quiz (fork of `components/landing/app-quiz.tsx`)
- `lib/landing/medspa-offer.ts` — **copy you'll edit**: offer, stack, FAQ, proof, testimonials
- `lib/landing/medspa-quiz-model.ts` — **every number the estimate uses** (recovery 3% / 5% / 8% are assumptions)
- `lib/landing/medspa-data.ts` — demo practice, treatments, rewards, practice types
- `components/landing/live-app/live-app.tsx` — new optional `offer` + `memberNote` props (defaults = Flippo's)
- `components/landing/landing-providers.tsx`, `demo-request-modal.tsx` — optional `renderQuiz` so a page can use its own quiz

## Before running med spa ads
1. **Recall must exist.** The page sells "you're due" reminders. Build treatment-cycle recall first,
   or soften `MEDSPA_STACK` and the pillar copy until it ships (Messaging Library rule: only claim Live features).
2. **Testimonials:** none yet (`MEDSPA_TESTIMONIALS` is empty, so the video row is hidden). Add the
   first med spa's clip when you have one.
3. **Ads:** no before/after photos, no Botox/Juvéderm brand names in creative.
4. Ad URLs: `/medspa?utm_source=meta&utm_campaign=ms_recall&utm_content=founder_v1`.

## Verified
`tsc --noEmit` clean. Rendered at 1440px and 390px with no errors or horizontal overflow; the quiz
was walked end to end (7 questions → estimate → book).
