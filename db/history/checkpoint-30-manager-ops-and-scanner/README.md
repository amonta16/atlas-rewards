# Checkpoint 30 — Manager day-to-day ops + USB QR scanner

Fast customer lookup, live daily recap, plug-and-play scanner support,
and a 30-second Undo on point grants.

## What Andrew picked for CP-30

- **Manager**: Daily/weekly recap card on the dashboard + faster
  customer lookup (search by name / phone / email / QR).
- **Front-desk polish**: Larger keypad + one-tap success states.
- **QR scanner**: Hidden auto-focused input on the manager page so
  any HID-class USB scanner just works without any UI change.

## What CP-30 ships

### 1. CustomerSearch bar (`components/manager/customer-search.tsx`)

Single search bar at the top of the Front desk view.

- Live dropdown of the top 10 fuzzy matches by name, email, phone
  (digits-only match so "(555) 123-4567" finds "5551234567"), or
  referral code (exact-prefix match).
- 220ms debounce — fast enough to feel live, slow enough that the
  DB isn't getting hammered.
- Keyboard nav: ↑ / ↓ moves highlight, Enter picks, Esc closes.
- Click → opens AwardPointsPanel for that member directly.
- Per-row: avatar initial, name, ·· last 4 of phone, points balance.

Reads the new `search_members(business_id, q)` RPC.

### 2. DailyRecapCard (`components/manager/daily-recap-card.tsx`)

Hero card above the scan CTA on the Front desk view.

- 5 tiles: Check-ins, Points, Redemptions, New members, Live offers.
- Week footer: 7-day check-ins + 7-day points awarded.
- Realtime: re-pulls whenever `points_ledger`, `redemptions`, or
  `offers` get new rows for this business.
- Silently hides if the CP-30 SQL hasn't been applied yet, so the
  page still works pre-migration.

Reads the new `manager_daily_recap(business_id)` RPC.

### 3. ScannerListener (`components/manager/scanner-listener.tsx`)

Invisible always-focused input that catches USB QR-scanner
keystrokes and runs the existing `resolveCode()` flow.

Design rules:
- Never steals focus from a real input. As soon as the user clicks
  out of the search bar / keypad, the listener re-claims focus
  silently every 600ms.
- Flush triggers on Enter (the scanner's "done" suffix) or after
  80ms of keystroke silence — supports both common scanner modes.
- Also handles synthetic `paste` events from composite-mode
  scanners.
- Hidden via `position: fixed; opacity: 0; top: -9999px` so it
  doesn't take any layout space.

Pluggable scanners that work without driver install:
- **Tera 5100** (~$30, USB + Bluetooth combo)
- **Symbol / Zebra DS2208** (~$50, retail-grade)
- **Eyoyo EY-009C** (~$25, USB-C)

Enabled only on the Front desk tab so it doesn't intercept typing
on Insights / Billing / Membership.

### 4. Front-desk polish

- **Bigger keypad input**: `text-2xl tracking-[0.4em] h-14`
  (vs. `text-lg tracking-[0.3em]` before). Easier to type into
  on a tablet without misfiring.
- **Auto-focus** when the keypad opens.
- **Clearer error states**: dedicated rose-bordered card instead
  of inline red text.
- **Hero status indicator**: "USB scanner ready" pill with a soft
  green pulsing dot — confidence cue for the staff that the
  listener is alive.

### 5. 30-second Undo on every point grant

New `SuccessScreen` inside `award-points-panel.tsx`:

- Full-screen brand-color flash (small scale-down animation).
- Big `+N` + member name + "Their app just lit up with confetti."
- **Undo button** below Done, counts down "Undo (30s) → 29s → 0s →
  Undo window closed". One tap calls the new
  `reverse_last_award(business_id, membership_id, within_seconds)`
  RPC, which atomically inserts a compensating `reversal` ledger
  entry that negates the most recent positive grant.
- After successful undo: the big `+N` strikes through, label
  changes to "Reversed", and the screen dismisses to the
  dashboard so the staff can re-grant the right amount.

The 60-second server-side window is intentionally a bit longer
than the 30-second UI counter — gives a touch of slack for laggy
network/clock skew.

## SQL (`cp30_migration.sql`)

Self-contained, idempotent. Adds three RPCs:

1. `search_members(p_business_id uuid, p_q text)` — top 10 fuzzy
   matches by name/email/phone-digits/referral-code. Sorted:
   exact code match → name prefix → most-recently-active.
2. `manager_daily_recap(p_business_id uuid)` — single row with
   today's + last-7-days totals.
3. `reverse_last_award(p_business_id uuid, p_membership_id uuid,
   p_within_seconds int)` — finds the most recent positive
   non-reversal ledger entry for that member in the window and
   inserts a compensating entry. Returns the new ledger id +
   negated delta. Best-effort balance sync on
   `business_memberships` (idempotent — no harm if a trigger
   already does it).

All three call `public.staffs_business()` for explicit fail-fast,
plus `GRANT EXECUTE … TO authenticated` so PostgREST exposes them.

`NOTIFY pgrst, 'reload schema'` at the end.

## Files touched

```
checkpoint-30-manager-ops-and-scanner/cp30_migration.sql           (new)
checkpoint-30-manager-ops-and-scanner/README.md                    (new)
components/manager/scanner-listener.tsx                            (new)
components/manager/customer-search.tsx                             (new)
components/manager/daily-recap-card.tsx                            (new)
components/manager/manager-dashboard.tsx                           (wire new pieces)
components/manager/award-points-panel.tsx                          (SuccessScreen + undo)
```

## SQL to run

Apply `cp30_migration.sql` in the Supabase SQL editor. Safe to re-run.

Verify:

```sql
SELECT proname, pronargs FROM pg_proc
WHERE proname IN ('search_members','manager_daily_recap','reverse_last_award');

-- Smoke test
SELECT * FROM public.search_members('<business_id>', 'a');
SELECT * FROM public.manager_daily_recap('<business_id>');
```

## USB scanner buying guide

Any HID-class scanner works (no driver). Atlas was tested against:

| Model              | Price | Connection      | Notes                                  |
|--------------------|-------|------------------|----------------------------------------|
| Eyoyo EY-009C      | ~$25  | USB-C            | Pocket-size. Decent for tablet setups. |
| Tera 5100          | ~$30  | USB + Bluetooth  | Best value. Comes with a stand.        |
| Symbol/Zebra DS2208| ~$50  | USB              | Retail-grade. Bulletproof for daily use. |

All three default to emitting Enter as the "done" suffix, which
matches the ScannerListener's flush trigger. No config required.

## What's next

CP-31 — Backend launch hardening: consolidated SQL covering
CP-03 → CP-30 into one fresh-project-safe migration; full RLS
audit; try/catch + toast + loading + empty states across every
RPC call; UNIQUE/FK/trigger guards against duplicates and orphans.

Admin tab agency-wide controls still deferred to after CP-31
unless re-prioritized.
