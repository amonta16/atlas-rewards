# CP-131 · Niche layout presets

Step two of the Sept 2026 plan. One app, four layouts — picked per business, applied automatically to every new demo and every manually created business.

**Apply `cp131_layout_presets.sql` in the Supabase SQL editor first, then push.**

## What a preset does

`businesses.layout_preset` (`custom` · `smoke` · `food` · `medspa` · `entertainment`) now drives:

| Preset | Bottom tabs | Home leads with | Streaks / spin |
|---|---|---|---|
| **Classic** (`custom`) | Home · Check in · Rewards · Streaks | Member card, then offer, then rewards — exactly today's page | on |
| **Smoke shop** | Home · **Deals** · Check in · Rewards · Streak | Member card → featured deal → "Ready to claim" strip → streak/spin | on (weekly) |
| **Food shop** | Home · **Offers** · Check in · Rewards · Streak | Member card → "new this week" offer → "Redeem now" strip → streak/spin | on |
| **Medspa** | Home · **Book** · **Member** · Rewards · Check in | Membership card → member card → offer → referral | **off** (not on Home, no tab) |
| **Entertainment** | Home · **Events** · Check in · **Pass** · Rewards | Pass card → member card → offer → news/events | **off** |

Every existing business stays on Classic until you flip it — nothing changes on Exotic or anyone else by pushing this.

## Where it lives

- **`lib/layout-presets.ts`** — the single source of truth: tab set + labels, Home module order, headings, and the two default-pickers (`presetForIndustry`, `presetForNiche`). Edit a preset here and every surface follows.
- **`components/customer/app-shell.tsx`** — `tabsForConfig(widgetConfig, layoutPreset)` builds the bar from the preset (labels come from the preset, routes from the tab id). Review badge now keys on the `/rewards` route instead of the label.
- **`app/[business]/app/page.tsx`** — Home is now a map of named blocks rendered in the preset's order. Block contents are unchanged; the member card only overlaps the hero when it's first.
- **New tab pages:** `app/[business]/app/offers/page.tsx` (Deals / Offers / Events — limited offers + news billboard) and `app/[business]/app/membership/page.tsx` (Member / Pass — the membership section as a destination, with a "coming soon" state when memberships aren't enabled yet). Both reachable by URL on any layout.
- **Builder** — new **Layout** section at the top of *Brand & widgets*: five cards showing each preset's tabs, "Suggested" tag from the industry, saved with everything else.

## Both creation paths

- **Instant demo + batch build (Field App):** `demoDesignPayload(i, niche)` now includes `layout_preset` from the niche — food/cafe/pizza/dessert/bakery → Food, smoke/dispensary → Smoke, medspa → Medspa. Beauty, barber, nails, fitness, retail, general → Classic on purpose (not one of the four). There's no entertainment niche in the demo packs yet — add one when you pitch a bowling alley.
- **New business (Apps deck):** step two is now **Pick a layout** (see CP-131.1 below) — the five layout cards replace the old industry-template grid. Saved right after `create_business` alongside `is_demo`.

## Verified

Full-project `tsc --noEmit` on a cloud mirror of HEAD + these files: **0 errors**. Migration scratch-tested on Postgres 16 (add, CHECK rejects bad values, idempotent re-run).

## Known gaps (next)

- The builder's phone **preview** still draws the classic tab bar — it doesn't read the preset yet.
- Presets don't yet hide streak/spin *settings* in the builder for medspa/entertainment; they just leave them off the customer app.
- Step 3 modules (weekly specials grid, treatment-due reminder, punch clubs) are where the Events and Member tabs get their niche-specific content.

## Push

```
git fetch origin
git reset --mixed origin/main
git add -A
git commit -m "CP-131: niche layout presets — businesses.layout_preset drives tab set + Home order; /offers + /membership tabs; builder Layout picker; demo + New-business creation set the preset"
git push origin main
```

## CP-131.1 — template grid retired

Andrew's call after seeing it: the "Pick a starting template" grid (Medspa / Arcade / Coffee / Yogurt / …) is gone. Step two of **New business** is now **Pick a layout** — the five layout cards, each showing its tabs. Under the hood each layout still carries a hidden industry template (Classic→other, Smoke→retail, Food→coffee, Medspa→medspa, Entertainment→arcade) so widget flags and reward defaults are sensible, and writes a matching `industry` (smoke-shop / restaurant / medspa / arcade) so the image library and folders keep working. `smoke-shop` was added to the builder's Industry dropdown. `lib/industry-templates.ts` is untouched (the field-app and demo packs don't use it either) — it's just no longer a user-facing choice.
