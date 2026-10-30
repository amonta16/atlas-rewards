# Atlas Visual Automation Hub · Audit, architecture and roadmap

Oct 23 2026 · Phase 1 deliverable. No production code was written. The companion files are `AUTOMATION_AUDIT.md` (the full inventory with file and function names) and the clickable prototype at `/agency/automations` (admin-only, mock data, behind a "Preview" badge).

## 1. What Atlas already does automatically

Atlas runs about **25 automations across three engines that don't know about each other**:

| Engine | Count | Examples |
|---|---|---|
| Postgres triggers | 17 customer-facing | welcome gift on enrol, reward-unlocked push, review request after a redemption, referral payout on first purchase, check-in-available reminder 12 h after a visit |
| pg_cron jobs inside Supabase | 8 | birthday points and birthday offer, holiday offers, comeback (14-day) and anniversary offers, expiring-gift pushes, 60-day dormancy, queued-notification drain every 2 min |
| Vercel crons | 5 | push delivery every minute, raffle finalizer, monthly report email, sales-funnel reminders, the daily sales nudge |

Three facts make a hub possible without rewriting any of it:

1. **Everything ends in two sinks.** A customer-facing automation either inserts a `notifications` row (bell + push) or a `points_ledger` row. Both already carry idempotency.
2. **A suppression layer already exists.** `_notif_gate` (per-business kind toggles, 90-second duplicate window) runs before every notification, and `_land_in_waking_hours` keeps queued pushes to 10:00–20:00 local. The hub plugs into these; it doesn't need its own.
3. **A delay primitive already exists.** `notification_queue (fire_at, dedupe_key)` drained by `fire_due_notifications()` with `FOR UPDATE SKIP LOCKED` is exactly the pattern the workflow engine needs, just generalised.

Dead ends found (cleanup targets, not blockers): `automation_rules` still enqueues SMS/email into `automation_queue` that nothing drains (the UI was unmounted in CP-37); the Campaigns studio is a "coming soon" shell; webhook settings and raffle manager UIs are unmounted; med spa recall is stored but never sends.

## 2. How the hub connects without breaking anything

**Phase 2 is a mirror, not a migration.** Each existing automation gets a *descriptor* (trigger, condition, action, channel, owner function) and the hub renders it as a locked "System" card on the business's canvas with live counts pulled from the rows it already writes (`notifications.kind`, `points_ledger.rule_type`, `business_automated_offers.last_triggered_at`). Nothing changes in how they run. Toggling one off still goes through today's switches (`business_notification_settings`, `business_automated_offers.is_active`).

**New workflows run beside the old ones on a new engine**, with a per-business `automations_enabled` flag that defaults to off. A system automation is retired only when:
1. a template that reproduces it has run in **Testing** for that business (test members only),
2. then **Active** for 30 days with the system version still on and the overlap guard preventing double sends,
3. then we flip that business's "use workflow for X" flag, which disables the legacy path for that one business only.

Guards against double messaging during overlap: the engine marks every message it sends with `source = 'workflow'` and a `family` (e.g. `winback`); the legacy comeback job and the win-back workflow share the family, and `_notif_gate` gets one new rule: skip a message if the same family was sent to that member in the last N days by either source.

Feature flags: `app_settings.automation_engine` (global kill), `business_automation_settings.enabled` (per business), `workflows.status` (draft / testing / active / paused / archived / error).

## 3. Triggers and actions: supported now vs new vs external

### Triggers

