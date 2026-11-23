# CP-261 · Email sequences for Flippo's (entertainment venues)

**Status: NOT applied.** Dry-run on production inside an aborted transaction on 2026-11-22: everything compiled, the 10 journeys installed paused and passed `wf_validate`, and a med spa's `wf_suite_row` output was byte-identical before and after.

Same engine as the med spa automations (CP-217 / CP-249), with its own catalog, its own email layout and its own send switch.

## The journeys (all email, all in the arcade layout)

| Group | Journey (`key`) | Starts when | Emails |
|---|---|---|---|
| New players | Welcome to the crew (`fe.welcome`) | someone joins | right away · day 4 if not back ("Book a cage") |
| Prizes & points | Points scoreboard (`fe.points_earned`) | points added | 2 h later, max 1/week |
| | Almost there (`fe.almost_there`) | balance reaches 75% of the next prize | 1 h later, max 1 / 3 weeks |
| | Prize unlocked (`fe.reward_ready`) | points cross a prize's cost | right away (button opens Redeem on that prize) · day 14 if nothing redeemed |
| | Prize expiring soon (`fe.reward_expiring`) | a redeemed prize expires in 3 days | once |
| After the visit | Google review for points (`fe.review`) | check-in, no review yet | next day, max 1 / 4 months |
| | Bring your crew (`fe.referral`) | check-in by someone with 3+ visits | next day, max 1 / 3 months |
| Bring them back | We miss you (`fe.winback`) | no visit in 45 days | day 45 · day 59 with **+1,000 points** if they check in within 14 days |
| Parties & birthdays | Birthday party planner (`fe.party_planner`) | birthday in 21 days (new daily event) | once (button opens booking on the Party section) |
| | Happy birthday (`fe.birthday`) | birthday | on the day |

Every button goes to a screen that exists in the venue app (`/app/rewards`, `?redeem=<id>`, `?focus=review`, `?focus=refer`, `/app/book`, `?section=party`). A signed-out guest who taps one signs in and lands on that screen (CP-261 `?next=` fix in the app layout). Existing push automations (we miss you, birthday gift, expiring gifts) are untouched. The engine's guards still apply: max 3 messages per member per week (push included), 10 am–8 pm local, one-click unsubscribe.

## Files

| File | |
|---|---|
| `01_catalog.sql` | generated `wf_venue_catalog()` (10 journeys) |
| `02_engine.sql` | `wf_catalog_for()`; `wf_suite` / `wf_suite_row` / `wf_suite_toggle` / `wf_suite_install_key` / `wf_suite_update` read it; `wf_act_email` passes `template='arcade'`, `data.gate`, `data.redeem`; reward unlocked / near / expiring events for entertainment venues (prize-counter rewards only); `birthday.soon` + daily cron; `wf_install_venue_suite()` |
| `03_install.sql` | installs the journeys on Flippo's, **paused** |
| `gen/venue_defs.py` | `PYTHONIOENCODING=utf-8 python gen/venue_defs.py` writes `01_catalog.sql` and `apps/venues/lib/automations/venue-suite-catalog.json` |

## Rollout order

1. **Run `01`, then `02`** in the Supabase SQL editor. Safe before the deploy: no venue journey exists yet, and med spas read the same catalog as today.
2. **Merge and deploy** (the venues app: dispatcher, desk, test email).
3. **Run `03`.** It must come after the deploy, otherwise the old dispatcher could pick up an arcade email and send it in the plain layout.
4. On the desk (Flippo's → Campaigns → Automations), open any email → **Send me a test**, and tap every button in your inbox.
5. Turn journeys on from the desk. Emails queue but are held (`skipped: venue_email_off`) until:
6. **`VENUE_EMAIL_SEND=1`** on the venues Vercel project (Settings → Environment Variables → Production), then redeploy. This is separate from `REWARDS_EMAIL_SEND`, so med spa reward emails and venue emails are switched on independently.

Flippo's has no contact email on file, so replies to these emails have nowhere to go. Add one in the business settings so `reply_to` is set.

## Code

* `apps/venues/lib/automations/arcade-email.ts`: the layout (marquee header, scoreboard with live points and a bar to the next prize, photo, headline + button, ticket-stub footnote, 2×2 prize counter, quick links, footer).
* `apps/venues/lib/automations/venue-email-build.ts`: one journey message → finished email, for the desk preview and the test send.
* `apps/venues/app/api/automations/email-dispatch/route.ts`: renders `template='arcade'` rows with each member's live points and prizes; `data.gate='venue'` held until `VENUE_EMAIL_SEND=1`.
* `apps/venues/app/api/automations/venue-email/route.ts`: GET status, POST "Send me a test" (managers only, to their own inbox).
* `apps/venues/components/manager/venue-automations.tsx`: the desk view. `manager-dashboard.tsx` puts it in **Campaigns** for entertainment venues (sub-tabs: Automations | One-time blasts). Deep link: `/manage?tab=campaigns` (`&view=blasts` for the composer).
* `app/[business]/app/layout.tsx` + `lib/supabase/middleware.ts`: signed-out deep links keep their destination through login.
* `rewards-client.tsx` (`?focus=refer`), `resource-booking.tsx` + `app/book/page.tsx` (`?section=party`).
