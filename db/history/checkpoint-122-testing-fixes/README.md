# CP-122 — Testing-round fixes: View-rewards glitch, notification noise, stranded add-shop screen, missing review nudge

## Apply order

1. **Supabase → SQL Editor: run `cp122_fixes.sql`** (any time; independent).
2. **Deploy the app** (git push).
3. **One manual check (likely the whole review mystery):** Agency builder →
   your business → Business section → **Google review URL**. Since CP-103,
   the customer app hides BOTH the review request on Rewards AND the "!"
   nudge unless this link is set — the reviews toggle alone isn't enough.
   If that field is empty for Exotic, paste the Google review link and
   everything reappears (no deploy needed for that part).

## The four fixes

**1. "View rewards" lag/glitch.** Home's "See all" and "View more rewards"
were raw `<a>` tags with hard-coded path-form URLs — a full page reload
(the lag) that also pointed at the WRONG path on the subdomain/PWA form
(the "doesn't know where to go"). New `AppLink` client component resolves
the correct base per environment and navigates client-side, instantly.
Same CP-45/CP-106 bug family; these two survived the CP-106 sweep because
they live in a server component.

**2. Notification noise → exactly ONE push per award, visible rewards
only.** Three producers were stacking up: the CP-42 DB trigger fired a
push-bound row per crossed reward INCLUDING hidden ones (prize-wheel /
streak-gift rewards, `show_in_store=false` — it predates that flag), the
desk's aggregated award-event push (which already filtered correctly), and
the cron re-pushing both of their unstamped rows. Now: the trigger skips
hidden rewards and writes BELL-ONLY rows (stamped at insert), and the
award-event route stamps its aggregate row. Net: the phone buzzes once
per award with the aggregated message; the bell keeps per-reward history;
hidden rewards never notify anywhere.

**3. "Add another shop" dead end.** That screen (`/join?stay=1`) landed
with no state, so the CP-116 "Back to my shops" button never rendered —
customers had to scan a new business or kill the app. The screen now
loads their memberships on arrival: one shop → a "Back to my shop" button
that jumps straight back in; several → "Back to my shops" opens the
chooser.

**4. Review nudge / review section "came off".** Root cause is the CP-103
gate (deliberate): no Google review URL on the business → no review UI at
all, even with the widget toggled on — and it failed silently. The builder
now shows a loud amber warning under the Google review URL field whenever
reviews are enabled but the link is empty, so this can't be a mystery
again. See the manual check above to restore Exotic.

## Files changed

- `components/customer/app-link.tsx` — NEW base-aware server-side link
- `app/[business]/app/page.tsx` — See all + View more rewards → AppLink
- `app/api/notifications/award-event/route.ts` — stamp aggregate row
- `app/join/page.tsx` — memberships fetch on ?stay=1 + smart back button
- `components/brand-editor/brand-editor.tsx` — missing-link warning
- `checkpoint-122-testing-fixes/cp122_fixes.sql` — trigger rewrite

## Verified

- SQL on scratch Postgres: balance 90→200 with three rewards (100 visible,
  150 visible, 150 hidden) → exactly two bell rows, both stamped, hidden
  reward skipped. Re-runnable.
- App: full cloud-mirror `tsc --noEmit` — **0 errors**.