| Trigger (spec) | Status | Source |
|---|---|---|
| Signs up | **Now** | `business_memberships` INSERT (trigger exists) |
| Checks in | **Now** | `check_in_events` INSERT |
| Earns points / reaches balance | **Now** | `points_ledger` INSERT, `balance_after` |
| Redeems a reward | **Now** | `redemptions` |
| Reaches a streak milestone | **Now** | `member_streak_gifts` INSERT |
| Breaks a streak | Derivable | nightly evaluator over `member_streaks` + grace |
| No visit in X days | **Now** for 14 and 60; any X derivable | `last_visit_at` + nightly evaluator |
| Books / cancels / completes an appointment | **Now** | `bookings` (trigger already names these) |
| Completes a purchase, spending threshold | **Now** (desk-recorded purchases, Stripe shop orders); threshold derivable | `events.amount_cents`, `medspa_shop_orders` |
| Birthday / anniversary | **Now** | `profiles.birthday`, `joined_at` |
| Enters a new tier | Derivable | add trigger on `business_memberships.tier` change |
| Treatment due (med spa recall) | Derivable | `medspa_treatment_log` + `recall_weeks`, no job yet |
| Membership expiring | Derivable | `membership_expires_at` |
| Abandons a cart, views a product | **Needs new tracking** | no cart or view events exist; e-commerce templates stay greyed out until an integration lands |
| Opened a previous email / push | **Needs new tracking** | no open tracking (email needs a tracking pixel, push needs a click handler) |

### Actions

| Action | Status | Entry point to wrap |
|---|---|---|
| Send push (in-app + phone) | **Now** | insert `notifications`; minute cron delivers (web-push + FCM) |
| Award points | **Now** | `award_points` RPC (idempotent) |
| Unlock / grant a gift | **Now** | `_grant_automated_offer` |
| Create a personalised offer | **Now** | `send_winback_v2` (Home banner + bonus) |
| Business-wide offer | **Now** | `upsert_offer` as the holiday job does |
| Send email | **Partial** | Resend is wired for funnel/waiver/report mail; **no templates, no unsubscribe, no customer marketing consent**. Needs a template layer and an opt-out field before it's a workflow action |
| SMS | **Not built** | flag and queue exist, no provider. Needs Twilio (or similar) plus TCPA consent capture |
| Apply tag / update segment | **Not built** | new `customer_tags` table |
| Notify the business admin | Partial | agency `admin_notifications` exists; a per-business manager alert is new |
| Add / remove from another workflow | New | engine-level |

## 4. Architecture (fits the current stack)

Next 14 on Vercel · Supabase Postgres with pg_cron and pg_net already installed · web-push + FCM · Resend. No new infrastructure.

### Layers
1. **Events.** One append-only table `customer_events (business_id, membership_id, type, payload, occurred_at, dedupe_key)`. The ~12 code paths that already record enrolments, check-ins, points, redemptions, bookings, orders and verified reviews each get a one-line insert (or a tiny AFTER INSERT trigger on their table). Time-based events (birthday, inactivity N, recall due, streak at risk, membership expiring) come from one nightly pg_cron evaluator that inserts synthetic events. Nothing in the UI produces events.
2. **Definitions.** `workflows` + `workflow_versions`. The graph is JSON: `{nodes:[{id,type,config}], edges:[{from,to,branch}]}`. Every edit writes a draft version; Publish stamps it and points `current_version_id`; rollback repoints.
3. **Execution engine (SQL, inside Postgres).** `workflow_runs` holds one row per customer per entry with `current_node_id`, `status`, `wake_at`. A pg_cron job every minute calls `run_due_workflow_steps()`: it takes due runs with `FOR UPDATE SKIP LOCKED`, evaluates the node, appends a `workflow_run_steps` row, moves the pointer, sets the next `wake_at`. An AFTER INSERT trigger on `customer_events` opens runs for matching Active workflows (respecting re-entry rules). **No browser timers, no Vercel function holding state.** This is the same pattern `fire_due_notifications` already uses.
4. **Delays** are just `wake_at`. "Wait until condition, with timeout" is a wait node re-checked each tick until true or the deadline passes.
5. **Delivery** reuses the existing sinks through thin adapters: `wf_action_push`, `wf_action_points`, `wf_action_gift`, `wf_action_offer`, `wf_action_email`, `wf_action_tag`, `wf_action_admin_alert`. Each takes `(run_id, node_id, config)` and is idempotent on `run_id:node_id`.
6. **Segments and personalisation.** `customer_tags` for Apply tag. Conditions are SQL predicates over `business_memberships`, `points_ledger`, `check_in_events`, `customer_events`, `customer_tags`. Variables (`{{first_name}}`, `{{points_remaining}}`, `{{days_since_last_visit}}`, `{{offer_name}}`) resolve server-side at send time with declared fallbacks (`{{first_name|there}}`); unknown variables fail validation at Publish, not at send.
7. **Logs and analytics.** `workflow_run_steps` is the per-customer path. Per-node metrics are counts over it, rolled up nightly into `workflow_node_stats`. Delivery outcome joins `notifications.push_sent_at` / error. **Measured** = counts (reached, sent, delivered, redeemed, points awarded). **Attributed** = a goal event (check-in, redemption, purchase) within the attribution window after a message, labelled "attributed" everywhere. Revenue appears only where `events.amount_cents` or shop orders exist, and is labelled by source.
8. **Editor.** Agency builder → Automations tab (admin-only; every new table is RLS `is_agency_admin()`). React Flow canvas, palette, config panel, Test, Publish, Pause, Versions. Simulation runs the engine in a `dry_run` transaction that is rolled back and returns the path.

