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

---

# Phase 2 — Daily motivational nudges ✅

A "let's build apps today" nudge for the crew each morning: an in-app bell entry
in the Field App **and** a phone push. You edit one message per weekday.

**What shipped**
- **`cp63_2_nudges.sql`** — nudge columns on `admin_app_config` (enabled + 7
  weekday messages, pre-seeded with hype defaults) and a new
  `admin_notifications` table (the reps' bell feed — separate from the customer
  `notifications` table, so nothing there is touched).
- **Nudge bell** in the Field App header (unread badge, "turn on push for this
  phone").
- **Daily Motivation card** on the Admin App tab — toggle, the 7 weekday
  messages, and **Send test to me**.
- **Delivery**: `/api/admin-app/daily-nudge` fans the day's message to every
  admin's bell + push. Wired to a **Vercel Cron** (added to `vercel.json`) at
  `0 15 * * *` (≈ 8am PT — change the schedule to taste).

**Apply / configure**
1. Run **`cp63_2_nudges.sql`** in Supabase (after `cp63_migration.sql`).
2. Set the env var **`CRON_SECRET`** (any long random string) in Vercel — the
   cron route rejects calls without `Authorization: Bearer $CRON_SECRET`. This is
   the same secret the existing `process-pending` cron already uses.
3. Reps open `/field` → bell → **Turn on push for this phone** (grants the
   browser notification permission + saves their device).
4. Edit messages in **Admin App → Daily motivation**, hit **Send test to me** to
   preview.

> Push needs VAPID keys (the same ones the customer push already uses). If they're
> not set, the bell still works and push is silently skipped.

---

# CP-63.1 — notifications button, undo claim, in-app leaderboard ✅

Fixes/additions from field feedback:

- **Notifications weren't obvious.** The Field App now shows a big **"Turn on
  notifications"** banner (like the customer apps) whenever permission isn't
  granted, and silently re-registers the device when it is. Tapping it prompts
  the browser + subscribes this phone. (Push still needs VAPID keys set.)
- **Undo a claim.** A claimed-by-you app now has an explicit red **Unclaim**
  button (was the ambiguous "Mine"). One tap releases it.
- **Leaderboard inside the Field App.** New **Pitch day / Leaderboard** toggle at
  the top. The Leaderboard view shows the **team's total MRR** (from won deals),
  total commissions, apps built + sold, and every rep ranked with **apps built ·
  apps sold · their MRR + commission**. You're highlighted.
- **Who built the most apps.** New `businesses.created_by` (stamped on create)
  powers an "apps built" stat alongside "apps sold". Historical apps show 0 built
  (we can't know past creators) until new ones are made.
- **Group MRR on desktop too** — the Admin App tab's leaderboard gained a team
  totals row (Team MRR / Commissions / Apps built / Apps sold).

**Apply:** run **`cp63_3_leaderboard.sql`** (after `cp63_2_nudges.sql`).

> If push still doesn't fire after tapping the banner: confirm the VAPID env vars
> are set (same keys the customer push uses) and that you allowed notifications in
> the browser prompt. iOS Safari only allows web push once the site is added to
> the Home Screen (Phase 3 makes that a proper install).

---

## Coming next (Phase 3, not yet built)

- Mini mobile pipeline (leads without apps yet) + installable PWA polish
  (manifest, offline, real "Add to Home Screen").

## Note / open question

A VA can technically still write the new `businesses` claim/deal columns via the
CP-62 staff update policy (they have no UI for it, and the field app is
admin-only). Low risk with a trusted assistant; tell me if you want those columns
locked to admins at the row level.

## Ship it

```bash
cd "C:/Users/andre/OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git add checkpoint-63-admin-field-app "checkpoint-02-brand-engine/atlas-rewards-app"
git commit -m "CP-63: Atlas Command field app + nudges + notifications button, undo claim, in-app leaderboard & team MRR"
git push
```

Apply the three SQL files in order: `cp63_migration.sql` → `cp63_2_nudges.sql` → `cp63_3_leaderboard.sql`.

Remember to set **`CRON_SECRET`** in Vercel for the daily-nudge cron.
