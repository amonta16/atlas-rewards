# CP-74 — Join Backbone (mobile launch step 1)

The foundation of the store-app join flow: every business gets a short **join code**, one **smart landing URL** per business that a single printed QR encodes forever, and the neutral **pre-join screen** the native app will boot into.

## What shipped

**SQL — `cp74_migration.sql` (run in Supabase SQL editor):**
- `businesses.join_code` — unique, human-typeable, uppercase (e.g. `FLIPPOS`). Backfilled from slug for all existing businesses; auto-assigned by trigger for every new business.
- `join_business_by_code(p_code)` RPC — anon-callable, returns branding fields only (no PII/config). Powers the pre-join screen.

**App routes (apex domain only):**
- `/join` — neutral Atlas "front door": enter a code → branded confirmation card → continue into the business's signup (via existing `/qr/<slug>` subdomain redirect). This is the screen the Capacitor shell will open on first launch.
- `/j/<code>` — smart landing, the ONE URL every printed business QR encodes:
  - Today (no store apps): branded page → "Join <business>" → browser PWA flow.
  - After store launch (set `NEXT_PUBLIC_APP_STORE_URL` + `NEXT_PUBLIC_PLAY_STORE_URL` in Vercel): platform-aware install badges + the join code shown big ("After installing, join with code FLIPPOS"). Play link carries `?referrer=<code>` so Android auto-joins after install (Install Referrer API — read in the Capacitor checkpoint). iOS users type the code (or Branch.io later).
  - Unknown/stale code → friendly not-found → `/join`.
- Agency **Your app QR** card now encodes `/j/<join_code>` (falls back to `/qr/<slug>` until the migration runs) and displays the join code for counter signs. **Printed QRs never need reprinting when the store apps launch.**

## New env (later, not needed now)
- `NEXT_PUBLIC_APP_STORE_URL` — App Store listing URL (once live)
- `NEXT_PUBLIC_PLAY_STORE_URL` — Play listing URL (once live)

## Why one QR per business (not one per store)
The landing page detects the visitor's platform and shows the right badge. Businesses print ONE QR; it works pre-launch (browser), post-launch (stores), and in-app (scanner) — no reprints, ever.

## Apply
1. Run `cp74_migration.sql` in the Supabase SQL editor.
2. Deploy. Verify: `/join` finds a business by its code; `/j/<CODE>` shows the branded landing; agency QR card shows the join code.
