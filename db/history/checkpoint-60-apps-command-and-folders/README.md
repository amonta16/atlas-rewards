# CP-60 — Apps command deck + real folders (split from Analytics)

Andrew's asks: separate the app-admin view from analytics, make the apps feel
bigger with a "Tony Stark" command-deck vibe, and give folders real teeth —
create them, rename them, and add a cover image.

## What changed

**Two tabs instead of one mashed page.**
- **My Apps** (`/agency`) — the new Apps command deck (default landing).
- **Analytics** (`/agency/analytics`) — the KPI header + revenue/portfolio
  charts that used to sit under the business list. New sidebar link with a
  chart icon.

**Apps command deck — folder drill-in.**
- Opens on a grid of **big folder cards** with cover art: an **All Apps** card,
  each of your folders, an **Unfiled** card (only if you have unfiled apps), and
  a **＋ New folder** tile.
- Click a folder to **drill in** — its apps show as large glowing tiles (hero
  cover, logo chip, name, industry, status). Back button returns to folders.
- Each app tile has a **Move** button (dropdown to any folder / Unfiled / new
  folder), **Open**, and **Delete**.
- **Search** at the top searches every app across all folders at once.
- Dark navy canvas with cyan glow, hover lift + ring — the command-deck feel,
  but the structure stays flat and readable (folders → apps, two levels).

**Real folders (not just a text label).**
- New `business_folders` table (name, cover_image_url, sort). Businesses point
  at one via `businesses.folder_id`.
- **Create / rename / cover-image / delete** via the folder modal (pencil on a
  folder card, or ＋ New folder). Cover images upload to a new `folder-covers`
  storage bucket.
- Deleting a folder just **unfiles** its apps (FK `ON DELETE SET NULL`) — it
  never deletes the businesses.
- The CP-59 `businesses.folder` text values (if you applied CP-59) are
  **auto-migrated** into real folders by `cp60_migration.sql`.

## To ship

1. Apply `cp60_migration.sql` in Supabase — creates the folders table +
   `folder_id` + the `folder-covers` bucket + backfills any CP-59 folders.
2. Commit + push (block below); Vercel redeploys.
3. Open **My Apps**: make a folder, give it a cover, drag a couple apps in with
   the Move button, drill in. Check **Analytics** shows the charts.

## Files

- `cp60_migration.sql` (new)
- `components/agency/apps-admin-client.tsx` (new) — the command deck
- `components/agency/folder-edit-modal.tsx` (new) — create/rename/cover/delete
- `components/agency/analytics-client.tsx` (new) — extracted analytics view
- `app/(agency)/agency/page.tsx` — now renders the Apps deck (+ loads folders)
- `app/(agency)/agency/analytics/page.tsx` (new)
- `components/agency/sidebar.tsx` — Analytics nav item
- `components/agency/image-uploader.tsx` — `folder-covers` bucket
- `lib/types/database.ts` — `BusinessFolder`, `businesses.folder_id`
- `components/agency/agency-dashboard-client.tsx` — now **unused** (superseded;
  left in place, not imported anywhere). Safe to delete whenever.

## Verification note

Same OneDrive quirk as CP-58/59: the sandbox mount hands bash **partial/
truncated** copies of freshly-written files (confirmed again here —
`types/database.ts` came through `cp` cut off mid-word), so bash `tsc` can't be
trusted. All edits were verified against true file state via the editor.