### Data model
```
customer_events               id, business_id, membership_id, type, payload jsonb, occurred_at, dedupe_key
                              unique (business_id, type, dedupe_key)
workflows                     id, business_id, name, family, status, current_version_id, reentry_days, created_by, created_at
workflow_versions             id, workflow_id, version int, graph jsonb, notes, published_at, published_by
workflow_runs                 id, workflow_id, version_id, business_id, membership_id, status
                              (running|waiting|done|exited|error), current_node_id, wake_at, attempt int,
                              entered_at, exited_at, exit_reason, entry_event_id
                              unique (workflow_id, membership_id, entry_event_id)
workflow_run_steps            id, run_id, node_id, node_type, result (ok|yes|no|skipped|waiting|error), detail jsonb, at
customer_tags                 business_id, membership_id, tag, source_run_id, created_at   pk (business_id, membership_id, tag)
business_automation_settings  business_id pk, enabled, quiet_start, quiet_end, max_msgs_per_member_per_week, test_membership_ids uuid[]
member_comm_prefs             membership_id pk, email_opt_out_at, sms_consent_at, paused_until
workflow_node_stats           workflow_id, version_id, node_id, day, reached, completed, waiting, sent, delivered, failed, converted
```
Existing tables change only additively: `notifications` gains nullable `workflow_run_id`, `workflow_node_id`, `source`, `family`, `idempotency_key`.

