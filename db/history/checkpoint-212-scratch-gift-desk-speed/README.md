# CP-212 · Med spa scratch-card gifts + front desk tab speed

**Check after push:** a med spa patient Home (`/<slug>/app`) with an automated offer active, `/<slug>/app/rewards` (Ready to use → gifts), `/<slug>/app/offers` (med spa → redirects Home). Front desk: switch tabs back and forth on Flippo's desk, award a customer, close the panel.

## Automated offers → scratch card on med spa Home
- New `components/medspa-app/scratch-gift.tsx`. Front is always the same art: a white gift box with a ribbon and bow on a soft gradient, all drawn in the practice's brand colour. "Scratch to reveal your gift" pill. Patient scratches with a finger. At 45 % it reveals with confetti, then **Claim my gift** (or **Add to my points** for points gifts).
- What shows (`getMsScratchGift` in `lib/medspa-app/data.ts`):
  1. Per-patient automated gifts (welcome / birthday / anniversary / win-back), meaning the unrevealed row from `my_unrevealed_welcome_gift`. Claim → `mark_welcome_gift_revealed`.
  2. Otherwise the newest dated automated offer (holiday) the patient hasn't saved yet. Claim → `save_offer`. Points-only holiday offers are skipped, because `save_offer` refuses them.
- After claiming: "Saved to Rewards · View" opens `/rewards?gift=<id>` with the QR + desk code (`SavedGiftDetail`, same as venues). Points gifts just say the points are in the balance.
- Scratch progress is remembered on the phone, so a reload goes straight to Claim. A voice note plays (if the offer has one) after the reveal. Keyboard users get "Reveal without scratching".
- The pop-up reveal (`OfferRevealWatcher`) is **no longer mounted for med spas** (`components/medspa-app/frame.tsx`). The card replaces it.
- **Rewards → Ready to use** now lists claimed gifts with a "Show code" button. Before this, med spa patients had nowhere to see a gift's code. Unscratched per-patient gifts stay hidden there so the surprise isn't spoiled.
- `/app/offers` redirects med spas to Home (holiday notifications link to `/app/offers`).
- No SQL. Only existing RPCs and RLS-allowed reads.

**Heads-up:** none of the three med spas (spa-by-the-bay, divina-medical-spa, reveal-med) has an automated offer switched on yet, so no card shows until one is activated (Offers → Automated).

## Front desk: tab switching lag / endless loading
- `components/manager/manager-dashboard.tsx`
  - **Tabs stay mounted once visited** (hidden when inactive). Before, every switch unmounted the tab you left and cold-mounted the next one, which re-ran all its queries and re-joined its realtime channels. Going back to a tab is now instant.
  - **Award / gift / redemption panels cover the desk instead of replacing it.** Before, closing one remounted every tab and called `router.refresh()` (a full server re-render) after every customer. Now closing bumps the live feed and goes back to the phone box.
  - Badge-count RPCs (3, including a 60-day bookings scan) run at most every 15 s from tab switches; real DB changes still recount immediately.
  - The camera scanner switches off when you leave the Desk tab.
- `lib/use-desk-actions.ts`: removed a duplicate on-focus recount (the live feed already does it).
- `lib/supabase/client.ts`: **browser requests to Supabase now time out after 20 s** and return a normal error, so spinners always end. Before, a request stuck on a dead connection (tablet woke up / switched Wi-Fi), often the token refresh everything else waits on, left every panel loading until a reload. Storage uploads and Edge Functions are excluded. This client is shared, so customer apps get the timeout too.
- Side effect: med spa managers also load the Desk tab in the background while on Overview.

## Verified
`tsc` 0 errors, `next build` green. Scratch card checked in Playwright at 390 px (cover → scratch → reveal + confetti → claim → claimed state, two brand colours, no console errors). The desk changes were **not** clicked through with a real staff login; please do the back-and-forth tab test on Flippo's tablet.
