# Checkpoint 63 — Atlas Command (Admin Field App) · Phase 1

A phone-first companion for the door-sales crew (all agency admins, including
you). It layers **on top of** the web app builder — nothing about the builder
changes. Iron-Man command-center styling (deep navy, cyan glow, arc-reactor HUD).

## What Phase 1 ships

- **Field App** at **`/field`** (phone-first, admin-only):
  - **My MRR HUD** — your live monthly commission, pipeline commission, won +
    claimed counts.
  - **Pitch-day launcher** — every built demo app grouped by its **location
    folder** (folders stay in sync with the web builder). Filter by **Today /
    This week / All**. Tap **Open app** to pull up the customer app on the
    prospect's phone.
  - **Self-claim** — tap **Claim** to put your name on a deal. If it's already
    another rep's, it's locked (the owner can reassign).
  - **Deal terms sheet** — set the **deal MRR**, commission % override, pitch
    date, and stage (Demo → Pitched → **Won** → Lost). Marking a claimed deal
    **Won** rolls its commission into your MRR.
- **Admin App tab** at **`/agency/admin-app`** (desktop, admin-only):
  - Link to open the field app on a phone (+ copy).
  - **Default commission %** (owner-editable; defaults to **30%**).
  - **Agency owner** setting ("Make me owner") — the owner can reassign claims.
  - **Rep leaderboard** — everyone ranked by monthly commission.

Reps self-claim; commission = **30% (default) of the deal MRR you set per deal**.

## Apply the SQL

Run **`cp63_migration.sql`** in the Supabase SQL editor (after cp62). Idempotent.
It adds claim/deal columns to `businesses`, an `admin_app_config` singleton, and
the claim / deal-terms / earnings / leaderboard RPCs.

**One-time:** open the **Admin App** tab and click **Make me owner** (or run
`update admin_app_config set owner_user_id = '<your-uid>' where id = 1;`).

## How to run a pitch day

1. In the web builder, build each prospect's demo app and file it into a
   location folder (e.g. "Bakersfield").
2. On each app, set a **pitch date** (Field App → app → Deal terms), and the
   **deal MRR** you'll quote.
3. On the road, open `/field` on your phone → filter **Today** → tap **Open app**
   to demo, tap **Claim** to grab the deal.
4. Close it? Set stage to **Won** — your MRR HUD updates instantly.

## Files

New: `app/field/page.tsx`, `app/field/field-client.tsx`,
`app/(agency)/agency/admin-app/page.tsx`,
`components/agency/admin-app-client.tsx`, `checkpoint-63-admin-field-app/cp63_migration.sql`.
Changed: `components/agency/sidebar.tsx` (Admin App tab), `lib/types/database.ts`
(claim/deal fields + FieldApp/RepEarnings/RepLeaderRow types).

## Coming next (not in this checkpoint)

- **Phase 2** — daily motivational nudges: an editable set of 7 weekday messages
  delivered each morning as an in-app bell notification **and** a phone push, with
  a config editor on the Admin App tab.
- **Phase 3** — mini mobile pipeline (leads without apps yet) + installable PWA
  polish (manifest, offline, real "Add to Home Screen").

## Note / open question

A VA can technically still write the new `businesses` claim/deal columns via the
CP-62 staff update policy (they have no UI for it, and the field app is
admin-only). Low risk with a trusted assistant; tell me if you want those columns
locked to admins at the row level.

## Ship it

```bash
cd "C:/Users/andre/OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git add checkpoint-63-admin-field-app "checkpoint-02-brand-engine/atlas-rewards-app"
git commit -m "CP-63 Phase 1: Atlas Command field app — pitch launcher, self-claim, deal MRR + 30% commissions, rep leaderboard"
git push
```
