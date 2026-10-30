# CP-37.1 — Hotfix

Three follow-up bugs Andrew hit after CP-37:

## 1. "function gen_random_bytes(integer) does not exist"

**What happened.** Tapping "Claim this gift" on the 10% OFF Tuesday card stacked five red error toasts: `Couldn't claim — function gen_random_bytes(integer) does not exist`.

**Root cause.** Supabase installs the `pgcrypto` extension in the `extensions` schema by default. `save_offer` runs with `SET search_path = public`, which excludes that schema — so `gen_random_bytes(...)` resolves to nothing. Same bug was lurking in CP-36's original `save_offer`; we never hit it before because no one had successfully reached the code-minting branch.

**Fix in `cp37_1_hotfix.sql`.**

- `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public` — installs the extension's functions into `public` so the `SET search_path = public` functions can see them.
- `save_offer` re-created with a `BEGIN ... EXCEPTION WHEN OTHERS` block around the code-minting call that falls through to `md5(random())` if pgcrypto still isn't available. Belt and suspenders.

## 2. Streak milestones still show a Gift icon, not the reward photo

**What happened.** Andrew expected the actual reward image (e.g. the "Buy one get one free" promo photo) to render on the milestone cell. CP-37 only showed the reward NAME as text.

**Fix.**

- SQL — `get_streak_status` is now joined to `public.rewards` so each milestone in the returned JSONB carries `reward_image_url` + `reward_name`.
- Code — `StreakWidget` renders the reward image edge-to-edge in the cell when present (with a soft scrim so the period number stays legible). Falls back to the icon + label when the milestone is points-only or the reward has no image. Same enrichment used in the "Rewards along the way" legend rows.

## 3. New users can't sign in after creating their account

**Root cause** — the big one. In `app/[business]/signup/page.tsx`, after `supabase.auth.signUp(...)`, the code did `getUser()` and proceeded to call `enroll_member`. **But if Supabase Auth has "Confirm email" enabled (the default), signUp returns a user with NO session.** `getUser()` then returns null, `enroll_member` is never called, and the customer is left with:

- A half-built `auth.users` row that's not email-confirmed
- No `business_memberships` row → no points, no QR
- No password they can recover via the "Forgot password" link (because there isn't one)

They go to `/login`, type their password, get `Invalid login credentials` because the email isn't confirmed yet.

**Fix.**

1. **Signup detects the no-session state** and redirects to `/login?email=...&confirm=1` instead of trying to enroll. The customer now sees a clear "Check your inbox" banner instead of being silently dropped into a broken state.
2. **Login error mapping** rewrites Supabase's generic auth errors into actionable messages ("If you signed up via invite, tap Send me a sign-in link below").
3. **New "Send me a sign-in link" button** on `/login`. Calls `auth.signInWithOtp({ email })` — Supabase emails a one-time sign-in link that works regardless of password OR email-confirmation state. This is the universal rescue for anyone stuck.

### Recommended Supabase setting

For the smoothest customer experience, consider **disabling email confirmation** in Supabase:

> Supabase Dashboard → Authentication → Providers → Email → uncheck **"Confirm email"** → Save.

With confirmation off, signup is instant: the customer gets a session immediately, `enroll_member` runs, they land on `/app` with their welcome bonus credited. The new magic-link button stays as a forgot-password rescue.

If you keep confirmation on (some agencies prefer it for spam control), the magic-link button still bails out anyone who can't complete the loop.

## How to apply

1. **Push code to GitHub** (see your previous question — `git add . && git commit -m "CP-37.1 hotfix" && git push`). Vercel auto-deploys.
2. **Run `cp37_1_hotfix.sql`** in Supabase → SQL editor. Idempotent.
3. **(Optional but recommended)** Disable email confirmation in Supabase Auth settings.

## Files

| File | Purpose |
| --- | --- |
| `cp37_1_hotfix.sql` | pgcrypto + save_offer rebuild + get_streak_status reward-image join. |
| `app/[business]/signup/page.tsx` | Detects no-session state, redirects to `/login?confirm=1`. |
| `app/[business]/login/page.tsx` | Confirm-email banner + magic-link button + smarter error mapping. |
| `components/customer/streak-widget.tsx` | Renders `reward_image_url` on milestone cells + legend rows. |
