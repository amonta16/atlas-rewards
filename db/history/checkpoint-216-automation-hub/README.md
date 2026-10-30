# CP-216 · Atlas Automation Hub — backend

Everything in this folder is **live in production** (Supabase project `gqmjpntzupnmjooszvcd`, applied Oct 23 2026
via the Supabase MCP as migrations `cp216_01_tables` … `cp216_08_hardening`). The files are the source of truth for
what was applied; re-running any of them is safe (idempotent: `create or replace`, `if not exists`, DO-block guards,
no DROPs).

| File | Migration | What it does |
|---|---|---|
| `01_tables.sql` | `cp216_01_tables` | `app_settings` (seeded `automation_engine='off'`), `customer_events`, `workflows`, `workflow_versions`, `workflow_runs`, `workflow_run_steps`, `customer_tags`, `business_automation_settings`, `member_comm_prefs`, `workflow_node_stats`; additive `notifications.{source,family,workflow_run_id,workflow_node_id,idempotency_key}`; admin-only RLS on every new table via `is_agency_admin()` |
| `02_events.sql` | `cp216_02_events`, `cp216_02b_evaluator_fix` | `wf_emit()` + 11 emitter triggers on legacy tables (every body in `BEGIN…EXCEPTION WHEN OTHERS THEN NULL`), `wf_evaluate_time_events()` (inactivity.N, birthday, anniversary, streak.broken, recall.due, membership.expiring) |
| `03_engine.sql` | `cp216_03_engine` | graph helpers, `wf_render` variables, `wf_cond` conditions, `wf_trigger_matches`, `wf_open_run`, `wf_match_event` trigger, adapters `wf_act_*`, `wf_advance_run` (waits, retries 1m/10m/1h, 500-step cap, dry mode), `wf_tick` |
| `04_rpcs.sql` | `cp216_04_rpcs` | every contract RPC (`wf_hub_summary`, `wf_legacy_automations`, `wf_list`, `wf_get`, `wf_validate`, `wf_save_draft`, `wf_publish(…, p_mode)`, `wf_set_status`, `wf_rollback`, `wf_simulate`, `wf_node_metrics`, `wf_member_path`, `wf_runs`, `wf_set_settings`) plus `wf_members`, `wf_rewards`, `wf_messages`, `wf_set_engine`, `search_members(uuid,text,int)` |
| `05_templates.sql` | `cp216_05_templates` | `wf_load_template(business, key)` for the 15 server templates (5 med spa, 10 classic; 6 e-commerce keys raise `needs_integration`), `wf_template_catalog()` |
| `06_legacy_bridge.sql` | `cp216_06_legacy_bridge` | `_notif_gate` re-created with source/family stamping, the family-overlap rule and a shared F11 push budget; `_grant_automated_offer` sets `source='legacy'` + family |
| `07_cron.sql` | `cp216_07_cron` | `atlas-wf-tick` (every minute) and `atlas-wf-time-events` (03:30 UTC daily) |
| `08_hardening.sql` | `cp216_08_hardening` | search_path on helpers, EXECUTE revoked from anon/authenticated on all internals, client RPCs `authenticated`-only, `search_members` overload disambiguated |

## How it fits together

```
legacy tables ──emitter triggers──▶ customer_events ──AFTER INSERT wf_match_event──▶ workflow_runs
                                                                                        │
pg_cron (every minute) ──▶ wf_tick() ──▶ wf_advance_run(run) ──▶ wf_act_* adapters ──▶ notifications (source='workflow')
                                                                                        points_ledger / redemptions / customer_messages / customer_tags
pg_cron (03:30 UTC) ──▶ wf_evaluate_time_events() ──▶ customer_events (inactivity.N, birthday, …)
```

* **Kill switches.** `app_settings.automation_engine` (`on`/`off`, global; `wf_set_engine(bool)`) and
  `business_automation_settings.enabled` per business. Both must be on for a business to match events or advance runs.
  Current state: global **on**, `lotus-medspa` enabled (its only workflow is *paused*), every other business disabled
  (`flippo-s-arcade-and-batting-cage` has an explicit `enabled=false` row).
* **Testing vs active.** `wf_publish(workflow, version, 'testing')` only enrols `test_membership_ids` and prefixes
  titles with `[TEST]`; `'active'` enrols everyone except demo/blocked members.
