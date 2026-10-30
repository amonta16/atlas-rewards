# CP-176 · "Alive" landing page — live app, build-your-app booking, real photos

Landing page only (`/` and `/book-demo`). No SQL, no customer-app or portal changes.

## What changed
- **Try the real app** (`#demo`, replaces the static AppPicker) — a tap-through copy of Flippo's app:
  Home · Book · Check in · Rewards · Member (the entertainment layout). Real brand, rewards + photos,
  cages / pool / party packages, hours, tiers and +50/visit. Styled with the app's own style engine
  (banner, points card, loyalty card). A checklist on the left ticks off as visitors check in, spin,
  book and redeem. A push notification slides in after ~5 s. **Everything is simulated client-side —
  zero network calls, zero writes.** Data snapshot: `lib/landing/live-app-data.ts`.
- **Owner.com-style booking** — the demo modal and `/book-demo` now open with "Make it yours":
  venue name, venue type, brand color or logo (colors pulled from the logo in-browser, nothing
  uploads). The phone re-skins live and stays tappable. The venue name and type pre-fill the form,
  and the mockup choices get appended to the lead's notes (e.g. `App mockup: Bowling, color #e11d48`).
- **Photo hero** — real venue photos (arcade, party, bowling, VR) behind Flippo's app. FEC only; the
  smoke shop / med spa mockups are gone from the hero.
- **Venue photo marquee** replaces the icon chips (the mini-golf flag etc.).
- **Feature cards** are photo-led with a small "what the app just did" notification on each.
- **Featured venue** uses the install-day photo with the owner (`public/landing/flippos-install-owner.webp`).
- **Video testimonials** section with 3 placeholder cards → see below.
- Nav + footer: "Preview" → "Try the app".

## To do before/after deploy
1. **More venue photos (go-karts, batting cages, mini golf, trampoline, golf sims, laser tag):**
   ```
   node scripts/fetch-landing-photos.mjs
   ```
   Uses PEXELS_API_KEY from .env.local. Writes `public/landing/venues/*.jpg` + `lib/landing/venue-photos.json`;
   the marquee picks them up automatically. Look at the photos — swap a bad one with
   `--list=karts` then `--pick=karts:3`.
2. **Testimonials:** drop the Flippo's clips in `public/videos/`, fill in `lib/landing/testimonials.ts`
   (video, poster, name, role, one real quote). When they're all in, set
   `SHOW_TESTIMONIAL_PLACEHOLDERS = false`. Until then the cards show a dashed "Video testimonial goes here" tag.
3. Get the Flippo's owner's OK to use the install-day photo + their app data on the site if you haven't.

## Push
```
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
git add checkpoint-176-live-site checkpoint-02-brand-engine/atlas-rewards-app/app/book-demo checkpoint-02-brand-engine/atlas-rewards-app/app/globals.css checkpoint-02-brand-engine/atlas-rewards-app/components/landing checkpoint-02-brand-engine/atlas-rewards-app/lib/landing checkpoint-02-brand-engine/atlas-rewards-app/scripts/fetch-landing-photos.mjs checkpoint-02-brand-engine/atlas-rewards-app/public/landing
git commit -m "CP-176: alive landing - tap-through Flippo's app, build-your-app booking, venue photos, testimonials"
git push
```
(Adds only the landing files — your other uncommitted work stays out of this commit.)

## Refreshing the Flippo's snapshot
Rewards: `select name, point_cost, image_url from rewards r join businesses b on b.id=r.business_id where b.slug='flippo-s-arcade-and-batting-cage';`
Booking: same join on `booking_resources` (name, category, image_url, durations, packages).
