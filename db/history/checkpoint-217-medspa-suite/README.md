# CP-217 · Atlas Med Spa Automation Suite — backend

Live in production (Supabase `gqmjpntzupnmjooszvcd`, Oct 24 2026 UTC). Every file is idempotent (create or replace / if not exists, no DROPs).

| File | Migration(s) | What |
|---|---|---|
| `01_schema.sql` | `cp217_01_schema` | `workflows.system_key/managed/overrides` (+ unique (business_id, system_key)), `business_automation_settings.audience` (auto/live/test), `email_outbox` (+ `sending`, `hero_url`, `attempts`, `claimed_at`), `suite_legacy_saved`, index on customer_events (membership, type, time). Admin-only RLS. |
| `02_engine.sql` | `cp217_02_engine`, `cp217_02b_engine_loop`, `cp217_02c_notif_gate` | New nodes/conditions/variables (list at the top of the file), `wf_member_allowed` audience guard, `wf_run_ctx` (variables from the entry event), `wf_cond_run`, `wf_at_target`, `wf_act_email`, updated push/offer adapters, `wf_match_event` (entry_if + audience), `wf_msg_block` (counts emails; family `booking` exempt), `wf_advance_run`, `wf_validate` (email publishable), `wf_simulate`, `wf_hub_summary` (email from outbox), `wf_set_settings` (audience), `_notif_gate` (booking reminders outside the F11 budget). |
| `03_events.sql` | `cp217_03_events` | `track_event` RPC, `checkout.started`/`order.reserved` on shop order insert, `order.paid` now carries item_id, `visit.completed` (booking completed / treatment logged / check-in, med spas only, one per member per local day), `content.published` fan-out (reward insert, news published, newly featured shop item), nightly evaluator (inactivity.N from t.event, recall.due 10 days before due). |
| `04a_catalog.sql` | `cp217_04a_catalog` | **Generated** by `gen/suite_defs.py` — the 14 journeys (copy, research, timing, graphs). Edit the .py and regenerate, never the SQL. |
| `04b_suite.sql` | `cp217_04b_suite_install`, `cp217_04c_suite_rpcs`, `cp217_04d_preview_money` | overrides, `wf_suite_install_key`, `wf_install_medspa_suite`, legacy switch mapping, trigger `trg_wf_suite_on_business`, legacy display graphs, `wf_suite_row`, RPCs `wf_suite`, `wf_suite_toggle`, `wf_suite_update`, `wf_suite_reset`, `wf_suite_install`, `wf_suite_preview_data`. |
| `05_hardening_install.sql` | `cp217_05_hardening` + one install run | Internals not executable by anon/authenticated; suite RPCs + `track_event` authenticated-only (suite RPCs call `wf_assert_admin()`); install for every med spa. |

Next.js: `app/api/automations/email-dispatch/route.ts`, `app/api/email/unsubscribe/route.ts`, `lib/automations/unsubscribe-token.ts`, cron in `vercel.json` (`* * * * *`).

## Who gets messages (important)

`business_automation_settings.audience = 'auto'` (default): live for real businesses; for **demo businesses (`businesses.is_demo`) and example apps (`medspa_config.example = true`) only `test_membership_ids` are reached**. All four current med spas (lotus-medspa is an example; the other three are demos) are therefore test-only even though their members are real people (team and prospects with real gmail addresses). To go live: real client business (`is_demo=false`, no example flag) or `wf_set_settings(..., {"audience":"live"})`. Demo members (`is_demo`) are excluded unless listed as test members, as before.

## Legacy switches each key controls

| Key | Legacy switch | When the suite journey is ON | OFF |
|---|---|---|---|
| `ms.review` | `business_notification_settings.review_request` | false (redemption-based review ask off) | restored (saved value, default true) |
| `ms.winback` | `business_automated_offers.is_active` for templates with `trigger_type='inactivity'` (Comeback) | false | restored per offer |
| `ms.reward_ready` | `business_notification_settings.reward_unlocked` (instant "you unlocked" push) + the 14-day workflow | true | false |
| `ms.birthday` (legacy-backed) | `business_notification_settings.birthday`, `point_rules.birthday`, birthday automated offer `is_active` | restored (saved points, else current, else 250) | saved, then false / 0 / false |
| `ms.points_expiring` (legacy-backed) | `business_notification_settings.gift_expiration_reminders` | true | false |

