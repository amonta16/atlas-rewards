# CP-145 — Landing page simplified redesign

Light, type-led homepage modeled on the structure Dermis, Owner and Craver use:
one promise, one sentence, one button, one phone — then short sections.
Word count on `/` went from roughly 2,000 to about 700.

## Page order (components/landing/landing-page.tsx)
Navbar → Hero → NicheStrip → AppPicker → Features → HowItWorks → VSLSection →
CaseStudy → PricingSection → FAQ → FinalCTA → Footer

## Changed
- app/globals.css — `.lp-*` block rewritten: white page, `#f3f7fb` tint sections,
  navy ink, navy pill primary button. The CP-102 ocean gradient and the
  white-text remaps are gone.
- components/landing: hero, navbar, cta-button (adds PreviewCta + WatchCta tone),
  how-it-works, vsl-section, case-study, pricing-section, faq, final-cta,
  footer, landing-page rewritten. New: niche-strip.tsx, app-picker.tsx, features.tsx.
- lib/landing/faqs.ts — 6 questions, two-sentence answers, no [ CONFIRM ] tags.
- app/page.tsx — title/description + section comment.
- app/book-demo/page.tsx — light theme, no OceanBackdrop.
- booking-calendar.tsx / demo-request-form.tsx — industry dropdown is now the
  four niches (smoke shop, med spa, food, entertainment) + Other.
- video-player.tsx — frame border for the light page.

## Retired from the page (files left in place, unused)
problem-section, interactive-demo, rewards-demo, feature-showcase, analytics-demo,
before-after, social-proof, team-section, agency-waitlist, logo-cloud, ocean-backdrop.
Delete them whenever; nothing imports them.

## Placeholders removed
No "[ CONFIRM ]", "$XXX/mo", "+XX%" or fake testimonials render anymore. Price is
not on the page (quoted on the demo). Add real numbers to CaseStudy FACTS when the
dashboard has them.

## Verified
`tsc --noEmit` clean, `next build` clean, no horizontal overflow at 390px.
