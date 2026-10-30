# Atlas Engine

One repo, two products. Each product deploys on its own, so a change to one can't take down the other.

```
apps/
  venues/            Atlas Rewards: entertainment venues + general businesses (Flippo's).
                     Next.js on Vercel. Root Directory = apps/venues.
  medspa/            Atlas Med Spa patient app (Dermis-style): find location, phone sign-in,
                     Home, Shop (memberships, treatments), Rewards, Profile. Vercel Root = apps/medspa.
packages/
  core/              Code both apps share: Supabase clients + session cookies, memberships, image URLs.
native/
  venues-shell/      Capacitor iOS/Android shell for "Atlas Rewards" (com.atlasengine.rewards).
  medspa-shell/      (Phase 6) Capacitor shell for the med spa app (com.atlasengine.medspa).
db/history/          Every checkpoint's applied SQL + notes, in one place (was checkpoint-*/ folders).
docs/                Reports, runbooks, sales collateral, hiring docs.
archive/             Old experiments kept for reference (the abandoned Expo app).
```

## Daily use

```bash
cd apps/venues
npm ci          # first time only
npm run dev     # http://lvh.me:3000
```

Or from the repo root: `npm run dev` / `npm run build`.

Med spa app (uses npm workspaces with `packages/core`, so install from the repo root):

```bash
npm install            # repo root, first time only
npm run medspa:dev     # http://localhost:3100/demo  (built-in example clinic)
```

`apps/venues` is NOT a workspace member: it keeps its own `package-lock.json` and installs on its own, exactly as before.

## Rules that keep the split clean

1. **Venue code never imports med spa code, and the reverse.** Shared code goes in `packages/`.
2. **Shared tables** (`businesses`, `profiles`, `business_users`, `business_memberships`, points, push subscriptions, notification queue) only change through `packages/core` migrations. Each app owns its own prefixed tables (`medspa_*`).
3. **A business's product is set at creation and never changes** (`businesses.product`: `venue` | `medspa`).
4. **New SQL** goes in `db/history/cp-<number>-<name>/` with a README, same as before.

## Rollback

The last commit before the split is tagged `pre-split-cp227`. Steps and smoke test: [docs/SPLIT_RUNBOOK.md](docs/SPLIT_RUNBOOK.md).
