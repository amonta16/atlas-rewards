# CP-45 — Bug-fix checkpoint: invites, welcome gift, preview sync + 404s

Andrew's bugs-first checkpoint. Four fixes, one SQL file. CP-46 (next) carries the
feature work: membership-expiry tracking for managers, manager metric parity with
the agency Impact dashboard, the 3-D Dermis-style points card, and scale hardening.

---

## 1. Invite error — `column reference "user_id" is ambiguous` (FIXED, SQL)

The invite modal (admin / manager / front desk) calls `/api/team/create-account`
→ `admin_provision_account` RPC. That function declares
`RETURNS TABLE (user_id uuid, ...)` — PL/pgSQL treats the return column as a
**variable** named `user_id`, so every unqualified `WHERE user_id = ...` against
`business_users` collided with it at runtime. Same class of bug as the CP-40
`token` ambiguity.

**Fix:** re-declared in `cp45_migration.sql` with every query table-aliased
(`bu.user_id`, `u.id`, …). Same signature, same return shape — no route changes.

## 2. Welcome gift + voice note never popped (FIXED, SQL + client)

Root cause: the reveal popup keyed off `featured_offer()` (business-wide) plus a
**per-device** localStorage seen-list. The welcome "master" offer row is created
once per business — so:
- second test account on the same device → offer id already "seen" → no popup;
- any other featured offer existing → `featured_offer()` returns that instead;
- the realtime INSERT only fires for the FIRST signup ever (master row reused).

**Fix — per-member, server-tracked reveal:**
- `customer_saved_offers.revealed_at` column (existing old gifts backfilled so
  long-time members don't get a replay).
- `my_unrevealed_welcome_gift(business_id)` RPC — the caller's own unrevealed
  welcome gift, with voice note URL, discount, reward name, expiry.
- `mark_welcome_gift_revealed(saved_id)` RPC — caller-owned only.
- `OfferRevealWatcher` now checks the welcome gift FIRST (still waits for the
  bell-onboarding moment), shows the unwrap popup with the voice-note pill, and
  marks it revealed on dismiss. Featured-offer behavior unchanged as fallback.

Fires once per **member** on any device. Note: the popup only mounts when the
business's *Offers & promos* widget is enabled (existing behavior).

## 3. App-builder preview not synced + 404s on tab clicks (FIXED, client)

Two separate things:

**a) Preview drift.** The phone preview was a hand-maintained mockup that fell
behind the real customer app. New **Live app / Mockup toggle** above the phone
frame (defaults to Live): Live mode frames the *actual* customer app at
`/<slug>/app` — every tab, widget toggle, streak, spin, and saved setting renders
exactly as customers see it, and it reloads when you hit Save. Mockup mode stays
for instant unsaved color/toggle edits. (CP-44's `X-Frame-Options: SAMEORIGIN`
allows this — same origin.) Heads-up: viewing Live mode auto-enrolls your admin
account as a member of that business (same as the "Customer app" button always did).

**b) The 404s — real bug, now fixed everywhere.** The customer app's bottom nav
(and several redirects) used hard-coded slug-less paths like `/app/rewards`.
On the installed PWA (subdomain) middleware injects the slug, so your phone
worked. On **path-based access** — the agency preview, the "Customer app"
button, any direct `/slug/app` link — those links lost the slug → 404.
Fixed slug-aware in:
- `components/customer/app-shell.tsx` (bottom nav basePath)
- `components/customer/celebrate-watcher.tsx` (confetti → rewards)
- `components/customer/sign-out-button.tsx`, `components/customer/delete-account-section.tsx`
- `components/notifications/notification-center.tsx` (stored link_paths re-prefixed)
- `components/manager/manager-dashboard.tsx` (sign out)
- `app/[business]/page.tsx`, `app/[business]/app/layout.tsx`,
  `app/[business]/app/page.tsx`, `app/[business]/login/page.tsx`,
  `app/[business]/signup/page.tsx`, `app/[business]/manage/layout.tsx`

## 4. Portal initial-data audit (no code change needed)

Front-desk/manager widgets (DailyRecapCard, PendingMembershipsQueue, recent
activity, customer search) all fail soft and render zero-states on a fresh
business — the "broken initial data" symptoms you've been seeing are almost
always an **unapplied SQL migration** on the live project. Use the checklist
below; each file is idempotent (safe to re-run).

---

## APPLY THIS SQL (Supabase SQL editor, in this order)

1. `checkpoint-43-cross-app-consistency/cp43_migration.sql` — if not yet applied
   (fixes "Guest" rows in recent activity, manager_remove_points, per-business bell)
2. `checkpoint-44-prelaunch-hardening/cp44_security.sql` — if not yet applied
3. `checkpoint-44-prelaunch-hardening/cp44_daily_spin.sql` — re-apply (CP-44.1 note)
4. `checkpoint-37-spin-welcome-and-notif-wiring/cp37_migration.sql` — re-apply if the
   welcome-gift trigger has never fired (defines welcome trigger v3; idempotent)
5. **`checkpoint-45-invite-welcome-preview/cp45_migration.sql`** ← new

## 5-minute test script

1. **Invites:** Agency → Team → Invite. Generate a sign-in link for each role.
   The "user_id is ambiguous" toast should be gone; link opens signed-in.
2. **Welcome gift:** Agency → Offers → Automated → make sure the Welcome/signup
   offer is Active (give it a voice note + image). Create a brand-new customer
   account (any device, even one you've tested on before). After the bell
   moment: gift popup → tap to unwrap → voice-note pill plays. Sign out/in:
   no replay.
3. **Preview:** Open a business in the app builder. Preview should say
   "Live app" and show the real customer app; tap every bottom tab — no 404s.
   Change a color → Save → preview reloads with it.
4. **Path-based tabs:** From the builder, click "Customer app" (new tab) and
   click through Home / Check in / Rewards / Profile — no 404s.

## Deferred to CP-46 (agreed)

- VIP membership expiry tracking — **flag-only**: managers get an
  expired/overdue list (cash + external + Stripe), monthly due dates; nothing
  auto-revokes. Stripe-mode renewals will sync via Stripe webhooks
  (`invoice.paid` → extend, `subscription.deleted`/`payment_failed` → flag).
- Manager Insights parity: Atlas Impact hero, with/without comparison,
  at-risk-if-you-cancel, daily revenue/transaction graphs.
- 3-D points card (Dermis-style beveled edges + sheen).
- Large-volume hardening pass (indexes, realtime channel audit, pagination).
