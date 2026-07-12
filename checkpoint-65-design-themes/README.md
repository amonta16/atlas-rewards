# Checkpoint 65 — Library Uploads + Design Themes

Two builder upgrades in one checkpoint: **upload your own photos into the
Fast Pick library** (CP-64.1), and **real design flexibility** — one-click
theme presets plus a themable streak that's no longer locked to orange
(CP-65).

## CP-64.1 — Upload photos into the library

The image library picker (any image field → **Choose from library**) now has
an **Upload photos** button:

- Pick the **niche** (or type a brand-new one — e.g. "Pet Grooming" — no
  migration needed) and the **section** (Hero / Rewards / Offers).
- Add comma-separated **tags** so the photos are searchable later.
- Select one or many files — they upload, get filed niche → section, and are
  instantly reusable in **every future demo app**.
- Who can add: **agency admins and VAs** (RLS-enforced). Hiding/pruning stays
  admin-only. Uploads show credit "Team upload".

Over time the library gets more authentic than stock — exactly the plan.

## CP-65 — Streak themes (goodbye locked orange)

`businesses.streak_theme` + `lib/streak-themes.ts`. Every streak surface —
the header chip, the Home teaser card, the trail, and the full streak panel —
re-themes from one preset picked in the brand editor:

| Theme | Vibe |
|---|---|
| 🔥 Classic fire (default) | The original orange |
| ✨ Luxury gold | Medspa / VIP |
| ⚡ Neon green | Dispensary / energy |
| 🌸 Soft pink | Beauty / lashes |
| 💧 Tech blue | Dental / modern |
| 🌫️ Minimal gray | Barber / boutique |
| ☕ Warm coffee | Coffee shops |
| 🌙 Midnight | Dark-mode brands |
| 🎨 Match my brand | Derived live from the primary color |

NULL / unset = classic fire, so nothing changes until a theme is picked.

## CP-65 — One-click theme presets

New **Theme presets** section at the top of the brand editor's design area.
One click sets **everything at once** — brand colors, header + background
(incl. dark modes), background pattern + tint, card shape, button shape,
offer-banner style, and streak theme. The live phone preview restyles
instantly; nothing is saved until you hit **Save**, so trying looks is free.

The 10 presets (each tagged with the niches it flatters):

🌿 Soft Spa · 💅 Blush Beauty · 🖤 Premium Noir (black + gold dark mode) ·
🌊 Ocean Clean · 🍃 Forest Fresh · ☕ Espresso House · 👾 Neon Arcade
(dark + neon) · 🍦 Sunny Scoop · ◻️ Minimal Mono · 🍕 Bold Appetite

Presets are starting points — every individual lever below (colors, pattern,
header, cards, buttons, banner, streak) still works exactly as before.

## Apply it

1. Run **`cp64_1_library_uploads.sql`** then **`cp65_streak_theme.sql`** in
   the Supabase SQL editor (both idempotent).
2. Deploy / restart the app. Done — no other config.

## Files

New:
- `checkpoint-65-design-themes/cp64_1_library_uploads.sql`
- `checkpoint-65-design-themes/cp65_streak_theme.sql`
- `atlas-rewards-app/lib/streak-themes.ts`
- `atlas-rewards-app/lib/theme-presets.ts`

Changed:
- `components/agency/image-library-picker.tsx` — Upload panel (niche +
  section + tags + multi-file).
- `components/brand-editor/brand-editor.tsx` — Theme presets grid + Streak
  theme picker + `streak_theme` saved.
- `components/customer/streak-widget.tsx` — panel + tray cells themed.
- `components/customer/streak-mini.tsx` — Home teaser card themed.
- `components/customer/streak-trail.tsx` — trail themed.
- `components/customer/header-actions.tsx` — header streak chip themed.
- `components/customer-preview/customer-preview.tsx` — preview chip mirrors
  the picked theme live.
- `lib/types/database.ts` — `Business.streak_theme`.

## Still on the roadmap (next checkpoints)

- **CP-66 — Layout presets:** multiple reward-section layouts (punch card,
  tiered, VIP club, horizontal scroll, minimal list…) and offer-section
  designs (big featured card, coupon style, service menu, before/after…),
  switchable per business.
- **CP-67 — Design element pack:** badges, dividers, section headers, glow
  effects, CTA variants.

## Ship it

```bash
cd "C:/Users/andre/OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git add checkpoint-65-design-themes "checkpoint-02-brand-engine/atlas-rewards-app"
git commit -m "CP-65: library photo uploads (admins+VAs) + streak themes + one-click theme presets"
git push
```

Then run the two SQL files (step above).
