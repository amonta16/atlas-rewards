# CP-249 · Default reward automations + one shared rewards email (med spas)

**Status: NOT applied.** The SQL files are written for review. Nothing in production has changed.

## What it adds

Every med spa already gets the CP-217 automation suite when it's created (`trg_wf_suite_on_business`). CP-249 adds a **Rewards** group to that suite and one email layout every clinic shares:

| Journey | Trigger | Sends | New? |
|---|---|---|---|
| Reward unlocked (`ms.reward_ready`) | points cross a reward's cost (`reward.unlocked`) | the existing instant push, **an email right away**, then a push 14 days later if unused | email added; trigger now a true crossing instead of "any points while affordable" |
| Points earned (`ms.points_earned`) | points added | email 2 h later, max 1 a week; not during the welcome week or right after an unlock email | new |
| Almost there (`ms.almost_there`) | balance crosses 75% of the next reward (`reward.near`) | email 1 h later, max 1 every 3 weeks | new |
| Reward expiring soon (`ms.reward_expiring`) | a redeemed, unused reward expires in 2-4 days (`reward.expiring`, daily cron) | email | new |
| Gifts about to expire (`ms.points_expiring`) | existing legacy push, last 48 h | push | moved into the Rewards group |
| New patient welcome / We miss you | unchanged triggers | the day-1 email and the win-back gift email now use the rewards layout | layout only |

**The email** (`packages/core/src/email/rewards-email.ts`) keeps the Domino's Rewards *frame*: a brand header with the logo, a points card ("Jane, you have 144 points" + progress bar + Redeem), a large photo, a headline with one button, then the reward collection in up to three point tiers. It is styled as an editorial med spa email: Cormorant Garamond serif headlines (Georgia where the mail app has no web fonts), soft tints of the clinic's own colour on ivory, hairlines, letter-spaced small caps, and "Complimentary" / "Ready for you" / "Unlocks at 190" labels. Every colour comes from the clinic's brand colour, and it is darkened automatically when too pale to read; a rose clinic gets a rose email, a blue one a blue email. Everything else comes from the builder: name, logo, rewards, point costs and reward photos. The dispatcher reads the patient's live balance and the clinic's rewards at send time.

## Files

| File | |
|---|---|
| `01_reward_automations.sql` | outbox `template`/`data` columns, `wf_act_email` (+2 columns), `reward.unlocked`/`reward.near` emitter trigger, `wf_emit_reward_expiring()` + daily cron, `wf_suite_row` (+template), `wf_suite`/`wf_suite_toggle` open to clinic managers, grants |
| `02_catalog.sql` | generated `wf_suite_catalog()`: 18 journeys. The generator reproduces the live CP-228 catalog byte for byte before the CP-249 edits. |
| `03_install.sql` | optional: installs/updates the journeys on existing med spas, then **pauses the 3 new ones on live clinics** |
| `gen/suite_defs.py` | `PYTHONIOENCODING=utf-8 python gen/suite_defs.py` writes `02_catalog.sql` **and** `apps/medspa/lib/suite-catalog.json` (the demo desk's list + previews) |

Run order in the Supabase SQL editor: 01 → 02 → (optional) 03.

## Sending stays off

* The new reward emails carry `data.gated = true`. `/api/automations/email-dispatch` (venue app) marks them `skipped: rewards_email_off` until **`REWARDS_EMAIL_SEND=1`** is set on the venue app. This works like `LEAD_NURTURE_SEND`.
* All patient email still needs `RESEND_API_KEY` there. The sender is `"<Clinic name>" <hello@atlas-engine.app>` (`EMAIL_FROM_ADDRESS` in `apps/venues/lib/automations/email-template.ts`), and replies go to the clinic's contact email.
* The CP-217 audience guard still limits demo, example and preview clinics to their test members only.

## Code

* `packages/core/src/email/rewards-email.ts`: the template, plus `fillEmailVars` for previews. **`apps/venues/lib/automations/rewards-email.ts` is a byte-identical copy** (venues doesn't import `@atlas/core` yet). After editing, copy it over.
* `apps/venues/app/api/automations/email-dispatch/route.ts`: renders `template = 'rewards'` rows with it, and enforces the send switch.
* `apps/medspa/components/desk/automations-view.tsx`: Desk → App builder → Journey → **Automations**, now for every manager (was Atlas admins only). It shows each journey's trigger, timing, channels, on/off toggle and 30-day sends, plus **Preview**: push cards and each rewards email rendered for that clinic (desktop / phone). Deep link: `/<clinic>/desk?view=automations`.
* `apps/medspa/lib/desk-api.ts`: `Journey.messages` / `SuiteMessage`. The demo clinic lists the real catalog JSON.

Before 01 is applied, a live clinic's manager sees "Your automations show here once Atlas finishes setting them up". This is the 42501 from the old admin-only `wf_suite`. Atlas admins see the list as before.
