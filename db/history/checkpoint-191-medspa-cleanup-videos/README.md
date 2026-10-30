# CP-191 · Med spa app cleanup, My care redesign, Flippo's videos

## Med spa app: no events, waivers or streaks
- **Bottom nav (med spa):** Home · Shop · **Check in (QR, middle)** · My care · Member. Shop replaces Events. Booking stays on Home (Book card) and in My care (Book buttons).
- **Hamburger menu:** the Daily Spin row and My Streak row are gone for med spas (and their red nudge dot).
- **Waivers:** the required-waiver gate and the promo-campaign waiver redirect are skipped for med spas; `/app/waiver` returns 404 for med spas. The builder's "Consents" tab and the desk's "Consents" tab are removed for med spas.
- **Streaks:** `/app/streaks` returns 404 for med spas (it wasn't linked, now it can't be reached either).
- Flippo's and every non-med-spa layout are unchanged.

## My care, redesigned (design-critique + ux-copy pass)
Problems found: tracked ALL-CAPS group labels, initials tiles ("NE", "LI") that read as placeholders, a repeated teal "Every 3 months" line on every row, extrabold weights everywhere, the business's decorative heading style on section titles, and copy that described the UI instead of helping ("Nothing on the calendar yet", "Recommended rhythm").
Changes:
- One type scale, semibold at most: 28px title, 20px section titles, 16px rows, 13–15px secondary.
- Each treatment row's tile is the interval itself: **3 / mo**, **4 / wk**, **1× (as needed)**, with the full phrase for screen readers. Price on the right when set.
- Group labels in sentence case ("Injectables", "Skin").
- Due cards: a colored rule + "Due in 10 days" + treatment + date, and a plain **Book** button.
- Aftercare as a quiet disclosure under each treatment (opens automatically for the last 14 days).
- Copy: "Your treatments, aftercare, and when you're due next." · empty state "Your care plan starts at your first visit / After each treatment, your aftercare shows up here, and we'll let you know when you're due again. / Book your first visit" · "How often to come back / What we usually recommend. Your provider will tailor it to you." · "Membership credit".

## Videos (Vimeo, exactly as shared)
- Chris `1232934665` (16:9) replaces the old `1231622571` embed that wasn't loading. Larry `1232932429` and Mary `1232932692` (4:3) added.
- Single source: `FLIPPOS_CLIPS` in `lib/landing/testimonials.ts` (feeds the main site and /venues).
- **atlas-engine.app:** the review band now shows the three videos in a static row (Vimeo's own player, so each shows the right person's frame and plays in place), with a one-line caption that Flippo's is an arcade and our first business; the review-slot cards keep sliding underneath.
- **/venues:** the three cards embed the Vimeo players directly at each clip's real shape.
- Roles weren't given, so captions read "Flippo's Arcade & Batting Cage · Morro Bay". Add a role or one real quote per person in `FLIPPOS_CLIPS` / `VENUES_TESTIMONIALS` when you have them.

## Files
`lib/layout-presets.ts` · `components/customer/header-actions.tsx` · `app/[business]/app/layout.tsx` · `app/[business]/app/waiver/page.tsx` · `app/[business]/app/streaks/page.tsx` · `app/[business]/app/care/page.tsx` · `components/brand-editor/brand-editor.tsx` · `components/manager/manager-dashboard.tsx` · `lib/landing/testimonials.ts` · `lib/landing/venues-offer.ts` · `components/venues/venues-page.tsx` · `components/site/site-page.tsx`
