# CP-84 — Refresh-token storm fix (the July 25 lockout)

**One file changed:** `lib/supabase/middleware.ts`. No SQL, no env vars, no dashboard steps.
**Verified:** `tsc --noEmit` = 0 errors, full `next build` green (build gate is ON).

---

## What was happening

Supabase was taking **54,000 auth requests per hour** with only **94 Postgres requests** —
i.e. almost no one was actually using the app. Vercel runtime logs were wall-to-wall:

```
AuthApiError: Invalid Refresh Token: Already Used
code: 'refresh_token_already_used'
source: middleware
```

and Supabase auth logs were wall-to-wall `429: Request rate limit reached` on `POST /token`,
plus GoTrue's `Possible abuse attempt: 1218`. Real admins could not sign in — the storm ate
the per-IP sign-in budget faster than any rate-limit ceiling could be raised.

Not an attack. Two of our own bugs compounding.

### Cause 1 — the pre-CP-81 cookie is still in people's browsers (the big one)

Before CP-81 the Supabase auth cookie was **host-only** (`www.atlas-engine.app`). CP-81
re-scoped it to the **parent domain** (`.atlas-engine.app`) so one login covers every
business subdomain.

Browsers do not replace one with the other — the two have different `Domain` attributes,
so they are **two separate cookies with the same name**. Anyone who signed in before CP-81
now sends both on every request. And here's the trap:

1. We read the cookies and pick up the **stale host-only** copy.
2. We refresh with its long-dead token → GoTrue says `refresh_token_already_used`.
3. The rotated replacement gets written to the **parent-domain** cookie.
4. The stale host-only copy is never updated and never expires.
5. Next request: back to step 1. Forever.

Every lap is another `POST /token`. This is why clearing site data "fixed" it per-person,
and why it started out of nowhere — CP-81 shipped July 22.

### Cause 2 — prefetch races

The landing page has `<Link href="/login">` and `<Link href="/agency">`, so Next prefetches
both. Three requests land in the **same millisecond** — you can see it in the Vercel log,
`/`, `/login` and `/agency` sharing a timestamp. Each ran this middleware, each tried to
spend the **same** rotating refresh token. One wins, two get `already_used`, and a signed-in
user gets bounced to `/login` for no reason.

---

## The fix

**1. Expire the legacy host-only cookie.** When a refresh fails as already-used or
not-found, emit a `Set-Cookie` with **no Domain attribute** and `Max-Age=0`. That matches
only the host-only copy; the parent-domain cookie is a different cookie to the browser and
survives. **Nobody gets signed out** — the stale shadow just stops being sent.

Two details that matter:

- It uses `headers.append("set-cookie", …)` rather than `response.cookies.set(…)`, because
  `ResponseCookies` de-dupes by name and would have clobbered the freshly-rotated
  parent-domain cookie that `setAll` just wrote.
- It's gated on `sharedCookieDomain()` returning a domain, so on localhost and Vercel
  preview URLs — where the host-only cookie *is* the real session — nothing is cleared and
  local dev keeps working.

**2. Prefetches no longer refresh.** `isPrefetchRequest()` checks `next-router-prefetch`,
`purpose: prefetch` and `sec-purpose`, and returns early. Speculative navigations nobody is
waiting on should never spend a single-use token. This removes two of every three
concurrent refreshes on the landing page.

**3. `getUser()` is wrapped.** It was a bare `await` — a thrown `AuthApiError` escaped
middleware and turned a recoverable session blip into a failed request. Now an auth hiccup
can never take down a page load.

---

## Apply

```bash
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
git add checkpoint-84-refresh-token-storm checkpoint-02-brand-engine/atlas-rewards-app/lib/supabase/middleware.ts
git commit -m "CP-84: fix refresh-token storm (legacy host-only cookie + prefetch races)"
git push
```

Vercel redeploys on push. Nothing else to run.

## Verify after deploy

1. Supabase → Home → the **Auth** request counter over the last 60 minutes. It should fall
   from ~25k to double digits. That's the whole test.
2. Vercel → Logs, filter `refresh_token_already_used` — should go quiet within a few minutes
   as browsers shed the stale cookie on their next request.
3. Sign in as an admin, click around `/agency`, leave it open 10 minutes. No surprise bounce
   back to `/login`.
4. Sign in on a business subdomain (`spa-by-the-bay.atlas-engine.app`), then open
   `app.atlas-engine.app` — CP-81's shared login should still work. This is the regression
   that matters; the fix is designed not to break it, but confirm it.

## If the counter does NOT drop

The legacy-cookie theory is wrong and something else is looping. Next place to look:
Supabase → Logs → Auth, filter to `POST /token`, and check whether the requests carry one
source IP (a stuck device) or many (something server-side). Ping me with that.

---

## Still open (not in this checkpoint)

- **60-second cooldown on the magic-link button** on all three login surfaces. Two taps
  still burns the project's hourly email budget.
- **Friendly rate-limit copy** — `app/(agency)/login/page.tsx` line 63 falls through to
  `setErr(error.message)`, which is how a raw Supabase string reached a human today.
- **`package-lock.json` is out of sync** with `package.json` — the Capacitor deps
  (`@capacitor/app`, `core`, `barcode-scanner`, `preferences`, `push-notifications`,
  `html5-qrcode`) are missing from the lockfile, so `npm ci` fails outright. Vercel is
  presumably falling back to `npm install`. Run `npm install` locally and commit the updated
  lockfile before this bites during a deploy.
