# CP-190 · Med spa Shop (replaces Events)

Andrew: "There should not be an event section for med spas, but a shop section. Build that out too."

Everything is gated on `layout_preset === "medspa"`. Flippo's and every other layout are unchanged (their `/shop` is still the points-rewards catalog; the new med spa Shop lives at `/store`).

## Patient app
- **Bottom nav (med spa):** Home · Book · **Shop** · My care · Check in. When booking is off, the Book slot becomes **Member** (it used to fall back to "Events").
- **No events for med spas anywhere:** not on Home (since CP-185), not in the builder (since CP-185), and the Offers page now hides weekly specials and events for med spas.
- **Shop tab (/store), Dermis-style segments:** Treatments (packages) · Membership (the existing membership hub) · Skincare · Gift cards · Mine.
  - Cards show price, member price ("Members $490", or the member price applied with the original struck through for paying members), session count for packages.
  - Tap → sheet: quantity for skincare, amount + "who's it for" + note for gift cards → **Buy · $X**.
  - **Mine:** packages with a sessions bar ("2 of 3 left"), gift cards with their code and balance, skincare with "Paid · ready at the desk" / "Pay at the desk".
- **Home:** a "Shop" strip of featured items (owner marks "Feature it on Home").

## Payments
- **Card in the app (default):** Stripe Checkout on the **practice's own connected Stripe account** (the same Connect setup as memberships), platform fee applied if configured. The connect webhook marks the order paid. Shop events carry `metadata.atlas_kind = "shop"` and return before the membership handler, so they can never be mistaken for a membership pass.
- **Reserve, pay at the desk:** the order is created as `reserved`; the desk marks it paid. This is also the automatic fallback when Stripe isn't connected yet.
- Prices are always read server-side from `medspa_config.shop` (never from the browser). Members get member prices only if their membership is paid.

## Builder (med spa) → new **Shop** tab
Show/hide the tab, how patients pay, intro line, and items in three groups (Packages / Skincare / Gift cards): name, description, price, member price, photo, sessions + which treatment (packages), amounts (gift cards), pickup note (skincare), "Feature it on Home", for sale on/off. **Load starter shop** adds 3 packages, 3 skincare basics and a gift card ($50/$100/$250), unpriced until the owner sets prices (patients see "Ask at the desk").

## Front desk (med spa) → new **Shop** tab
- **To do:** reserved orders (Mark paid / Cancel) and paid skincare to hand over (Picked up).
- **Packages** in progress, **Gift cards**, **Done**.
- **Gift card lookup:** type the code → balance → apply an amount (balance goes down; at $0 it's done).
- **Package sessions:** when logging a treatment on a patient who owns a matching package, the desk ticks "Use a package session (2 of 3 left)".

## Database (applied to the live project)
- `medspa_shop_orders` (RLS: patient reads own, staff read/update; inserts only via the server route). SQL in `cp190_shop.sql`.
- `medspa_shop_orders_desk(p_business_id)` RPC for the desk list (staff-gated, joins patient name/phone).

## Not built yet (labeled honestly)
Refunds (use the practice's Stripe dashboard), emailing the gift card to the recipient (the buyer shares the code), shipping (pickup only), pay-over-time (still "In development" on the site).

## Files
`lib/medspa.ts` · `app/api/[business]/shop/checkout/route.ts` (new) · `app/api/stripe/connect/webhook/route.ts` · `app/[business]/app/store/*` (new) · `app/[business]/app/page.tsx` · `app/[business]/app/offers/page.tsx` · `components/customer/medspa/shop-strip.tsx` (new) · `components/customer/app-shell.tsx` · `lib/layout-presets.ts` · `components/medspa-builder/medspa-studio.tsx` · `components/brand-editor/brand-editor.tsx` · `components/manager/medspa-desk.tsx` · `components/manager/treatment-log-panel.tsx` · `components/manager/manager-dashboard.tsx`
