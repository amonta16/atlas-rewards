# Med spa split: runbook

## Phase 0: safety (done)

- Tag `pre-split-cp227` points at `337af96` (CP-227), the last production commit before the split.
- **Rollback:** in Vercel → Deployments, find the last deployment built from `337af96` and press **Promote to Production** (instant, no rebuild). In git: `git checkout main && git reset --hard pre-split-cp227 && git push --force-with-lease`.
- Supabase: Phase 1 changes no SQL. Take a backup anyway before Phase 2 (Dashboard → Database → Backups).

## Phase 1: monorepo layout (this branch: `monorepo-split`)

Only files moved. No app code changed. Verified in a clean build:
same 109 routes, same bundle sizes (87.8 kB shared JS, 82.1 kB middleware), 12/12 tests pass.

| Before | After |
|---|---|
| `checkpoint-02-brand-engine/atlas-rewards-app/` | `apps/venues/` |
| `mobile-shell/` | `native/venues-shell/` |
| `checkpoint-*/` (root and inside the app) | `db/history/checkpoint-*/` |
| SQL/notes in `Claude outputs/` | `db/history/claude-outputs/` |
| root reports, runbooks | `docs/` |
| `sales-and-manuals/` | `docs/sales/` |
| VA + interview docs | `docs/hiring/` |
| `atlas-engine-native/` | `archive/atlas-engine-native/` |
| `_to_delete/`, screenshots, `.mov`, tarballs, `tsconfig.tsbuildinfo` | removed from the repo (still in git history and in the tag) |

### Going live (about 5 minutes)

1. Push the branch: `git push -u origin monorepo-split`. Vercel builds a preview. **It will fail** (still looking in the old folder). That is expected and doesn't touch production.
2. Vercel → atlas-rewards → Settings → Build and Deployment → **Root Directory** → change
   `checkpoint-02-brand-engine/atlas-rewards-app` to `apps/venues` → Save.
   (Production stays on the current deployment; root directory only affects new builds.)
3. Deployments → the failed `monorepo-split` preview → **Redeploy**. It should go green.
4. Open the preview URL and run the smoke test below on it.
5. Merge: `git checkout main && git merge monorepo-split && git push`. Production rebuilds from `apps/venues`.
6. Run the smoke test again on production. Check Vercel → Settings → Cron Jobs still lists all 7 crons.

If step 5 goes wrong, use the rollback above.

### Your local folder

Checking out this branch in the current OneDrive folder moves everything under you. Cleaner option: make a fresh clone for the monorepo, for example `C:\Users\andre\code\atlas`, run `npm ci` inside `apps/venues`, copy `.env.local` into `apps/venues/`, and keep the old folder as a read-only archive. (Keeping code out of OneDrive also makes git and builds much faster.)

## Flippo's smoke test (10 checks)

Run on the preview (step 4) and again on production (step 6).

1. `atlas-engine.app` home page loads; "Book a demo" opens.
2. `atlas-engine.app/med-spas` and `/venues` load.
3. Flippo's customer app (`<flippos-slug>.atlas-engine.app/app`) loads, with points shown, while signed in.
4. Rewards tab opens; a reward detail opens.
5. Chris's manager login → `/manage` loads; the member list shows up.
6. Front desk: look up a test member by phone; award 1 point to a test account (then undo it).
7. Scan page opens the camera (phone).
8. Send a test push from the agency notifications screen to your own test account; it arrives.
9. `/agency` loads for your admin account; the Flippo's builder opens.
10. iOS app "Atlas Rewards" opens to `/join` and lands on Flippo's (no app update needed; it loads the live site).

## Next phases

2. `apps/medspa` + `packages/core`, phone-code sign-in (Twilio), Dermis-style patient app
3. Move Lotus and the med spa demos to the med spa app; redirects for old links
4. Delete med spa code from `apps/venues`
5. Admin: Venues | Med Spas switch; separate med spa builder and desk
6. `native/medspa-shell` (`com.atlasengine.medspa`), per-clinic icons, App Store
