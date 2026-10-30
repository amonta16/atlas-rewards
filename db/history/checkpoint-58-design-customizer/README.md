# CP-58 — App-builder design customizer

More "click-to-design" power in the brand editor, without making it any harder
to use. Everything is a swatch you click; the phone preview updates instantly.

## What's new for the agency

**Card style** (Brand tab → *Card style*) — one click changes how every reward,
stat, and offer card looks across the whole customer app:

- **Rounded** — the classic Atlas look (default, unchanged).
- **Soft & pillowy** — big rounded corners, gentle glow.
- **Sharp & modern** — crisp corners, flat, minimal.
- **Elevated** — cards float off the page with a deeper shadow.
- **Outlined** — a brand-colored ring instead of a drop shadow.

**Button style** (Brand tab → *Button style*) — the shape of every button/CTA:

- **Rounded** (default) · **Pill** · **Chunky** · **Square**.

**Gradient palette backgrounds** (Brand tab → *Background pattern*) — eight
ready-made full-bleed color washes on top of the existing pattern set:
Sunset, Ocean, Candy, Forest, Peach, Lavender, Mango, and Midnight (dark).
Light palettes are veiled so the white cards on top stay readable; Midnight is
meant to pair with the Dark header/background option.

## How it works (for future me)

All three are pure **CSS-variable** levers — no card component was rewritten:

- `lib/design-styles.ts` — `CARD_STYLES`, `BUTTON_STYLES`, and `designVars()`
  which returns the `--card-radius-*`, `--card-shadow`, and `--atlas-btn-radius`
  tokens for a business.
- `app/globals.css` — inside a scoped `.atlas-surface` block, the existing
  `rounded-2xl / rounded-xl / rounded-3xl / shadow-sm` utilities are remapped
  onto those vars. **Fallbacks equal Tailwind's stock values**, so a business
  that hasn't picked a style looks byte-identical to before CP-58.
- `components/ui/button.tsx` — base radius reads `--atlas-btn-radius`
  (fallback `0.375rem`), so the agency portal's own buttons are untouched.
- Tokens are spread onto the customer app shell (`app/[business]/app/layout.tsx`)
  and the brand-editor preview root (`customer-preview.tsx`), which also carry
  the new `atlas-surface` class.
- Gradient palettes live in `lib/patterns.ts` (`GRADIENT_PALETTES` +
  `patternStyle` handling) and reuse the existing `background_pattern` column —
  they're just new pattern IDs (`pal-sunset`, `pal-ocean`, …).

New nullable columns: `businesses.card_style`, `businesses.button_style`
(NULL = default). See `cp58_migration.sql`.

## To ship

1. Apply `cp58_migration.sql` in Supabase (adds the two columns).
2. Commit + push (block below), then Vercel redeploys.
3. In the brand editor, open any business → **Brand** tab → try **Card style**,
   **Button style**, and the new gradient palettes under **Background pattern**.
   Watch the phone preview change live; hit **Save**.

## Files touched

- `lib/design-styles.ts` (new)
- `lib/patterns.ts` — gradient palettes
- `lib/types/database.ts` — `card_style`, `button_style`
- `app/globals.css` — scoped `.atlas-surface` remaps
- `components/ui/button.tsx` — radius token
- `app/[business]/app/layout.tsx` — apply tokens + `atlas-surface`
- `components/customer-preview/customer-preview.tsx` — apply tokens + class
- `components/brand-editor/brand-editor.tsx` — two new pickers + save fields

## Verification note

`tsc` run through the sandbox reports phantom syntax errors for this project —
the Linux mount serves bash **stale copies** of files edited on OneDrive (a
known Atlas quirk). Confirmed here directly: bash read a pre-fix copy of
`design-styles.ts` while the real file was already corrected. Edits were
verified against true file state via the editor, not bash `tsc`.

## Next up (deferred to CP-59, per your call)

- One account per email/phone (block welcome-gift farming). Email is already
  unique via Supabase auth; **phone is the real gap** — same phone + a new
  email currently mints a fresh account and a fresh welcome gift.
- Admin portal folders — manual named folders **and** an auto-group-by-industry
  toggle for the business list.
