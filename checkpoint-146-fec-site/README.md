# CP-146 — FEC-focused homepage copy

Same CP-145 layout; every section now speaks to a family entertainment center owner.
Decided Sept 20 with the co-founders: FEC is the lead niche; smoke shops, med spas and
cafes stay as layouts the reps can still sell.

## Changed
- hero.tsx — "The app your guests keep. Built for fun centers." + FEC chips (slow Tuesday push, party rebooked, waiver signed)
- lib/landing/apps.ts — Flippo's is first in APP_MOCKUPS (hero slideshow, picker, featured venue)
- niche-strip.tsx — arcades, batting cages, go-karts, mini golf, trampoline parks, party venues; one line for secondary niches
- features.tsx — party rebooking, memberships, digital waivers, rewards/events
- how-it-works.tsx, vsl-section.tsx, pricing-section.tsx, final-cta.tsx — FEC wording; pricing mentions own App Store listing add-on
- case-study.tsx — Flippo's Arcade & Batting Cage with the app mockup (swap in photos + two numbers when shot; no placeholders)
- lib/landing/faqs.ts — six FEC questions (waivers, card systems, POS, party reminders)
- booking-calendar.tsx / demo-request-form.tsx — FEC sub-types first in the industry dropdown
- app/page.tsx — title + description

## Verified
tsc clean, next build clean. Full plan: "Atlas Engine — FEC Master Plan" doc.
