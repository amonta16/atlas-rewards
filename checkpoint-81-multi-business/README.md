# CP-81 — Multi-business membership ("My shops")

One account, many shops. A customer who joins business A can join business B
with the same email + password, switch between them from the Profile tab, and
keep earning at all of them independently.

## What shipped

1. **Shared sign-in across every business subdomain** — auth cookies are now
   scoped to `.atlas-engine.app` (`lib/supabase/cookie-domain.ts`, wired into
   all three Supabase clients). One login works on the apex and every business
   subdomain. Joining shop #2 while signed in is therefore zero-friction: land
   on the subdomain → `/app` layout auto-enrolls (existing CP-25 machinery).
   Dev/preview hosts keep default host-only cookies.
2. **`my_memberships()` RPC** (`cp81_migration.sql`) — every business the
   caller belongs to, with branding + balance + tier. Run once in Supabase.
3. **Profile → "My shops"** (`components/customer/my-shops.tsx`) — lists all
   the customer's shops (current one badged), tap to switch instantly, plus
   "Add another shop" → the neutral `/join?stay=1` front door (native QR
   scanner lives there).
4. **Check-in now pays the per-visit reward** (`award-points-panel.tsx`) —
   the staff "Check in" button awards `point_rules.visit` alongside any
   streak milestone points. Previously per-visit points ONLY paid via the
   separate "Visit / Check-in" quick tile, which read as "check-in gives no
   points." The streak's already-checked-in guard prevents double awards.

## Deploy steps

1. Run `cp81_migration.sql` in the Supabase SQL editor.
2. Deploy the web app (push → Vercel).
3. Note: the cookie-scope change means currently-signed-in users get a fresh
   parent-domain cookie on their next sign-in; some may be asked to log in
   once more. One-time cost.

## Verify

- [ ] Sign in at business A (web) → visit business B's subdomain → already
      signed in, auto-enrolled, B's app loads.
- [ ] Profile tab shows "My shops" with both businesses + correct balances.
- [ ] Tap the other shop → lands in its app, no login. Native app: closing and
      reopening boots into the last shop you switched to.
- [ ] "Add another shop" → /join front door (native: camera scan works) →
      enter a third business code → enrolled without re-entering a password.
- [ ] Front desk: "Check in" on a member now awards the per-visit points
      (+ milestone points when a streak milestone is hit).
