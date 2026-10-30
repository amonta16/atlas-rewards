# CP-218 · Customer app "stuck loading" (Flippo's, Oct 24 2026)

## Root cause (confirmed, reproduced on the production code)
`components/ui/pwa-boot-splash.tsx` (moved into the server HTML in CP-211, Oct 14 — the same
release as the pdx1/Oregon move). Any `router.refresh()` re-rendered the business layout and put
the splash (logo + shimmer, z-index 9999) back on screen after it had already played. Nothing lifted
it again. Its old CSS guard never worked (lost to the inline `display:flex`).

refresh() runs right after **Create account**, after **Sign in**, after **signing the waiver**, and in
many in-app actions → new customers stuck on the logo screen; existing customers stuck after an action.
Taps still went through, invisibly, to the app underneath. Closing the app cleared it until the next refresh.

Logs matched: the new customer's signup (6:42 pm) and enrollment succeeded server-side, the app
rendered, then nothing for 60 s → app restarted → waiver signed → home loaded → no further activity.

Not the cause: Oregon. Vercel functions (pdx1) and Supabase (us-west-2) are co-located; server renders
took ~150 ms; zero 5xx and no slow customer queries all day.

## Fixed
- Splash plays once per page lifetime; re-renders get an empty wrapper; `!important` guard.
- No loading surface can spin forever: StallNotice (slow → "Still loading…", stuck → Try again,
  offline → says so, auto-retry on reconnect) on every route loader, the join boot splash and the cached Home.
- Pre-hydration boot watchdog (inline script): JS never arrives / chunk 404 → card with Reload.
- error.tsx for the customer app + global-error: failed loads show Try again (auto-reload on ChunkLoadError).
- Offline guard: offline tab taps stay put with a banner instead of a browser error page.
- Service worker: navigation answers within 10 s on a dead connection (last screen or "Can't connect").
- Server Supabase reads (PostgREST only) time out at 15 s → error screen, not a hung render.
  A failed business/membership lookup now throws (retryable) instead of 404 / re-enrolling.
- Native bridge calls (Preferences, App info, install referrer) bounded at 4 s.
- Signup + login: no stuck buttons; network-aware messages; "Your account is ready → Open my rewards"
  if the hop into the app stalls.
- Manager: my_business_billing ambiguous-column error (SQL, already applied).

## Tests (local prod build + mock Supabase, iPhone 13 / Pixel 7 emulation)
Signup → home (both devices), 10 tab navigations, sign-in as existing customer, refresh/push+refresh,
stuck Supabase (server + client), offline tap, JS chunk never loads, enrollment request hangs then retry,
service worker on/off. Before: splash still up 20 s after Create account. After: home in ~1.2 s.
