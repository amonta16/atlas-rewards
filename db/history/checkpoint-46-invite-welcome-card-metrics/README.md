# CP-46 — invite fix · welcome-gift reveal · 3D card · popup peace · manager metrics

Bug-fix + polish checkpoint. Apply `cp46_migration.sql` in the Supabase SQL
editor (whole file at once), then deploy.

## 1. Team invite — "magic link generation failed: Database error finding user"
**Cause:** the invite created the `auth.users` row via a raw SQL INSERT
(`admin_provision_account`). GoTrue's `generateLink()` can't load a row made
that way (no `auth.identities`, NULL token columns) → "Database error finding
user."
**Fix:** `app/api/team/create-account/route.ts` now creates the auth user
through the Admin SDK (`admin.auth.admin.createUser`) — a fully GoTrue-valid
row — and the SQL side only gates permission + wires the role:
- `team_invite_precheck(email, role, business_id)` — permission gate (raises
  on denial, so no orphan user) + returns any existing uid.
- `attach_team_role(user_id, role, business_id, full_name)` — profile +
  `business_users` write, gate re-checked.
Existing legacy users are re-touched via `updateUserById` so their row is
normalised before `generateLink`.

## 2. Welcome gift / automated gift not showing for new accounts
Two stacked bugs in the points-bonus ("Award Points") welcome:
- CP-44 added an auth gate to `award_points()` that rejects positive awards
  from a non-staff caller — during signup the caller IS the new customer, so
  the credit always failed. **The trigger now credits inline** (trusted
  SECURITY DEFINER context), bypassing the gate.
- A points-bonus welcome created **no** saved-offer row, so
  `my_unrevealed_welcome_gift` returned nothing and the reveal never fired.
  **v4 trigger now drops a saved row (fulfilled) for points-bonus too**, and
  `my_unrevealed_welcome_gift` no longer gates on `fulfilled_at` — so the
  "+N pts" reveal pops once per member.

Note: we do **not** re-add the `points_ledger` rule_type CHECK — CP-44.1
dropped it on purpose (newer features write `mystery_bonus`,
`streak_milestone`, etc.). Re-adding it re-validates history → error 23514.
`signup_bonus` inserts cleanly against the constraint-free column. Requires
`cp44_ledger_fix.sql` to have been applied.

## 3. Customer loyalty card — physical 3D edge
`tilt-loyalty-card.tsx`: layered shadows (top bevel highlight, bottom inner
shade for thickness, crisp edge line, brand glow + grounded drop shadow) so
the card reads as a raised object like the reference.

## 4. Featured-offer font
Home featured-offer headline is now bigger / blacker / tighter tracking so a
short promo reads like a billboard line.

## 5. Signup — required + validated, birthday month/day only
All fields required and validated (email format, phone ≥10 digits, password
≥6). Birthday is now **month + day only** (two selects, no year) — stored as
`2000-MM-DD` so the Birthday automated offer (matches month/day) still works.

## 6. Peaceful popups — notifications first
New `lib/popup-coordinator.ts` singleton: one overlay on screen at a time,
ordered **notifications → confetti → welcome gift → featured offer**. The bell
nudge, `CelebrateWatcher`, and `OfferRevealWatcher` claim/release slots; lower
priority overlays hold and appear the moment the screen frees up. The welcome
`signup_bonus` credit no longer double-fires confetti (the gift reveal owns it).

## 7. Manager front-desk metrics
New `manager_daily_series(business, days)` RPC + `desk-trend-chart.tsx`:
last-14-day check-in and points bar charts (inline SVG, live-refresh) on the
Front-desk tab, mirroring the admin Insights visuals. Access-gated to staff of
the business via `staffs_business`.

## CP-46.1 follow-up (same checkpoint)
- **Invites are now email + password** (Andrew's call). The route sets a
  password (inviter-typed or auto-generated) via the Admin SDK and returns
  `{ email, password, login_url }`; the modal shows all three with copy
  buttons, once. Magic-link path removed. No SQL change.
- **Full Atlas Impact dashboard on the front-desk tab**, gated to
  `role !== 'business_staff'` (front desk keeps the daily recap, stays out of
  revenue). Replaced the simpler bar-chart card; `desk-trend-chart.tsx` and
  the `manager_daily_series` RPC are now unused but harmless (left in place).
- **Welcome gift delay**: the welcome reveal now waits ~3.5s after the bell
  notification onboarding finishes (featured offers keep the 900ms beat), so
  the notification animation clearly plays first and the gift is its own
  later moment.

## Note on app preview sizing
Acknowledged — the agency live preview is now in sync with the live app, which
is what matters. Left as-is this round.
