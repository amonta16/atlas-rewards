# Checkpoint 66 — Section Layout Presets (+ preview fix)

Layout switching for the two biggest customer sections — pick the SHAPE of a
section the same way you already pick its skin. One click in the brand
editor, the live phone preview restyles instantly, no rebuild.

## Preview fix (CP-65.1 follow-up)

The phone preview never rendered the "Limited offers" cards, so the new
**Offer card style** picker appeared to do nothing. The preview's Rewards
tab now shows a two-card offers mock that mirrors the picked card style
(and the new offers layout) live. The real customer app was already fine —
pages load the business with `select("*")`, so the style flows once
`cp65_1_offer_cards.sql` is applied.

## Rewards store layouts (`businesses.rewards_layout`)

| Layout | What it looks like |
|---|---|
| 🔲 Card grid (default) | The classic 2-column reward cards |
| 📋 Compact list | Slim image-left rows with a mini progress bar — minimal |
| 🎠 Carousel | Swipe sideways through fixed-width cards |
| 🌟 Spotlight | First reward full-width and big, the rest in a grid |

## Limited offers layouts (`businesses.offers_layout`)

| Layout | What it looks like |
|---|---|
| 🥞 Stacked rows (default) | The classic image-left rows |
| 🎟️ Coupon | Ticket-style: dashed border + dashed tear line after the image |
| 🎠 Carousel | Swipe sideways through vertical offer cards |
| 🖼️ Billboard | Big image-on-top promo cards |

Layouts compose with the CP-65.1 **offer card styles** — e.g. Coupon layout +
Luxe noir skin, or Billboard + Gradient. Both pickers live in the brand
editor between "Offer card style" and "Streak theme", each with structural
mini-mocks so the choice is legible at a glance. Defaults = the pre-CP-66
look; nothing changes until a layout is picked.

## Apply it

Run **`cp66_layouts.sql`** in the Supabase SQL editor (idempotent — adds the
two nullable columns). Deploy. Done.

## Files

New:
- `checkpoint-66-section-layouts/cp66_layouts.sql`
- `atlas-rewards-app/lib/section-layouts.ts`

Changed:
- `components/customer/rewards-client.tsx` — layout-aware Rewards store
  (grid/list/carousel/spotlight) + passes offers layout through.
- `components/customer/limited-offers-section.tsx` — layout-aware offer
  cards (stack/coupon/carousel/billboard).
- `components/brand-editor/brand-editor.tsx` — "Rewards store layout" +
  "Limited offers layout" pickers with structural mini-mocks; both saved.
- `components/customer-preview/customer-preview.tsx` — NEW offers mock
  (mirrors offer card style + layout) + rewards mock mirrors the layout.
- `lib/types/database.ts` — `rewards_layout` + `offers_layout`.

## Ship it

```bash
cd "C:/Users/andre/OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git add checkpoint-66-section-layouts checkpoint-65-design-themes "checkpoint-02-brand-engine/atlas-rewards-app"
git commit -m "CP-66: rewards + offers layout presets, offer-card style preview fix"
git push
```

Then run `cp66_layouts.sql` (step above).
