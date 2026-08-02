# CP-92 — Mobile polish: false offline wall, popup pile-up, notch overlap + raffle SQL finish

**Verified:** `tsc --noEmit` = 0 errors, full `next build` green.
**Files:** 4 web + 1 shell (`www/error.html`) + 1 SQL.

## 1. The "You're offline" false positive — root cause found

Your own Xcode log caught it: `NSURLErrorDomain error -999` right before "WebView failed
provisional navigation". **-999 is not a network error — it means a navigation was
*cancelled*** (two navigations racing, e.g. the /join boot redirect firing while another
load is in flight). Capacitor shows its `errorPath` page for that too, so the offline wall
appeared while your connection was perfectly fine. Closing/reopening "fixed" it because
nothing was ever broken.

**Fix:** `www/error.html` is now self-healing. It probes the live app immediately and
bounces back the moment it's reachable — the spurious case recovers in under a second,
usually before you can read the screen. Only after ~3 failed probes (~8s) does it admit
"You're offline", and even then it keeps probing in the background and auto-recovers (plus
listens for the OS `online` event). Airplane-mode reviewers still get a proper offline
state.

## 2. Popup pile-up after the bell animation

`popup-coordinator.ts` handed the screen to the next popup **in the same render pass** the
moment one released — so after the bell-nudge, the welcome-points confetti and the offer
reveal fired back-to-back with no time to mount their animations. There's now a **1.5-second
quiet gap** between any two popups: screen goes empty, beat passes, next popup gets its full
entrance. One central change; every popup benefits without touching them individually.

## 3. iPhone status bar eating the top banner

Three-part fix, all degrading to no-ops in regular browsers (where `env()` is 0):

- `app/[business]/layout.tsx` — viewport gains `viewportFit: "cover"`, which is what makes
  the safe-area inset visible to CSS at all.
- `app/[business]/app/layout.tsx` — the app container pads its top by
  `env(safe-area-inset-top)`, and because the padding is on the *painted* container, the
  business's background color/pattern extends up behind the clock — the notch area blends
  with the brand instead of clipping it.
- `featured-offer-banner.tsx` — both sticky banners (offer + raffle) now stick at
  `top: env(safe-area-inset-top)` instead of `top: 0`, so when you scroll they pin just
  below the status bar. This is per-device automatic: notch, Dynamic Island, older
  iPhones, Android cutouts — `env()` reports whatever the hardware needs.

## 4. Raffle sweep — the ALTER you ran was on the wrong layer

Your `alter function finalize_due_raffles()` succeeded but the error continued because
`gen_random_bytes()` is actually called inside **`finalize_raffle()`** and
**`redraw_raffle()`** — and each has its *own* `SET search_path = public` that overrides
the caller's. Run `cp92_raffle_searchpath.sql` — it's a catch-all that patches **every**
public function mentioning `gen_random_bytes`, and prints what it patched. The 5-minute
sweep warnings stop on the next tick.

## Ship it

**Supabase:** run `cp92_raffle_searchpath.sql` in the SQL Editor (both statements — the
second is the verification select).

**Windows:**
```bash
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
git add checkpoint-92-mobile-polish checkpoint-02-brand-engine/atlas-rewards-app mobile-shell/www
git commit -m "CP-92: self-healing offline page, 1.5s popup gap, safe-area notch handling; raffle search_path catch-all"
git push
```
The web fixes (popups, safe-area) deploy via Vercel and reach the phone app with **no
rebuild** — that's the remote-URL shell doing its job.

**Mac (only for error.html — it lives inside the app binary):**
```bash
cd ~/atlas-rewards && git pull && cd mobile-shell
npx cap sync ios && npx cap open ios     # then ▶ Run
```
Do the same `npx cap sync android` + rebuild whenever you next touch Android. Until the
rebuild, phones keep the old offline page — everything else in CP-92 works immediately.

## Verify

1. Raffle: no `[raffles/sweep] finalize failed` in Vercel logs after the next 5-min tick.
2. Notch: open the app on your iPhone (after Vercel deploys) — the brand color should now
   fill the area behind the clock, and the offer banner should sit fully below it. Scroll:
   banner pins below the status bar.
3. Popups: fresh test signup → bell spotlight → tap → OS dialog → beat of quiet → welcome
   confetti → beat → offer reveal. Each animation gets its entrance.
4. Offline page: after the Mac rebuild, toggle airplane mode inside the app → "Loading…"
   spinner → offline card ~8s later → turn airplane mode off → app returns by itself.
