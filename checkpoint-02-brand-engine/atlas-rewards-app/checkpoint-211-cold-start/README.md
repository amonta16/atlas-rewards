# CP-211 · Cold start: 1.67 s → 0.43 s (open → interactive)

## Results (cold open of the customer Home, median of 9, local benchmark)
A fake Supabase adds a fixed delay per call (70 ms ≈ Vercel iad1 ↔ Supabase us-west-2 today;
5 ms ≈ pdx1 ↔ us-west-2). Fresh browser profile each run. Flippo's data shape.

| | Before | After (iad1) | After + pdx1 |
|---|---|---|---|
| First-time open → interactive | 1,665 ms | 588 ms | **432 ms** |
| Returning customer → interactive | 1,665 ms | 538 ms | **378 ms** |
| Returning customer → their card on screen | — | 305 ms | **172 ms** |
| Med spa Home → interactive | 1,662 ms | 430 ms | — |
| Server round-trip waves before HTML | 6 | **3** | 3 |
| Supabase Auth calls per open | 2 | **1** | 1 |
| Duplicate browser requests | featured_offer ×2, streak ×2 | **0** | 0 |

## What changed
1. **Instrumentation** (no behaviour change)
   - `lib/perf/launch.ts` → `timed(label, promise)`: per-step server waterfall in the Vercel logs when `ATLAS_LAUNCH_TIMING=1`.
   - `components/perf/launch-timer.tsx` + `home-ready.tsx`: open → interactive (Home hydrated AND splash gone) on `window.__atlasLaunch`, the console, and a 20 % sample (always with `?perf=1`) beaconed to `/api/perf/launch` → search Vercel logs for `[launch-client]`.
2. **Concurrency** (`app/[business]/app/layout.tsx`, `page.tsx`): session ‖ business, then ONE batch: membership, waiver gate, billing, featured offer, promo facts, profile name, Home data (and med spa frame data). Kept dependency: a brand-new member is enrolled first and the waiver gate is **re-checked after enrolling** (`my_waiver_gate` says "ok" for non-members).
3. **Session caching** (`lib/supabase/session-handoff.ts`, middleware, `getCachedUser`): middleware already validates the session with Supabase Auth on every request; it now hands the verified user to the render in an internal header — HMAC-signed, bound to the request's auth cookie, 30 s lifetime, stripped from incoming requests. Anything that doesn't verify falls back to the old network check. Auth is still validated once per request (same security), just not twice.
4. **Splash** (`components/ui/pwa-boot-splash.tsx`): was mounted after hydration then held a fixed 1.25 s over an already-rendered app. Now it's in the server HTML from first paint and lifts the moment Home is hydrated (max 1.2 s wait); still once per session.
5. **Client duplicates** (`lib/shared-rpc.ts`): first-load requests for the same data share one in-flight request (featured offer, featured raffle, streak status). Realtime/polling refreshes always go fresh; errors are never cached. Header streak + check-in status now load together instead of one after another.
6. **Render from cache**
   - `components/customer/home-snapshot.tsx` + `lib/device-cache.ts`: Home saves a tiny snapshot (first name, points, brand) on the phone. On the next cold open the loading screen paints it straight from the first bytes of HTML (inline script, before any JavaScript), marked "Updating…", until fresh Home streams in.
   - `public/sw-offline.js` (imported by both `sw.js` and `sw-push.js`): app pages are network-first with the last good copy kept on the device; offline you get your last screen with a "Offline · showing your last screen" note instead of the browser error. Hashed `/_next/static` files are cache-first. Redirects/errors never stored.
   - Sign-out and account deletion clear both caches (`clearDeviceCache`).
7. **Region** (`vercel.json`): `"regions": ["pdx1"]` — server functions run in Portland next to the database (us-west-2) instead of Virginia. Flippo's traffic is all Supabase + Stripe Connect (no region-specific integrations), and its customers are in California, so it gets faster too.

## After you push — please check
- **Env (optional but recommended):** add `SESSION_HANDOFF_SECRET` (any long random string) in Vercel → Settings → Environment Variables. Without it the handoff signs with `SUPABASE_SERVICE_ROLE_KEY`, which works but is better kept single-purpose.
- **Region:** open the app and check the `x-vercel-id` response header — it should read `…::pdx1::…`.
- **Real numbers:** open `https://www.atlas-engine.app/<slug>/app?perf=1` on a phone (cold, first open of the session) and look in Vercel logs for `[launch-client]`. For the server waterfall, set `ATLAS_LAUNCH_TIMING=1` for an hour and search `[launch]`, then remove it.

## Tests
`npm test` → 12/12 (5 existing + 7 new in `tests/session-handoff.test.mjs`: forged, tampered, expired, cross-session, wrong-secret and no-secret handoffs all rejected). Also verified end-to-end: forged header with no session → login; real session + forged header → works; new member owing a waiver → enrolled, gate re-checked, waiver shown; offline reopen → last screen + note; sign-out → caches cleared.

## Next lever (not done)
After these fixes, most of the remaining time is the phone downloading and starting the JavaScript (~250–300 ms on a desktop CPU, more on phones). Trimming the Home bundle (code-split the wheel / confetti / QR scanner) is the next step.
