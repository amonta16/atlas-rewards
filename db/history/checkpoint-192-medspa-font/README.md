# CP-192 · Inter across the med spa app, video shapes

- **Font:** the med spa customer app (`layout_preset = "medspa"`) is now set in **Inter**, self-hosted (the same file the marketing pages already ship), instead of each phone's system font (Segoe UI on Windows, SF on iPhone, Roboto on Android). That's the typeface the My care redesign was previewed in. Applied once on the app shell, so every tab, sheet and form inside it inherits it; `.ms-app` adds Inter's cleaner alternates (cv11, ss01, ss03) and a hair of negative tracking. Non-med-spa apps are unchanged.
- **Videos:** measured all three Vimeo players: they're 16:9 (the 75% padding in the share code was wrong), so the cards now match and sit in an even three-column row.
- **Chris's video (1232934665)** returns Vimeo's "Because of its privacy settings, this video cannot be played here." That's a setting on the video, not the site. Fix in Vimeo → the video → Settings → Privacy: *Who can watch* = Anyone (or Unlisted), *Where can this be embedded* = Anywhere, or add `atlas-engine.app` and `www.atlas-engine.app`. Larry and Mary already have this and play.

Files: `app/[business]/app/layout.tsx`, `app/globals.css`, `lib/landing/testimonials.ts`, `components/site/site-page.tsx`
