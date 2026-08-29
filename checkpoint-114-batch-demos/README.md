# CP-114 — Batch demo pre-generator (Phase 2)

"Pre-generate a whole street." Paste a target list and build every demo up front, so each door is already ready during the day.

## What it does
A **"Batch build"** button in the Field app (next to "Instant demo", Pitch-day view). Opens a tool where you:
1. Paste your list — **one business per line**, optionally `Name, niche` (e.g. `Joe's Diner, food`). It guesses the niche from the name/hint when you don't specify.
2. Pick a fallback type (food / smoke / beauty) for lines that don't say one.
3. Pick colors — **Auto (varied)** so the batch isn't monochrome, or one theme for all.

It then loops the CP-113 `create_demo_business` RPC for each row with a **live progress bar** and a per-row result list (✓ / ✗ + a link), and drops everything into the **Demos** folder. "Copy all links" exports them.

## No new SQL
This is frontend-only — it reuses the verified CP-113 generator. Nothing to apply in Supabase; just deploy the app.

## Trade-off (by design)
Batch **skips the logo step** (you can't snap 20 logos in advance), so batch demos use a color theme + a **monogram tile**. They're still fully loaded (rewards, wheel, offer, streak) — just not the shop's real logo. Use the single **Instant demo** button when you want the real logo pulled from a photo. You can also add a logo to any demo later in the builder.

## Files
- `components/field/field-batch-modal.tsx` (new) — the paste-list + progress UI.
- `lib/demo-packs.ts` — added `guessNiche()`, `PRESET_THEMES`, `themeForIndex()`.
- `app/field/field-client.tsx` — "Batch build" button + modal wiring (now a 2-up row with Instant demo).

## Next (optional)
Phase 3 — Google Places address enrichment (auto name/category/photos) layered on top; needs a Google billing key. Logo-first + batch stay the free path.
