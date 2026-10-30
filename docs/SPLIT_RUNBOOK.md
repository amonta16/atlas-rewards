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

## Phase 2a: med spa app (`apps/medspa`)

What's built: a separate Next.js app sharing the same Supabase database through `packages/core`.

- `/find`: Find your location (search by name, Scan QR Code, "I have a referral code" = the clinic's join code).
- `/<clinic>/login`: phone number, then texted 6-digit code, then name (first time only). New patients are enrolled with `enroll_member`, same as the venue app.
- `/<clinic>`: Home (hero, points + membership status, membership promo, rewards, popular treatments, book, results, location).
- `/<clinic>/shop`: Browse / Memberships / Treatments, plus membership, treatment and product detail screens.
- `/<clinic>/rewards`, `/<clinic>/profile`.
- Guests can browse everything; Subscribe / Book / Redeem show the sign-in prompt first.
- `/demo` is a built-in example clinic (Glow Aesthetics) that needs no database: use it for sales demos. Any 6 digits sign in there.

Not yet (Phase 2b): in-app checkout (Stripe) for memberships/shop, in-app booking calendar, redeem without staff, push notifications, scratch gift. Until then Subscribe / Book / Buy open a sheet to book online, text or call the clinic, and rewards are redeemed at the desk by phone lookup.

Membership plans: the app reads `businesses.medspa_config.memberships` (a list of plans, see `apps/medspa/lib/plans.ts`). A clinic without plans shows its existing single membership as one plan. **Don't edit a med spa in the venue builder after adding plans by hand**: the old builder doesn't know about `memberships` yet (fixed in Phase 5).

### Going live

1. **Vercel → Add New → Project →** import `atlas-rewards` again, name it `atlas-medspa`.
   - Root Directory: `apps/medspa` (framework: Next.js; leave install/build commands default).
   - Environment variables (copy the values from the atlas-rewards project):
     `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_ROOT_DOMAIN` (= `atlas-engine.app`), and `SESSION_HANDOFF_SECRET` if the venue project has one.
2. **Domain:** in atlas-medspa → Settings → Domains add `med.atlas-engine.app`. (A domain attached to a project beats the venue app's wildcard, so business subdomains are unaffected.)
3. **Text sign-in (Twilio Verify, ~15 min):**
   1. Create a Twilio account → upgrade from trial (trial can only text verified numbers).
   2. Twilio Console → Verify → Services → Create, name it after the clinic app (the name appears in the text). Copy the **Verify Service SID** (starts `VA…`).
   3. Copy the **Account SID** and **Auth Token** from the Twilio Console home.
   4. Supabase → Authentication → Sign In / Providers → **Phone** → enable → SMS provider **Twilio Verify** → paste the three values → Save.
   5. Supabase → Authentication → Rate Limits: leave the defaults (one text per number per minute).
   Why Verify instead of a normal Twilio number: US texting from a regular number needs A2P 10DLC brand registration (weeks); Verify is exempt for login codes.
4. Open `https://med.atlas-engine.app/demo` and click around. Then search for Lotus at `/find`, sign in with your own phone, check your name, points and the desk lookup.

The venue app is not affected by any of this: `apps/venues` has zero changes and still installs from its own lockfile. Check that its next production build stays green after this merge.

## Phase 2b: membership checkout (Stripe Connect)

What's built:

- **Subscribe now!** on a plan opens Stripe Checkout on the **clinic's own** Stripe account (CP-149 Connect). The patient pays the clinic; Atlas never holds the money or the clinic's keys. Optional Atlas fee: `STRIPE_PLATFORM_FEE_PERCENT`.
- The plan and price are re-read on the server (`/api/<clinic>/checkout`); the browser only sends the plan id. The signed-in patient comes from the session, not the request.
- After paying, the patient lands on Profile with "Welcome to the membership!", and Profile shows the plan name (e.g. "Glow Club").
- Members get **Manage membership** in Profile → Stripe's billing portal (card, receipts, cancel).
- A clinic that hasn't connected Stripe still shows the book / text / call sheet, same as before.
- `/demo` fakes a successful checkout (no card, no keys needed) so sales demos show the whole flow.
- The demo now runs with **no Supabase keys at all** (middleware skips `/demo` and missing keys).

No new SQL. The payment is recorded by the existing Connect webhook in the venue app (`/api/stripe/connect/webhook`, CP-149), which calls `apply_membership_event` and stores the plan name in `business_memberships.membership_plan_label`. Code shared with the venue app is in `packages/core/src/payments/` (copied from `apps/venues/lib/payments/`, plus `planLabel` and `extraMetadata`).

### Environment (apps/medspa)

`STRIPE_SECRET_KEY` = the **Atlas platform** key (same one the venue project uses), plus the Supabase variables. Locally use `sk_test_…`; on Vercel production, the live key. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` isn't used yet (Checkout is hosted by Stripe), harmless to keep.

### Testing a real card (test mode)

1. The clinic must be connected to Stripe **in test mode**: a live-mode connection doesn't work with a `sk_test_` key. Easiest: run the venue app locally with the same test key, sign in as the clinic's manager, Billing → Connect Stripe, and finish Stripe's test onboarding (Stripe offers "use test data").
2. The webhook: in Stripe (test mode) → Developers → Webhooks → add `https://www.atlas-engine.app/api/stripe/connect/webhook`, "Listen to events on Connected accounts", same events as CP-149. Or locally with the Stripe CLI: `stripe listen --forward-connect-to localhost:3000/api/stripe/connect/webhook` with the venue app running.
3. In the med spa app: sign in, open a plan, Subscribe now!, pay with card `4242 4242 4242 4242`, any future date, any CVC.
4. Check: Profile shows the plan; the clinic's Stripe dashboard (test) shows the subscription; the manager portal shows the member as paid.

Not in 2b yet: shop/gift-card checkout in the med spa app, booking calendar, staff-free redeem, push, scratch gift. A plan's "minimum commitment" is shown to patients but not enforced by Stripe.

## Next phases

2. ~~`apps/medspa` + `packages/core`, phone sign-in, Dermis-style patient app~~ (2a done); 2b: membership checkout done; next: shop checkout, booking, redeem, push
3. Move Lotus and the med spa demos to the med spa app; redirects for old links
4. Delete med spa code from `apps/venues`
5. Admin: Venues | Med Spas switch; separate med spa builder and desk
6. `native/medspa-shell` (`com.atlasengine.medspa`), per-clinic icons, App Store
