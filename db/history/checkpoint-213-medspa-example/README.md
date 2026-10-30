# CP-213 · Example med spa clinic, Dermis-style gift, new med spa photo library

**Check after push:** Agency → a med spa business → **Load example clinic** (header). Field app → Instant demo → Medspa (checkbox "Fill with example clinic"). Then open the customer app Home.

## Example clinic (quick mockups that look fully built)
- `lib/medspa-example.ts`: one clinic built from the Dermis "Patient App Template" and "Treatments to upload" docs.
  - **Treatments:** 13, with real prices, descriptions, aftercare and recall windows. HydraFacial, BOTOX®, JUVÉDERM®, Restylane Lyft, Morpheus8, Alma Harmony, Cutera Xeo®, Emface®, Sofwave™, Emsculpt NEO, CoolSculpting, Age Spot Removal.
  - **Shop:**
    - 4 treatment packages
    - SkinCeuticals C E Ferulic® ($182) and Alastin Gentle Cleanser ($58)
    - Gift card
    - Klarna and Affirm on
  - **Team:** Dr. Jane Preview.
  - **Before/after results:** 12.
  - **Credits:** $150/mo.
  - **Rewards:** 6 from the template ($25 off your first purchase, Emsculpt / CoolSculpting trials, 15% off HydraFacials, 30% off Alma, a free Alastin cleanser).
  - **Hero photo:** included.
- `applyExampleClinic()` writes it all in one step, straight to the database (no Save needed). Rewards the business already has (by name) are skipped.
- Where to find it:
  - **Builder header → "Load example clinic"** (med spa layout only; asks before replacing an existing menu)
  - **Field → Instant demo → Medspa** ("Fill with example clinic", on by default)
  - **Batch demos:** med spa rows always get the example
- Photos (Dermis-approved, from the two Drive folders) ship with the app in `public/medspa-example/` (42 files, 1.8 MB), so there's nothing to upload.

## Gift on Home: Dermis look + name + always on for demos
- The scratch card front is now a kraft-paper parcel with a striped ribbon in the brand colour, a bow, and a **name tag with the patient's name** in handwriting (Caveat font, new dependency `@fontsource/caveat`). A "Scratch to unwrap" tooltip sits on top.
- **Demo businesses (`is_demo`) always show the example gift** ("Welcome gift · $25 off your first purchase") when no real one is pending.
  - It's never saved, so it comes back on every refresh.
  - Claiming it opens the real gift screen with a sample desk code (`WELC25X`).
- **New "Real results" rail on med spa Home:** before/afters from Builder → Gallery, tap to compare. Before this, the gallery was stored but never shown to patients.

## Image library (medspa)
- `cp213_medspa_library.sql` replaces every medspa library entry (41 Pexels shots, including a stray vape photo) with 12 Dermis photos: 4 hero, 4 reward, 4 offer.
- **Run it after this push is live.** The new library rows point at `https://www.atlas-engine.app/medspa-example/…`.
- Only catalog rows are deleted. The old storage files stay, because the `/med-spas` site still uses some of them.

## Verified
- `tsc` 0 errors and `next build` green.
- Playwright at 390 px on a harness of the real Home view with the example config: hero, points, gift (scratch → claim → code sheet), rewards, shop, results, team. No console errors.
- **Not clicked through with a real login:**
  - the builder button
  - the field demo flow

## Layout lock fix (already applied to production)
`cp213_layout_lock_fix.sql`: picking Medspa when creating an app was being reset to Classic by the CP-209 layout lock. The layout can now change for 30 minutes after an app is created, then it locks. The demo `med` was switched to Medspa.
