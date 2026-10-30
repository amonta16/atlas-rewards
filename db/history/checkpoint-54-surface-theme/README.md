# CP-54 — Customizable header + background colors (dark mode)

In the app builder you can now choose the **header bar color** and the **page (background) color** per business — including a one-tap **Dark** mode — instead of being stuck with white.

## How it avoids blending

Your concern was that a non-white surface would blend with other elements. Handled three ways:

1. **Content cards stay white.** Rewards, offers, gifts, the member card, etc. keep their white backgrounds and dark text, so they always stand out — even on a dark page. (White cards on a dark page is exactly the clean "dark mode" look.)
2. **On-background headings auto-flip.** Section titles that sit directly on the page ("Top rewards", "Rewards store", "Your saved gifts", etc.) automatically switch to light or dark text based on how bright your chosen color is — no manual contrast tuning.
3. **Header texture + bottom nav adapt** to the header color too, so the whole chrome stays cohesive.

## Where to set it

Brand editor → **Design → Header & background**:

- **Header color** and **Background color** pickers (with hex inputs).
- Quick presets: **☀️ Light (default)**, **🌙 Dark**, **🎨 Brand header**.
- Leave blank for the default light look. Any background pattern still applies on top of the chosen color.

## 1. Apply the SQL (required)

Supabase → SQL editor → **`cp54_migration.sql`** → Run. Idempotent. Adds `businesses.header_color` + `surface_color` (NULL = default light).

## 2. Deploy

Push (block below) → redeploy → reopen the app.

## Files

**SQL**
- `cp54_migration.sql` — `header_color` + `surface_color` columns

**Changed**
- `lib/patterns.ts` — `readableTextColor()` helper + `patternStyle` accepts a base color
- `app/[business]/app/layout.tsx` — computes surface bg, auto-contrast fg, header/nav color
- `components/customer/app-shell.tsx` — `--surf-fg` var + nav chrome color
- `components/customer/customer-header.tsx` — header color + adaptive texture
- `components/customer/{rewards-client,saved-gifts-section,active-redemptions,limited-offers-section}.tsx` + `app/[business]/app/page.tsx` — section headings opt into `--surf-fg`
- `components/brand-editor/brand-editor.tsx` — Header & background picker + save
- `components/customer-preview/customer-preview.tsx` — mock preview mirror
- `lib/types/database.ts` — `header_color` + `surface_color`

---

## Ship it

Run from the repo root (the **Atlas Engine APP** folder):

```bash
git add -A
git commit -m "CP-54: customizable header + background colors (dark mode) with auto-contrast headings"
git push
```
