# CP-113 — Instant demo builder (Phase 1)

One button in the field app that builds a fully-seeded demo app at the door, so reps spend time knocking, not configuring.

## What one tap creates
A new `is_demo` business, dropped in a **"Demos"** folder, with:
- **Branding** — colors pulled straight from the shop's logo (extracted in the browser, no API cost) or a chosen color theme; a monogram tile if there's no logo.
- **4 store rewards** with point costs + images from your niche image library.
- **A spin wheel** — weighted points wedges + **1 free reward** wedge; demo mode means it spins with no check-in.
- **A featured offer** with an image.
- **A 4-week streak roadmap** — milestones at weeks 2–5, a mix of points and rewards (first reward at week 2).

Reps pick **name, niche (food / smoke / beauty), an optional logo, and a color theme** — that's it. The result screen shows a QR + "Open demo" to show on the spot.

## Deploy
1. Apply `cp113_instant_demo.sql` in the Supabase SQL editor (creates the `create_demo_business` RPC — non-destructive, idempotent).
2. Deploy the app code.
3. Optional: run `cp113_seed_test.sql` (rolls itself back) → expect `✅ CP-113 DEMO SEED OK`.

## Files
- `cp113_instant_demo.sql` — the `create_demo_business(name, slug, industry, brand_colors, logo_url, pack)` RPC. Agency-staff gated; seeds everything atomically; slugs auto-suffix so batch runs never collide.
- App: `lib/logo-colors.ts` (logo→palette + monogram), `lib/demo-packs.ts` (the niche content packs + color themes — edit copy/point-costs here, no SQL), `components/field/field-demo-modal.tsx` (the form + QR), `app/field/field-client.tsx` (the "Build instant demo" button).

## Notes / next
- **Streak reward milestones display but don't auto-grant on check-in** — this is the existing streak-engine limitation flagged in the CP-110 audit, not new here. For a demo (all about the visual pitch) it's exactly right; points milestones do award. If you later want reward milestones to actually pay out, that's a separate check-in-engine change.
- Images come from `image_library` by niche `industry` slug (`restaurant` / `smoke-shop` / `beauty-salon`). If a niche is thin, run the CP-64 Pexels seeder so demos look full.
- **Phase 2 (next):** a batch "pre-generate a street" tool on the agency deck, using the same RPC in a loop.
- **Phase 3 (optional):** Google Places address enrichment (auto name/category/photos) layered on top — needs a Google billing key; logo-first stays the fallback.