### Guardrails built into the engine (not into each workflow)
- **Idempotency**: one run per (workflow, member, entry event); one action per (run, node). Points reuse `points_ledger.idempotency_key`.
- **Re-entry**: `reentry_days` per workflow; the matcher refuses a new run while one is open or inside the window.
- **Frequency cap**: `max_msgs_per_member_per_week` (default 3) across all sources; a capped node records `skipped: frequency_cap` rather than failing.
- **Quiet hours**: configurable per business (default 10:00–20:00 local, matching today's hard-coded window); a due message slides to the next allowed minute.
- **Consent**: push only to live `push_subscriptions`; email only with an address and no `email_opt_out_at`; SMS only with `sms_consent_at`; `paused_until` honoured for all.
- **Exclusions**: demo (`is_demo`) and blocked members never enter runs, the same filter the hourly jobs use today.
- **Overlap**: one open run per family per member (e.g. one win-back at a time, legacy or new).
- **Testing**: `status = testing` runs only for `test_membership_ids` and prefixes messages with [TEST]; simulation is a rolled-back dry run and writes nothing.
- **Retries**: action errors back off 1 min → 10 min → 1 h, then `status = error` and a red badge on the node; the run is resumable after a fix.
- **Kill switches**: global flag, per-business flag, per-workflow Pause. The minute cron exits immediately when the global flag is off.
- **Tenant isolation**: `business_id` on every row; admin-only RLS; the engine runs as a `SECURITY DEFINER` function scoped per row.

## 5. Roadmap by dependency and risk

| Phase | Scope | Depends on | Risk | Effort |
|---|---|---|---|---|
| **1 · Audit and architecture** (done) | this document, prototype | — | none | done |
| **2 · Unified hub, read-only** | descriptor registry for the ~25 system automations; Automations tab showing them as locked cards with live counts; message list (what, when, who owns it, sent/failed) built from `notifications`; retire the dead `automation_rules` trigger | nothing new in the DB except a read view | **low** (reads only) | ~1 week |
| **3a · Engine without UI** | `customer_events` + emitters, workflow tables, `run_due_workflow_steps()`, push/points/gift/tag adapters, guardrails, pg_cron minute job, SQL-level tests, one hand-written workflow in Testing on one demo business | Phase 2 descriptors (for the family/overlap rule) | **medium**: the emitters touch live code paths; mitigated by inserts-only, feature flag off by default | ~2 weeks |
| **3b · Visual builder** | React Flow editor, config panel, validation, versions, Publish/Pause, Test (dry run) wired to 3a | 3a | low–medium (UI only) | ~2 weeks |
| **4 · New capabilities and templates** | nightly evaluator (inactivity N, streak broken, tier change, recall due, membership expiring); email template layer + unsubscribe + consent fields; frequency cap and quiet-hours settings UI; manager admin alerts; the 5 med spa + 10 classic templates; migrate comeback / birthday / welcome to workflows per business via the overlap flow | 3a, 3b | **medium–high**: email and consent are the legal surface; SMS deferred until a provider and TCPA consent capture exist | ~3 weeks |
| **5 · Analytics** | `workflow_node_stats` rollup, per-node pills, per-customer path view, dashboard strip with measured vs attributed, troubleshooting log, A/B comparison between versions | 3a (steps), 4 (events) | low | ~1–2 weeks |

Order matters: 2 before 3 so the family/overlap rule has something to protect; 3a before 3b so the UI edits a real engine; email/SMS consent before any email or SMS node is publishable; e-commerce templates stay greyed out until an integration delivers cart/view events.

## 6. Costs, risks and scale

**Operational cost: close to zero at today's size.** Everything runs inside the Supabase Postgres instance and the existing Vercel crons. Today: 25 real businesses, ~315 members, ~170 notifications a month, a 54 MB database. The engine adds one pg_cron minute job (already free with pg_cron) and a few hundred rows a day. At 1,000 businesses × 500 members and ~10 active workflows each, expect a few thousand due runs a minute and ~50k `workflow_run_steps` a day: comfortably within one Postgres on the current plan; `workflow_run_steps` is the only table that needs a monthly partition or a 180-day prune. Push is free (web-push, FCM). Email via Resend is the one metered line: roughly $20/month for 50k emails, so about $0.0004 per email; at 500 members × 4 emails a month per business that's about $0.80 per business per month. SMS, if added later, is the expensive channel (about $0.008–0.01 per message plus a number per business), so it should be a paid add-on.

**Technical risks and mitigations**
- *Double messaging during migration* → family overlap rule in `_notif_gate`, per-business flags, 30-day overlap period.
- *Emitters breaking live flows* → inserts only, wrapped in `BEGIN … EXCEPTION WHEN OTHERS THEN NULL` like `_grant_automated_offer` already does, so an event-table problem can never fail a check-in.
- *Runaway workflow (loop, misconfigured wait)* → graph validation refuses cycles without a wait; max 500 steps per run; frequency cap.
- *Timezone mistakes* → everything uses `business_timezone()`, which the existing jobs already rely on.
- *Legal surface of email/SMS* → unsubscribe link and consent fields are hard prerequisites in Phase 4; CAN-SPAM for email, TCPA for SMS; keep the hub admin-only so no business can bypass them.
- *Prototype drift* → the prototype's graph JSON shape is the same shape the engine stores, so the UI work carries over.

**Scaling requirements**: none new. Keep pg_cron, add partitioning on `workflow_run_steps` when it passes ~10 M rows, move the minute job to every 30 s only if wait precision ever matters.

## 7. The prototype
`/agency/automations` (admin sidebar → Automations · Preview). Mock data only: palette, infinite canvas with the spec's Win-Back workflow, node config panel with variable chips, Test (simulated customer walk), Publish/Pause/Versions, template library (med spa, classic, e-commerce greyed out), the "System · read-only" cards for today's automations, and the dashboard strip with Measured vs Attributed labels. It is behind the agency admin gate and does not touch the database.
