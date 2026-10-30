# Checkpoint 85 — Raffle Giveaway (new Custom Offer type)

Raffles are now a second offer type inside the existing Custom Offers feature —
no new nav, no new tab. The "+ Add offer" button in the Offers manager (agency
brand editor **and** the manager app's Offers tab) opens a type picker:
**Standard offer** (the exact flow that existed before) or **Raffle Giveaway**.

## Apply the SQL first

Paste `cp85_raffles.sql` into the Supabase SQL editor and Run. Idempotent —
safe to re-run. It creates `raffles` / `raffle_entries` / `raffle_audit`,
all the RPCs, RLS, realtime publication, the raffle points-ledger rule types,
and (if pg_cron is available) a 5-minute backstop sweep.

## What shipped

**Owner / staff (inside OffersManager):**
- Raffle editor: title, description, promo image (offer-images bucket), prize,
  entry cost in points (0 = "Free Entry"), start/end **with time zone picker**
  (stored UTC, edited & displayed in the chosen zone), max entries per
  customer, optional total entry cap, terms, winner display format
  ("Khaled M." vs full name), optional claim deadline.
- Raffle rows in the same offers list — live status chip (Scheduled / Open /
  Ended / Winner Selected / Cancelled — first three derive automatically from
  the clock), entries count, end time.
- **Entries view**: totals, unique participants, searchable participant list
  with per-person entry counts + timestamps, winner highlight, prize claim
  buttons (Not Claimed / Claimed / Expired), cancel with warning, and a
  **manager-only administrative redraw** that requires a typed reason and is
  permanently written to `raffle_audit`. Front-desk staff can view entries and
  mark claims but cannot redraw (RLS + RPC enforced, same CP-22 role model).

**Customer (Rewards tab, same area as Limited offers):**
- Premium card: brand-gradient ring + glow, hero image with prize spotlight,
  countdown badge (seconds under an hour), entry-cost / FREE ENTRY badge,
  total + "You: N entries" chips, terms fine print.
- Enter flow: confirmation sheet spelling out the cost and balance-after →
  atomic server-side charge+entry → "You're in!" flash (small celebration;
  confetti is reserved for the winner screen). Insufficient points disables
  the button and shows exactly how many more are needed.
- Results: winner gets a full-screen **You Won!** overlay (confetti, prize,
  claim instructions, optional deadline); everyone else gets "Giveaway
  Winner: <display name>" + thank-you + a clear not-selected message.
  Auto-opens once per raffle, reopenable by tapping the card.

**Backend guarantees:**
- `enter_raffle` — one transaction: validates open window + limits, deducts
  via the existing `award_points` (row-locked, balance-checked), records the
  entry. Client-generated `entry_key` (uuid, unique) makes retries/double
  taps/refreshes return the original entry instead of charging twice.
- `finalize_raffle` — server-side draw with pgcrypto CSPRNG
  (`gen_random_bytes`), once-only under a `FOR UPDATE` lock shared with
  `enter_raffle` (no entry can land mid-draw), result saved permanently with
  drawn-at timestamp + winning entry, all audited. No entries → raffle marked
  ended-no-entries and the owner is told; no winner drawn.
- Draw triggering is belt-and-suspenders: customer Rewards tab + staff panel
  each fire `POST /api/raffles/sweep` on load (draws due raffles AND sends
  the phone pushes to winner + staff), and pg_cron sweeps every 5 min as
  backstop (in-app bell rows always written in SQL either way).
- **Cancellation auto-refunds every entry** (Andrew's decision, Jul 2026),
  notifies entrants, and is audited. Owner sees a warning with exact
  entry/member counts before confirming.
- New-raffle launch announces to customers through the existing
  announce-offer push path (`kind: "raffle"` → "New giveaway just dropped 🎟️"),
  respecting the business's notification master toggle.

## Files

| File | Status |
|---|---|
| `checkpoint-85-raffle-giveaway/cp85_raffles.sql` | NEW — run in Supabase |
| `components/agency/raffle-manager.tsx` | NEW — editor + list + admin modal |
| `components/customer/raffle-section.tsx` | NEW — customer cards + entry + results |
| `lib/raffles.ts` | NEW — shared types + UTC↔zone helpers + sweep |
| `app/api/raffles/sweep/route.ts` | NEW — lazy finalize + push fan-out |
| `components/agency/offers-manager.tsx` | MOD — type picker + raffle list (grow-only) |
| `components/customer/rewards-client.tsx` | MOD — renders RafflesSection (grow-only) |
| `app/api/notifications/announce-offer/route.ts` | MOD — raffle heading (grow-only) |

## CP-85.1 — Raffle acts as the FEATURED offer

Second SQL file: run `cp85_1_featured_raffle.sql` AFTER `cp85_raffles.sql`.

- `raffles.is_featured` (default ON, toggle in the raffle editor — same amber
  Featured box the offer modal uses; amber ⭐ chip on the staff row).
- **Sticky top banner**: while a featured raffle is OPEN it takes over the
  banner on every customer tab — "🎟️ WIN <prize>" + live countdown pill +
  "Enter →"; the whole banner is a tap target to the Rewards tab. Raffle
  outranks the featured offer; the offer banner returns after the draw.
- **Home featured card**: the raffle gets the same glow-ring hero card as the
  featured offer (ribbon says 🎟️ Giveaway) with prize headline, live
  countdown badge, entry-cost / FREE ENTRY chip, entries-so-far, and a big
  "Enter the giveaway" button → Rewards tab. Renders ABOVE the featured
  offer card; both can coexist.
- New `featured_raffle()` RPC + `upsert_raffle` gains `p_is_featured` +
  staff list returns `is_featured`.
- Extra files: `components/customer/featured-raffle-card.tsx` (NEW),
  `featured-offer-banner.tsx` (MOD), `app/[business]/app/page.tsx` (MOD),
  `app/[business]/app/layout.tsx` (MOD), `lib/raffles.ts` (MOD),
  `raffle-manager.tsx` (MOD).

## Verified

Full cloud-mirror typecheck (`tsc --noEmit -p tsconfig.json` over the whole
project with fresh file overlays): **0 errors**.

⚠️ Side note found while verifying: `package-lock.json` on disk is out of
sync with `package.json` (the CP-76+ Capacitor deps aren't in the lock), so
`npm ci` fails locally. Vercel builds evidently use install, but when you get
a minute: `npm install` in the app folder and commit the refreshed lockfile.

## Edge cases covered

Enter after deadline (server rejects, card flips), insufficient points
(disabled + shortfall shown), rapid taps / lost connection / refresh
(idempotent entry_key), raffle ends mid-submit (same lock → clean "just
ended" toast), zero entries (ended, owner notified, no winner), cancel
(no winner ever drawn + auto-refund + audit), end-time/zone edits (blocked
after draw; validated before), double finalize (status guard + row lock →
second call no-ops, pushes only from the call that actually drew).
