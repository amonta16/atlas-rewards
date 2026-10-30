# CP-194 · Blue + white login, blue-lines bands, client results band

- `app/(agency)/login/page.tsx`: two-tone sign-in. Left panel (a top strip on phones) is
  `public/landing/blue-lines.jpg`; the form is on white. Gold removed (button is ocean blue,
  divider white). Tagline now "med spas and local venues".
- `app/site.css`: every ocean band (desktop showcase band, Front desk, Reviews, Closing) uses
  blue-lines.jpg with a light navy wash for text contrast. New `.s-prog` progress line.
- `components/site/client-results.tsx` + `lib/landing/client-results.ts`: Dermis-style results
  band under the hero (stats + products used, story photo card, wordmark row with progress line,
  auto-advances). Set in Hanken Grotesk (`lib/fonts/hanken.ts`, now shared with the med spa app).
- `public/landing/flippos-owner.jpg`: the Flippo's interview still.

## PLACEHOLDER
All four stories in `lib/landing/client-results.ts` are `placeholder: true`: the numbers are not
real and Coastal Skin Studio / Luma Med Spa / Bayside Aesthetics are not clients. The band shows
"Sample figures and clients shown for layout" while any placeholder remains. Swap in real,
permissioned results before running ads.
