# CP-115 — Launch-day customer-app polish (Exotic Smoke Shop)

Frontend-only, no SQL. Deploy the app and you're set for tomorrow.

## What changed

1. **Loading screens are now on-brand, not white.** The route-transition loading screen (`AtlasLoading`) and the cold-boot splash (`PWABootSplash`) now use a **full brand-color background** (was mostly white) with the business logo in a clean white tile — `object-contain` with padding, so **the logo is never cropped**. White text + spinner.

2. **The app-open "glitch" is smoothed.** The boot goes: join splash → boot splash → route loading → home. Those used to be different **white** screens with different logos, which flashed. Now all three read the same cached brand and render the same brand-blue screen with the shop's logo, so the whole open is one continuous branded surface instead of white flashes fighting each other.

3. **Single-shop = seamless (already the case, now verified + branded).** A customer with only one shop never sees the "Where to today?" chooser — the boot forwards them straight in. The chooser only appears for someone in **2+** shops. Scanning/opening another business's QR still routes correctly. The boot splash they see while forwarding is now their shop's brand color + logo.

4. **Bigger, more noticeable "Get the app" prompt.** The iOS/Android install prompt is now a full-width card with a brand-gradient header, a large store button, and a soft pop-in — hard to miss. Still appears after 5s, still one-tap dismissible, still hidden inside the installed app.

5. **Reward & offer images no longer flash white.** New `SmartImage` shows a **brand-tinted shimmer** while a photo loads (instead of a blank white box) and fetches above-the-fold images eagerly + async so they arrive sooner. Wired into Home top-rewards, the rewards store, and limited offers.

## Files
- `components/ui/atlas-loading.tsx` — brand-blue loading screen, bigger uncropped logo.
- `components/ui/pwa-boot-splash.tsx` — brand-blue cold-boot splash.
- `components/ui/smart-image.tsx` (new) — shimmer image placeholder.
- `components/customer/pwa-install.tsx` — bigger install prompt.
- `components/customer/top-rewards-grid.tsx`, `rewards-client.tsx`, `limited-offers-section.tsx` — SmartImage on reward/offer photos.
- `app/join/page.tsx` — brand-aware boot splash.

## Verified
`tsc --noEmit` 0 errors, `next build` clean (against the current tree including the other sessions' CP-111/112).

## Note
Images still come from wherever they're hosted (your Supabase bucket). The shimmer masks the load; for the *fastest* real load, keep reward/offer images reasonably sized (the CP-64 library images already are). A follow-up could add Next/Image optimization, but that's a bigger change than a launch-eve edit warrants.
