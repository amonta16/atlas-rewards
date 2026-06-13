# CP-49 — Front-desk PIN login + streak fixes

Three things in this checkpoint:

1. **Front desk = PIN only.** Front-desk staff no longer sign in with an email + password. A manager gives them a **name + 4-digit PIN**, and they tap it on a **branded keypad** at `/<slug>/frontdesk`. Managers keep their email/password login **and** can give themselves a PIN to use the keypad too.
2. **Streak points bug fixed.** A milestone you switched from "Pick a reward" to "Award points" kept its old `reward_id`, so the customer widget treated it as a reward and hid the points number (your Starbucks "D3 points not showing" bug). Fixed in the data, the API, and the UI.
3. **Streak is clearer.** Upcoming days are now dimmed + padlocked (instead of looking the same as earned days), and there's a date banner showing the current period window (e.g. *"This week: Jun 8 – Jun 14 · Last check-in: Wed Jun 11"*).

---

## 1. Apply the SQL (required)

Open Supabase → SQL editor → paste **`cp49_migration.sql`** → Run. It's idempotent (safe to re-run).

It creates the `front_desk_pins` + `front_desk_throttle` tables and the PIN RPCs, upgrades `get_streak_status`, and **auto-cleans** any points milestones that had a stale `reward_id` — so your Starbucks streak will start showing the D3 points immediately after this runs.

No new environment variables. PIN login reuses the existing `SUPABASE_SERVICE_ROLE_KEY` (already set for team invites).

> **If you already hit `ERROR 42P13: cannot change return type of existing function`** — that was the old `get_streak_status` blocking the recreate. It's fixed now (the migration drops the function first). The front-desk tables + the milestone cleanup already ran before the error, so you can just run the small **`cp49_streak_fn_fix.sql`** to finish — or re-run the full `cp49_migration.sql`, which is safe.

## 2. Deploy

Push (block at the bottom) → Vercel redeploys.

## 3. The two portal links per business

Replace `your-app` with your real Vercel domain and `<slug>` with the business slug:

| Who | Link | How they sign in |
|-----|------|------------------|
| **Customer** | `https://your-app.vercel.app/<slug>/login` | Email + password (or signup) → their rewards app only |
| **Front desk** | `https://your-app.vercel.app/<slug>/frontdesk` | Tap their 4-digit PIN on the keypad |
| **Manager** | `https://your-app.vercel.app/<slug>/login` | Email + password → routed to the manage portal |

### Portals stay separate

The customer login (`/<slug>/login`) and the front-desk keypad (`/<slug>/frontdesk`) are now **distinct portals** — the keypad link no longer shows on the customer-facing login, so customers never see the front-desk entry. A customer can't sign into a manager/front-desk account: front-desk accounts have no usable email/password (PIN only, brute-force throttled), and managers sign in with their own credentials. Sign-in is **role-aware** — a customer always lands in the rewards app, a manager always lands in the manage portal — so neither can end up in the other's portal. The "Front desk? Enter with your PIN →" link only appears when a staffer is bounced to the login from the manage area.

So for your two test businesses (swap in the actual slugs/domain):

- Demo front desk → `https://your-app.vercel.app/demo/frontdesk`
- Demo manager → `https://your-app.vercel.app/demo/login`
- Starbucks front desk → `https://your-app.vercel.app/starbucks/frontdesk`
- Starbucks manager → `https://your-app.vercel.app/starbucks/login`

> Tell me your exact Vercel domain + the real slugs and I'll hand back the four finished links.

## 4. How a manager sets up the front desk

Manager signs in → **Team** tab → **Front desk PINs** panel:

- **Add front-desk person** — name + 4-digit PIN. Creates them instantly (no email needed). They appear in the list and can sign in at the keypad link right away.
- **Your front-desk PIN** — give yourself a PIN so you can use the keypad too (you keep your email login).
- **Change PIN / Remove** — per person.
- The panel also shows the **keypad link** with a copy button.

PINs must be unique per business (so one keypad entry = one person). After 8 wrong PINs in a row the keypad locks for 5 minutes (brute-force guard). A successful PIN change clears the lock.

---

## How the PIN login works (under the hood)

Each PIN still maps to a real, hidden Supabase auth user with the `business_staff` role, so **every existing RLS policy keeps working unchanged**. The keypad posts to `/api/frontdesk/login`, which matches the PIN (bcrypt, throttled), mints a one-time magic-link token via the Admin SDK (no email sent), and exchanges it for a session. No passwords are stored or shown anywhere.

## Files

**SQL**
- `cp49_migration.sql` — tables, RPCs, `get_streak_status` v2, milestone cleanup

**New**
- `app/[business]/frontdesk/page.tsx` — branded keypad page
- `components/frontdesk/front-desk-keypad.tsx` — the keypad UI
- `app/api/frontdesk/login/route.ts` — PIN → session
- `app/api/frontdesk/create/route.ts` — manager creates a name+PIN staffer
- `components/team/front-desk-pins.tsx` — manager PIN management panel

**Changed**
- `components/manager/manager-dashboard.tsx` — mounts the panel in the Team tab
- `app/[business]/login/page.tsx` — adds the "Front desk? Enter with your PIN" button
- `components/agency/streak-config-editor.tsx` — clears `reward_id` when switching a milestone to points
- `components/customer/streak-widget.tsx` — gift_kind-authoritative points display, dimmed/locked upcoming days, current-period date banner

---

## Ship it

Run from the repo root (the **Atlas Engine APP** folder) so both the app code and this checkpoint's SQL/README go in one commit:

```bash
git add -A
git commit -m "CP-49: PIN-based front desk login + streak points/lock/date fixes"
git push
```