Saved values live in `suite_legacy_saved`.

## Points

cart +200 (paid within 48 h of the 72 h push) · rebook +150 (booked within 7 days of the overdue push) · membership join +250 (within 2 weeks) · win-back +200 (visit within 2 weeks of the gift email) — all `a.points` nodes, idempotent on `wf:<run>:<node>`, editable per business via `wf_suite_update(..., {"points": N})` on the advertising message or the points node. Welcome / first visit / review / referral / birthday reuse `point_rules` (shown, not awarded by the suite: no double award).

`{{bonus}}` resolves from the message's `bonus_from` (`node:<id>` or `rule:<point_rules key>`); `{{friend_bonus}}` = `point_rules.referral_referee`. `wf_suite` returns messages with both already filled in (journey constants); every other variable is left for the UI preview to render from `wf_suite_preview_data().sample`.

## Verified on lotus-medspa (temporary is_demo test member, then removed)

* `wf_suite` → 14 rows (12 workflow, 2 legacy), graphs + messages; all 12 graphs `wf_validate` clean.
* Welcome: enrol → push "Welcome to Lotus Medspa, Test" → wait 1 day (fast-forwarded) → `email_outbox` row queued ("How your Lotus Medspa app works", cta /app).
* Cart: `checkout.started` (Emsculpt NEO, $3,000) → 2 h → "Still thinking about Emsculpt NEO, 4 sessions?" → 24 h email (hero = item photo, footnote "4 interest-free payments of $750") → 72 h push **skipped: frequency_cap** (3/week reached) → `order.paid` → `w.until` yes → +200 pts (`workflow_bonus`) → exit `converted`. The +200 then opened `ms.reward_ready` (balance covered a reward), as designed.
* Real (non-demo) member at lotus: `checkout.started` → 0 runs (`test_audience`). No workflow notifications to anyone else during the test.
* Toggles: all five legacy keys off → review_request true, birthday false/0 pts, gifts false, reward_unlocked false, comeback offer true; on again → everything restored (500 birthday pts back).
* `wf_suite_update` points 300 → points node + label "+300", message text updated; `wf_suite_reset` → back to 200; legacy keys rejected; non-admin rejected (42501).
* Emitters + `track_event` (dedupe, disallowed type) proven inside a rolled-back block.
* Cleanup: member, runs, steps, events, points, notifications, outbox rows, temp offer removed; lotus settings restored (10:00–20:00, no test members). `cron.job` = 10.

## Deviations / notes

* Audience guard (above) is new: without it, enabling the suite would have messaged real people at demo businesses.
* Lotus had a second, unmanaged **active** "Client Win-Back" (created 02:41 UTC from the template) next to the adopted one; it was **paused** to avoid a duplicate win-back (id `16f2f25c-…`).
* CP-216's paused ms.winback at lotus was adopted as the managed `ms.winback` (new version, set active).
* Cart re-entry is 14 days per member (not per item). Klarna line is always shown (not gated on shop financing).
* `ms.app_checkin` max 2/month = re-entry 15 days. App activity = `app.opened` events, notifications read, or check-ins.
* `ms.appointment_reminder` pushes are `transactional` (skip the weekly cap) and family `booking` (outside the 2/20 h push budget). A cancellation during a pending reminder is noticed within 6 h.
* Email statuses add `sending` (claim) to the contract's queued|sent|failed|skipped. Dispatcher skips obvious test addresses (example.com, *.test).
* The "It's been {{days_since_last_v" truncation is **not** in the backend: the stored graph has the full body; it's UI-side.
* Quiet hours: `quiet_start → quiet_end` is the ALLOWED window (default 10:00–20:00 local) — matches the UI.
