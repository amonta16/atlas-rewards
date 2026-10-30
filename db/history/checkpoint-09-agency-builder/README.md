# Checkpoint 9 — Agency builder

The agency can now spin up new client businesses, upload logos and hero photos, and CRUD rewards — all without touching the database. This is what makes Atlas Rewards a real cookie-cutter platform.

## What got built

**Backend — `01_storage_and_rpcs.sql`:**
- Two new Storage buckets: `business-heroes` and `reward-images` (both public-read for the customer app, write-restricted to agency admins)
- Storage policies for both buckets
- `create_business(name, slug, industry)` — agency-only RPC that spins up a fully-functional new sub-account with default brand config, widgets, point rules, and tiers
- `upsert_reward(...)` — create or update a reward in one call
- `delete_reward(id, business_id)` — staff-only delete

**Agency UI:**
- **"+ Add Business" button** on the agency dashboard now works → opens a modal asking for name + slug (auto-generated from name, editable) + industry → creates the business → redirects you straight into the brand editor for the new sub-account
- **Logo + hero image** in the brand editor's Brand tab — replaced the URL text inputs with the new `ImageUploader` component. Click-to-pick, drag-replace, instant preview
- **Rewards Manager** in the brand editor's Rewards tab — shows all rewards for this business as cards (with image previews if uploaded), Add/Edit/Delete buttons, an Active toggle, and full Type/Cost/Description editing
- **Reward image uploads** — each reward gets its own photo via the same uploader (aspect 4/3 to match the customer-app card)

**Customer side (automatic — same code path):**
- Logo on the home tab now renders from Storage
- Hero image background renders the actual photo if uploaded
- Rewards Store grid shows uploaded reward photos instead of generic gift icons

## How to install (1 min)

1. Supabase SQL Editor → run [`01_storage_and_rpcs.sql`](01_storage_and_rpcs.sql). Idempotent.
2. Restart `npm run dev`.

## How to test

**Create a new business (90 seconds):**
1. `lvh.me:3000/agency` → tap **+ Add Business**
2. Type "Joe's Gym" → slug auto-fills `joes-gym` → pick "Gym / Fitness" → Create
3. You land in the brand editor for the new business
4. **Logo:** tap the logo box → pick a PNG → upload → preview shows
5. **Hero:** tap the hero box → upload a photo of a gym → preview shows
6. **Brand colors:** change primary to green
7. Hit **Save changes** (top right)
8. Open `joes-gym.lvh.me:3000` in a new tab → landing page shows your branded customer view with the new logo, hero, and colors

**Edit rewards (60 seconds):**
1. Back in the brand editor for Joe's Gym → click the **Rewards** tab
2. Scroll past the point sliders to the **Rewards store** section
3. Tap **+ Add reward** → fill in: name "Free guest pass", type "Free service / item", cost 500, upload an image → Save
4. The card appears in the grid. Tap it → Edit → toggle Active off → see the "Inactive" badge → toggle back on
5. Refresh `joes-gym.lvh.me:3000/app/rewards` (sign in as a test customer of this business first) → your new reward appears in the customer-facing grid with the image you uploaded

## What's NOT in CP 9 (intentionally minimal)

- **Tier editor** — the `tiers` JSONB field exists in the schema with sensible defaults (Bronze/Silver/Gold/VIP). Visual editor for changing thresholds and perks deferred.
- **Offers tab CRUD** — the schema doesn't have an offers table yet; we use the sticky "Free hotdog with $20 spend" hardcoded banner. Easy to add an `offers` table + CRUD later.
- **Products / Services catalog UI** — the `services` JSONB field accepts an array but the editor is deferred.
- **Settings tab** — placeholder. Will be wired in CP 12 with email/SMS preferences.

## Approval gate

Once you've created at least one new business through the modal and uploaded a logo + at least one reward image, CP 9 is done. Next is **CP 10 — analytics dashboard** (revenue attribution, repeat visits, dormant recovery, customer LTV — the agency rollup that turns this from a feature into a product you can sell).
