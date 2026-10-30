# CP-57 — Customizable background-pattern color

The background pattern's tint is now its own setting, separate from the brand primary color.

In the brand editor → **Design → Background pattern**, once a pattern is selected a **Pattern color** picker appears (color swatch + hex, with a Reset to go back to the brand color). The swatches and the live preview update to the chosen tint.

Leave it blank to keep using the brand primary (current behavior). Applies to all the tiled patterns and the design tints.

## 1. Apply the SQL (required)

Supabase → SQL editor → **`cp57_migration.sql`** → Run. Idempotent. Adds `businesses.pattern_color` (NULL = brand primary).

## 2. Deploy

```bash
git add -A
git commit -m "CP-57: customizable background-pattern color"
git push
```

## Files
**SQL** — `cp57_migration.sql` (`pattern_color` column)
**Changed** — `app/[business]/app/layout.tsx` + `components/customer-preview/customer-preview.tsx` (pass `pattern_color ?? primary` as the pattern tint), `components/brand-editor/brand-editor.tsx` (Pattern color picker + save), `lib/types/database.ts` (`pattern_color`)
