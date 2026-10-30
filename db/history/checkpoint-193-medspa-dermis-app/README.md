# CP-193 · Med spa app, Dermis layout

The med spa patient app now has its own frame and screens, modeled on Dermis:
Home · Shop · Scan · Rewards · Profile, with the membership inside the Shop.

## How it branches (one place, no template mixing)
- `lib/medspa-app/route.ts` → `isMedspaApp(business)`, the only test.
- `app/[business]/app/layout.tsx` returns `<MedspaFrame>` for med spas right
  after enrollment. Nothing else in that layout runs for them (no waiver gate,
  featured banner, house promos, streak/spin plumbing), so fewer queries per tab.
- Each route that serves med spas starts with one line:
  `if (isMedspaApp(business)) return <MedspaX … />`
  (Home, store, rewards, scan, profile). `/membership` → Shop's membership tab,
  `/shop` → Rewards, `/care` is med spa only.
- Every med spa screen lives in `components/medspa-app/`; every med spa lookup in
  `lib/medspa-app/data.ts` (React cache, shared by frame and page).
- Venue/Flippo's code paths are unchanged apart from removing dead med spa
  branches (old CP-185 Home modules, CP-191/192 checks in the venue layout).

## Screens
- **Home**: logo bar + bag, photo hero "Welcome back", points pill with
  "N rewards unlocked", birthday gift (only when birthday points were really
  credited in the last 7 days), what's due, membership invite, rewards rail,
  shop picks, your team.
- **Shop**: Browse · <membership name> · Treatments. Item sheet → Checkout screen
  (order total, Card / Apple Pay or Google Pay / Klarna, Place order) → Stripe.
  Bag icon → Your orders.
- **Rewards**: glass points card (member badge, credit when credits are on),
  rewards rail / See more grid, ready-to-use codes, "Need more points?".
- **Scan**, **Profile** (My care + Your orders links, then the shared account sections).

## Other changes
- Font: Hanken Grotesk, self-hosted (`@fontsource-variable/hanken-grotesk`, `lib/medspa-app/font.ts`).
- `/api/[business]/shop/checkout`: `method: "klarna"` opens Stripe Checkout with Klarna;
  return URLs now go to `/store?tab=mine` (they pointed at the points catalog before).
- `lib/layout-presets.ts`: med spa tabs relabeled for the builder; unused med spa Home modules removed.
- Deleted (replaced): `app/[business]/app/store/store-client.tsx`, `components/customer/medspa/*`.

## Before it works fully
- Klarna: switch it on in the practice's Stripe account (Settings → Payment methods). Until then
  choosing Klarna shows "Klarna isn't available… choose Card".
- Photos: Home hero = business hero image; Shop membership = membership image; items/rewards use their own images.

No SQL in this checkpoint.
