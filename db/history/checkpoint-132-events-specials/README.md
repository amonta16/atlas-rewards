# CP-132 · Events, weekly specials, and the builder reorganized

Steps three and four of the Sept plan, shipped together because Flippos needs both this week.

**Apply `cp132_events_specials.sql` in the Supabase SQL editor first, then push.** (CP-131's SQL must already be in.)

## 1 · Events

New **Events** tab in the builder. Add a dated event — title, start (and optional end), where in the venue, details, image, an optional button + link, published toggle. Customers see:

- **Home → "Coming up"**: the next three, as date-block cards (Sat · 20 · Sep), with "Today / Tomorrow / In 3 days" chips. Tap → detail sheet with the full description and the button.
- **Events tab**: everything upcoming. Past events fall off on their own an hour after they end (or three hours after they start if no end time).

Dates are formatted on the customer's phone in their timezone, not the server's.

## 2 · Weekly specials

Same Events tab, top half: a seven-day grid. Add a line to any day — "$2 games", "Unlimited after 7pm", "Family hours 11–3". Customers see a **"This week"** strip that opens on today and lets them tap other days. Days with nothing say "Regular pricing".

## 3 · Where they land per layout

| Layout | Home order (new modules in bold) |
|---|---|
| Entertainment | Pass → member card → **This week** → **Coming up** → offer → news → referral → rewards |
| Smoke shop | Member card → deal → **This week** → rewards → streak/spin → … → **Coming up** → news |
| Food shop | Member card → offer → **This week** → rewards → streak/spin → … → **Coming up** → news |
| Medspa | Membership → member card → offer → **Coming up** (open houses, injector days) → referral → … |
| Classic | unchanged, with both added near the bottom |

Both modules hide themselves when empty, so nothing changes for a business that hasn't added any.

## 4 · Builder reorganized

"Brand & widgets" (22 sections in one scroll) is now two tabs:

- **Setup** — Layout, Business info, Demo mode, Location & map, Customer-app features, discovery QR. The things you set once.
- **Design** — Theme presets, Brand colors, Background pattern, Header & background… then one **"Advanced styling"** fold holding the other thirteen knobs (card / points-card / button / banner / offer-card / reward-panel styles, four section layouts, design elements, streak theme). A theme preset already sets all of them; open the fold only to fine-tune.

Also: **Events** tab (new), and the Membership tab reads **Passes** on the Entertainment layout. The phone preview hides on Events (it's a list, nothing visual to mirror).

## Files

- `checkpoint-132-events-specials/cp132_events_specials.sql` — `business_events`, `business_specials`, RLS, public list RPCs, staff-gated upsert/delete RPCs. Scratch-tested on PG16 (upcoming filter, non-staff write rejected, re-run).
- New: `components/customer/events-section.tsx`, `components/customer/specials-strip.tsx`, `components/agency/events-manager.tsx`, `components/agency/specials-manager.tsx`
- Changed: `lib/layout-presets.ts` (two new HomeModules per preset), `lib/types/database.ts` (BusinessEvent, BusinessSpecial), `app/[business]/app/page.tsx` (two RPCs + two blocks), `app/[business]/app/offers/page.tsx` (specials + events on top), `components/brand-editor/brand-editor.tsx` (Setup/Design split, Advanced fold, Events tab, Passes label)

Full-project `tsc --noEmit`: **0 errors**.

## Not in this one

- Punch clubs (smoke) and the medspa treatment-due card — next.
- Builder phone preview still draws the classic tab bar.

## Push

```
git fetch origin
git reset --mixed origin/main
git add -A
git commit -m "CP-132: events + weekly specials (tables, RPCs, Home modules, Events tab content, builder managers); builder split into Setup / Design with Advanced styling fold"
git push origin main
```