* **Guardrails.** idempotency key `wf:<run>:<node>` on `notifications` and `points_ledger`; frequency cap
  `max_msgs_per_member_per_week` (default 3); quiet hours slide to `quiet_start` (default 10:00–20:00 in
  `business_timezone()`); one open run per workflow per member; `reentry_days` / `w.no_reentry`; one open run per
  *family* per member; family-overlap rule in `_notif_gate` (a legacy win-back is dropped if a workflow win-back reached
  the member in the last 7 days, and vice-versa); the F11 2-pushes/20 h budget counts workflow pushes too.
* **Simulation.** `wf_simulate(workflow, version?, membership?)` runs the real engine in dry mode inside the RPC and
  then raises `WF_DRY_ROLLBACK` to undo everything, returning the path from the exception detail. Verified: row counts
  in `notifications`, `workflow_runs`, `workflow_run_steps`, `points_ledger`, `customer_tags`, `customer_messages`,
  `redemptions` are identical before and after. It always uses the saved version (`coalesce(p_version_id,
  current_version_id)`); there is no graph argument.

## Calling from the UI

All client RPCs are `security definer`, call `wf_assert_admin()` (agency admins only) and are granted to
`authenticated` only. `search_members` **must be called with all three arguments** (`p_business_id, p_q, p_limit`): a
pre-existing staff-desk `search_members(uuid, text)` shares the name, so the Hub version has no default on `p_limit`.

## Verified end to end (lotus-medspa, Oct 23 2026)

1. `wf_load_template('ms.winback')` → draft, 13 nodes; `wf_validate` → 0 errors (all 15 templates validate clean).
2. `wf_publish(…, 'testing')` → status `testing`, `reentry_days=60`.
3. `wf_simulate` → 10-step path, variables rendered (`John`, `50 days`), nothing persisted.
4. Synthetic `customer_events` row `inactivity.45` for an `is_demo` test membership → `wf_match_event` opened a run;
   `wf_tick()` advanced it 4 steps (trigger → `c.visited`=no → `a.push` → `w.wait` until +3 days) and wrote one
   `notifications` row with `source='workflow'`, `family='winback'`, `idempotency_key='wf:<run>:n4'`; the existing push
   pipeline set `push_sent_at` 2 s later.
5. A legacy `we_miss_you` insert for the same member was dropped by the family-overlap rule; a second `wf_tick()` was
   a no-op while the run waited. `wf_hub_summary`, `wf_list`, `wf_runs`, `wf_node_metrics`, `wf_member_path`,
   `wf_legacy_automations` (15 rows), `search_members` all returned the expected data.
6. Cleanup: test membership, events, run, steps and notification deleted; `test_membership_ids` cleared; workflow set
   to `paused`. `select count(*) from cron.job` = 10 (8 legacy + 2 new).

## Deviations from the contract / notes for the coordinator

* `a.unlock` is implemented as a free pending `redemptions` row (point_cost 0, desk code via
  `generate_redemption_code`) + notification, not via `_grant_automated_offer` (which needs one
  `business_automated_offers` row per template and can't be used per node).
* `a.offer` replicates `send_winback_v2` (which requires `staffs_business()`): writes `customer_messages` kind
  `winback`, optional reward redemption, bonus points (`winback_bonus`) and a `we_miss_you` notification.
* `a.email` is validated as `needs_setup` (blocks Publish); `a.sms`, `a.segment`, `c.opened` as coming soon. Server
  templates use only push/offer/points/unlock/tag/notify_admin.
* Extra trigger types beyond the contract: `t.anniversary`, `t.recall`, `t.treatment`, `t.membership`, `t.review`,
  `t.referral`; extra condition `c.tagged`. Extra RPCs: `wf_members`, `wf_rewards`, `wf_messages`, `wf_set_engine`,
  `wf_template_catalog`.
* The renamed `_search_members_hub_v0` (the defaulted overload) is kept but not executable by anyone; drop it when a
  DROP can be confirmed interactively.
* Advisors after hardening: no CP-216 function has a mutable search_path; no CP-216 function is executable by `anon`;
  the 21 client RPCs are executable by `authenticated` (by design, each gated by `wf_assert_admin()`). Pre-existing
  warnings on legacy functions (`_notif_gate`, `_grant_automated_offer`, `search_members(uuid,text)`, …) were left as
  they were.
