# Checkpoint 64 — Demo Image Library

The "stop googling stock photos" checkpoint. A pre-curated image library,
organized by **industry** (Medspa, Smoke Shop, Beauty Salon, Dispensary,
Coffee Shop, Arcade, Ice Cream, Restaurant) and by **slot**
(**Hero / Rewards / Offers**), baked right into the builder. Every image
field in the agency builder now has a **Choose from library** button —
pick a photo, it drops straight in. Building a demo app no longer involves
an image hunt.

**No API key needed.** The seeder pulls from Openverse (openverse.org), the
WordPress-run index of CC-licensed images — anonymous access, no signup.
Licenses are filtered to commercial-use-allowed, and each image's creator +
license is stored and shown on hover in the picker.

## What shipped

- **`image-library` storage bucket + `image_library` catalog table**
  (`cp64_image_library.sql`) — public read (customer apps render the URLs
  directly), agency-admin write, staff-only browsing, soft-hide flag.
- **Curated shot list** (`scripts/image-library-manifest.mjs`) — 8 industries
  × 3 categories × ~12 images each (~290 photos), hand-tuned searches per
  slot (e.g. Medspa hero = spa receptions + treatment rooms; Medspa rewards =
  facials, Botox, massages, laser; offers = product shots + results
  close-ups).
- **Seeder** (`scripts/seed-image-library.mjs`) — keyless: searches Openverse,
  downloads, uploads to the bucket, catalogs every photo with title + search
  tags + credit. Idempotent and resumable: re-runs skip full categories and
  only top up what's missing. Also uploads anything you drop in
  `scripts/library-local/<industry>/<hero|reward|offer>/` (no internet needed
  for those).
- **Library picker** (`components/agency/image-library-picker.tsx`) — clean
  poppy modal: industry chips, Hero/Rewards/Offers tabs, search, hover →
  **Use** (or **hide** a dud from the library forever).
- **One-line integration** — `ImageUploader` gained an optional `library`
  prop; wired into the **brand editor hero**, **rewards manager**,
  **offers manager**, and **automated offers**. The picker opens pre-filtered
  to the business's industry (medspa → Medspa, salon → Beauty Salon,
  coffee → Coffee Shop, yogurt → Ice Cream, …).

## Apply it (once)

1. **SQL** — run `cp64_image_library.sql` in the Supabase SQL editor.
2. **Seed** — from the app folder (uses the Supabase keys already in
   `.env.local`; nothing new to configure):

   ```bash
   cd "checkpoint-02-brand-engine/atlas-rewards-app"
   node scripts/seed-image-library.mjs --dry-run   # preview the plan
   node scripts/seed-image-library.mjs             # ~290 photos, 10-15 min
   ```

3. Open the builder → any business → Brand editor hero (or a reward/offer
   image) → **Choose from library**. Done.

> **Pacing note:** Openverse allows 200 anonymous searches/day; a full seed
> uses ~130, and the script paces itself under the per-minute limit (that's
> why it takes ~10-15 min). If it ever stops early, run it again later — it
> resumes exactly where it left off and never duplicates.

> **Quality note:** CC stock is more hit-or-miss than commercial stock. The
> picker's **hide** button (hover any photo → eye-off icon) exists exactly
> for this — hide the duds once and they're gone for good. You can also drop
> hand-picked images into `scripts/library-local/…` any time.

## Growing the library

- **More images for a niche** — bump an `n` (or add a query) in
  `scripts/image-library-manifest.mjs`, re-run the seeder. Only new photos
  are fetched.
- **A whole new industry** (say, pet grooming) — add a key to the manifest
  with hero/reward/offer queries, re-run the seeder. No SQL migration; the
  picker discovers industries automatically. Optionally add a pretty label +
  business-industry mapping in `lib/image-library.ts`.
- **Your own shots / VA-picked images** — drop files into
  `scripts/library-local/<industry>/<hero|reward|offer>/` and re-run the
  seeder. They show up tagged "local".
- **Prune duds** — hover any library photo → the eye-off button hides it
  everywhere, forever (soft-delete; nothing breaks for apps already using it).

## Files

New:
- `checkpoint-64-image-library/cp64_image_library.sql`
- `atlas-rewards-app/lib/image-library.ts`
- `atlas-rewards-app/components/agency/image-library-picker.tsx`
- `atlas-rewards-app/scripts/image-library-manifest.mjs`
- `atlas-rewards-app/scripts/seed-image-library.mjs`

Changed:
- `components/agency/image-uploader.tsx` — optional `library` prop +
  "Choose from library" button.
- `components/brand-editor/brand-editor.tsx` — hero uploader gets the
  library (category: hero).
- `components/agency/rewards-manager.tsx` — reward image gets the library
  (category: reward).
- `components/agency/offers-manager.tsx` — offer image gets the library
  (category: offer).
- `components/agency/automated-offers-manager.tsx` — automated-offer card
  image gets the library (category: offer).

## Ship it

```bash
cd "C:/Users/andre/OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git add checkpoint-64-image-library checkpoint-63-admin-field-app "checkpoint-02-brand-engine/atlas-rewards-app"
git commit -m "CP-64: per-industry demo image library — bucket + catalog + keyless Openverse seeder + Choose-from-library picker"
git push
```

Then apply the SQL and run the seeder (steps above).
