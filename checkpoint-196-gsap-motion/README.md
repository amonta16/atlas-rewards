# CP-196 · GSAP scroll motion on atlas-engine.app

GSAP 3.15 (free, incl. ScrollTrigger) added to package.json.

All motion lives in `components/site/motion.ts`; sections only carry data attributes.
`useSiteMotion` is mounted once in `SitePage`. Phones get the same moments at smaller distances.
Nothing animates under "reduce motion"; everything is reverted on unmount.

| Section | Motion |
| --- | --- |
| Client results | numbers count up on first view and on each story change; photo settles from 108% |
| Three pillars | due card, aftercare card and member card drift at different speeds while scrolling |
| Front desk | the list mock drifts up while scrolling |
| The week | the line between steps draws as you scroll (across on desktop, down on phones); step numbers pop in |
| Pricing | the included items rise in one after another |
| Compare | check, partly and no marks pop in (desktop table and each phone card) |
