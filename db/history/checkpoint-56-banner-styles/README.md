# CP-56 — Customizable featured-offer banner

The sticky promo banner pinned to the top of every customer tab is now stylable in the app builder.

## Styles

In the brand editor → **Design → Offer banner style**, pick from:

- **Stripes** (the current default), **Solid**, **Gradient**, **Confetti** — these use the business's own brand colors.
- Seasonal / fun themes with their own palettes: **🎄 Christmas** (red + green candy stripes), **🎃 Halloween**, **💖 Valentine's**, **🍀 St. Patrick's**, **✨ Gold luxe**, **🌙 Midnight**.

Each option shows a live mini-preview swatch in the picker, and the agency phone preview reflects the choice. Banner text stays white on every style for readability.

## 1. Apply the SQL (required)

Supabase → SQL editor → **`cp56_migration.sql`** → Run. Idempotent. Adds `businesses.banner_style` (NULL = default stripes).

## 2. Deploy

```bash
git add -A
git commit -m "CP-56: customizable featured-offer banner styles (gradient, confetti, seasonal themes)"
git push
```

## Files
**SQL** — `cp56_migration.sql` (`banner_style` column)
**New** — `lib/banner-styles.ts` (`BANNER_OPTIONS` + `bannerStyle()`)
**Changed** — `components/customer/featured-offer-banner.tsx` (uses bannerStyle), `app/[business]/app/layout.tsx` (passes style + colors), `components/brand-editor/brand-editor.tsx` (picker + save), `components/customer-preview/customer-preview.tsx` (mock mirror), `lib/types/database.ts` (`banner_style`)

## Adding more themes later
Add an entry to `BANNER_OPTIONS` and a `case` in `bannerStyle()` in `lib/banner-styles.ts` — that's the only place to touch (the picker and banner read from it automatically). New ids just work.
