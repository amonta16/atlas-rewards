# Atlas automation audit (Phase 1 of the Visual Automation Hub)

Read-only inventory of everything Atlas already does automatically, as of CP-214 (Oct 23 2026). Sources: `checkpoint-02-brand-engine/atlas-rewards-app` and the production database (`gqmjpntzupnmjooszvcd`).

**Headline:** Atlas already runs ~25 automations across three engines that don't know about each other: (1) Postgres triggers, (2) pg_cron jobs inside Supabase, (3) Vercel cron routes. Almost all of them end in one of two places: a row in `notifications` (bell + push) or a row in `points_ledger`. That shared "sink" is what makes a unified hub feasible without rewriting them.

## 1. Scheduled jobs

| Name | Schedule | What it does | Where | Status |
|---|---|---|---|---|
| Push queue drain | Vercel cron, every minute | Pushes every `notifications` row with `push_sent_at IS NULL` (web-push + FCM), stamps `push_sent_at` | `app/api/notifications/process-pending/route.ts` → `lib/notifications/push-server.ts` `sendPushToUsers` | live |
| Raffle finalizer | Vercel */5 min **and** pg_cron job 4 */5 min | `finalize_due_raffles()` picks winners once (row lock), route adds phone pushes | `app/api/raffles/sweep/route.ts`, fn `finalize_due_raffles` | live (double-scheduled on purpose, idempotent) |
| Daily sales nudge | Vercel 16:00 & 20:00 UTC | Motivational push to agency admins (internal, not customers) | `app/api/admin-app/daily-nudge/route.ts` | live, internal |
| Funnel reminders | Vercel */15 min | Emails for /medspa demo bookings: 24 h, 2 h, post-call, 48 h hold sequence (Resend) | `app/api/landing/reminders/route.ts` | live, sales funnel only |
| Monthly report | Vercel 1st of month | Builds `business_monthly_reports`, emails managers via Resend | `app/api/reports/monthly/route.ts` | live |
| Dormancy sweep | pg_cron job 2, 09:15 daily | `business_memberships.status → 'dormant'` after 60 days without a visit | fn `process_dormancy` | live (status only, sends nothing) |
| Queued notifications | pg_cron job 3, every 2 min | `fire_due_notifications()` moves due `notification_queue` rows into `notifications` (skips if member checked in <12 h or same kind sent <3 days) | fn `fire_due_notifications` | live |
| Birthday offers | pg_cron job 5, hourly :07 | `process_birthday_offers()` grants the Birthday automated offer to members whose birthday is today (after 9 am local) | fn `process_birthday_offers` → `_grant_automated_offer` | live |
| Expiring gifts | pg_cron job 6, hourly :23 | `notify_expiring_gifts()` pushes `reward_expiration` for redemptions, streak gifts, saved offers expiring <48 h; 9–20 h local only | fn `notify_expiring_gifts` | live |
| Birthday points | pg_cron job 7, hourly :13 | `process_birthdays()` credits `point_rules.birthday` once a year (idempotency `birthday_<membership>_<year>`), 9–20 h local, skips demo members | fn `process_birthdays` | live |
| Holiday offers | pg_cron job 8, 17:00 UTC daily | `trigger_automated_offers()` creates a featured `offers` row + notifies all members when a date template is within its window; 30-day re-fire guard (`last_triggered_at`) | fn `trigger_automated_offers` | live |
| Inactivity + anniversary offers | pg_cron job 9, hourly :37 | `process_member_date_offers()`: "comeback" (default 14 days, window to +30) and signup anniversary; 10–19 h local; skips if already granted since last visit or notified recently | fn `process_member_date_offers` → `_grant_automated_offer` | live |

No Supabase Edge Functions are involved in automations (push goes through Vercel routes).

## 2. Database triggers (customer-facing)

| Table · trigger | Fires on | Condition | Action | Function | Status |
|---|---|---|---|---|---|
| `business_memberships` · `trg_welcome_gift` | INSERT (member enrols) | business has an active **welcome** automated offer | Save a per-member offer (`customer_saved_offers`, code minted), or credit points inline; `notifications` row | `_fire_welcome_gifts_for_new_member` | live |
| `business_memberships` · `trg_notif_reward_unlocked` | UPDATE, balance up | a reward's `point_cost` was crossed | `reward_unlocked` notification (push stamped as sent; the phone push is fired by the desk route instead) | `_notif_reward_unlocked` | live |
| `business_memberships` · `trg_push_sub_cleanup` | DELETE | not staff | removes the member's push subscriptions for that business | `_push_sub_cleanup_on_leave` | live |
| `check_in_events` · `trg_notif_daily_check` | INSERT | first check-in today | `daily_check` notification | `_notif_daily_check` | live |
| `check_in_events` · `trg_queue_checkin_avail` | INSERT | — | queues `check_in_available` for +12 h, landed in 10–20 h local, dedupe key per business | `_queue_checkin_available_notif` | live |
| `points_ledger` · `trg_auto_checkin_on_award` | INSERT, delta>0 | staff-awarded purchase/visit/manual/bonus, no check-in in 12 h | records a check-in (runs `member_checkin` when streaks are on) | `_auto_checkin_on_award` | live |
| `points_ledger` · `trg_fire_automation` | INSERT | matches an `automation_rules` row (`rule_type` or `balance_above`) | enqueues SMS/email into `automation_queue` | `fire_automation_rules` | **dead end**: 2 rules exist, nothing drains `automation_queue`, no SMS provider |
| `points_ledger` · `trg_dispatch_outbound` | INSERT | business has `webhook_endpoints` | HTTP POST `points.awarded/redeemed` (HMAC) | `dispatch_outbound_webhooks` | live, 0 endpoints configured |
| `points_ledger` · `trg_points_ledger_fill_balance` | INSERT | — | fills `balance_after` | `points_ledger_fill_balance` | live |
| `bookings` · `trg_dispatch_booking` | INSERT/UPDATE | status change | webhook `booking.created/confirmed/completed/cancelled/no_show` | `dispatch_booking_webhooks` | live, 0 endpoints |
| `redemptions` · `trg_notif_review_request` | UPDATE → fulfilled | business has a Google review URL, no review yet, none asked in 14 d | `review_request` notification | `_notif_review_request` | live |
| `reviews` · `trg_notif_review_verified` | UPDATE → verified | — | `review` notification ("points added") | `_notif_review_verified` | live |
| `events` · `trg_referral_track_spend` | INSERT purchase | pending referral, spend ≥ min | `complete_referral()` credits referrer + referee (idempotent keys) | `referral_track_spend` | live |
| `notifications` · `trg_notif_gate` | BEFORE INSERT | per-business `business_notification_settings` toggles, feature on/off (streaks, spin, reviews), 90 s duplicate window | drops the row | `_notif_gate` | live — **this is the de-facto suppression layer** |
| `notifications` · `notifications_push_fanout` | AFTER INSERT | — | `pg_net` HTTP to `/api/notifications/push-fanout` | `http_request` | live but superseded (CP-37.12 notes it was flaky; the minute cron is the reliable path) |
| `customer_saved_offers` · `trg_mint_saved_offer_code` | BEFORE INSERT | — | 7-char redeem code | `_mint_saved_offer_code` | live |
| `businesses` · `trg_pin_layout_preset` | UPDATE | >30 min old | pins layout | `pin_layout_preset` | live (not an automation) |

## 3. Automated offers (the existing "automation" product)

Templates in `automated_offer_templates` (16): `welcome` (signup), `birthday`, `anniversary`, `comeback` (inactivity, 14 d), `custom_occasion` (date, per-business month/day), and 11 fixed-date holidays (New Year's, Valentine's, St Patrick's, Easter, Memorial Day, 4th of July, Labor Day, Halloween, Black Friday, Christmas, Summer kickoff). Per-business config in `business_automated_offers` (`is_active`, title/body/image/voice, `discount_type` none|reward|points_bonus (+legacy percent/flat), `gift_reward_id`, `expires_after_days`, `custom_trigger_config`).

| Trigger type | Engine | Grants | Notifies |
|---|---|---|---|
| signup | trigger `_fire_welcome_gifts_for_new_member` | per-member saved offer or points | `automated_offer` row; med spa shows it as the Home scratch card (CP-212) |
| birthday | pg_cron `process_birthday_offers` | per-member via `_grant_automated_offer` | `notifications` kind from caller |
| anniversary / inactivity | pg_cron `process_member_date_offers` | per-member via `_grant_automated_offer` | same |
| date (holidays, custom) | pg_cron `trigger_automated_offers` | **business-wide** featured `offers` row | `customer_offer` to every non-demo, non-blocked member, link `/app/offers` |

Admin UI: `components/agency/automated-offers-manager.tsx` (mounted in the agency builder Offers tab and the manager dashboard Offers → Automated). Med spa marketing tab (`components/manager/medspa-marketing.tsx`) lists them read-only and says tracking is "coming soon".

## 4. Notifications and channels

**Table `notifications`** (`user_id, business_id, kind, title, body, link_path, read_at, push_sent_at`). Kinds in use: `automated_offer, birthday, check_in_available, customer_offer, daily_check, generic, raffle_ended, raffle_won, raffle_winner_drawn, review, review_request, reward_expiration, reward_unlocked, streak, we_miss_you`, plus `shop`, `subscription_updated`, `invoice_paid/failed`, `checkout_completed` written from routes.

| Channel | Implementation | Status |
|---|---|---|
| In-app bell | insert into `notifications`; Realtime to `notification-center.tsx` | live |
| Web push (PWA) | `lib/notifications/push-server.ts` `sendPushToUsers` / `sendPushToBusiness` (web-push, VAPID); dead subs auto-deleted | live |
| Native push (iOS/Android shell) | `lib/notifications/fcm-server.ts` `sendFcm` (FCM HTTP v1, `platform` column on `push_subscriptions`) | live when `FIREBASE_SERVICE_ACCOUNT` set |
| Email | Resend REST (`lib/landing/notify.ts` `emailProspect`, `lib/waiver-mail.ts` `sendMail`, monthly report route). Used for: sales funnel, waiver copies, monthly reports. **No customer marketing email exists.** | partial |
| SMS | `widget_config.sms` flag and `automation_queue.channel='sms'` exist; **no provider, nothing sends** | not built |
| Manager one-off sends | Broadcast to all (`broadcast_notification` RPC + `/api/notifications/broadcast`), announcement banner (`set_business_announcement` + `/api/notifications/announce-message`), per-member win-back (`send_winback_v2` → `customer_messages` + `/api/notifications/push-now`) | live |
| Campaigns studio (`components/manager/campaigns-studio.tsx`) | UI shell only; every action is "coming soon" | unmounted logic |

**Suppression / timing already in place:** `business_notification_settings` (8 per-kind toggles) enforced by `_notif_gate`; 90 s duplicate window in `_notif_gate`; `_land_in_waking_hours` (10:00–20:00 local) for queued pushes; 9–20 h guards inside the hourly jobs; `business_timezone()`; 14-day cooldown on review requests; 3-day cooldown on check-in-available; demo members (`business_memberships.is_demo`) skipped in birthdays, holidays, inactivity; blocked members skipped. **Not present:** per-member frequency cap across kinds, email unsubscribe/consent fields, SMS consent, global quiet-hours setting (hours are hard-coded).

## 5. Engagement systems that produce events

| System | Writes | Entry point |
|---|---|---|
| Points | `points_ledger` (rule_types in use: `visit, purchase, first_visit_bonus, signup_bonus, profile_complete, review, social_follow, referral_referrer, referral_referee, birthday, milestone, mystery_bonus, winback_bonus, redemption, reversal, manual_removal`) | `award_points` RPC (staff-gated, idempotency_key), desk `award-points-panel.tsx`, `/api/notifications/award-event` for the push |
| Check-ins / streaks | `check_in_events`, `member_streaks`, `member_streak_gifts` | `member_checkin` RPC (12 h cooldown, period logic, milestone gifts), `claim_streak_gift`; `streak_config` per business |
| Redemptions | `redemptions` (pending → fulfilled/cancelled, expiry) | `redeem_reward`, `fulfill_redemption` |
| Saved offers / gifts | `customer_saved_offers` (code, revealed_at, fulfilled_at) | `save_offer`, `mark_welcome_gift_revealed`, `fulfill_saved_offer`, desk resolve |
| Spin / mystery | `mystery_reward_pool`, ledger `mystery_bonus` | `business_mystery_config` |
| Raffles | `raffles`, entries | `finalize_raffle` |
| Referrals | `referrals` (pending → signed_up → completed) | `complete_referral`, `referral_track_spend` on `events` |
| Social proof | `reviews` (google/instagram/facebook, pending → verified/rejected) | desk review queue |
| Purchases | `events` (event_type `purchase`, `amount_cents`) — written by the desk award flow; `medspa_shop_orders` (Stripe webhook → `paid`) | `/api/stripe/connect/webhook` |
| Bookings | `bookings` (pending/confirmed/completed/cancelled/no_show) | `create_booking`, desk Bookings tab; med spa flow CP-214 |
| Memberships (paid) | `business_memberships.membership_payment_status/paid_at/expires_at`, `membership_subscriptions` | `request_membership_v2`, Stripe webhook `upgrade_to_member` |
| Dormancy | `business_memberships.status = dormant` | `process_dormancy` |
| Med spa recall | `medspa_config.recall` (lead_days, followup_days, channel, templates) + `medspa_treatment_log` | **stored only, nothing sends** (builder says so) |
| Waivers | `waiver_signatures`, guardian invites (email) | `lib/waiver-mail.ts` |

## 6. Where the existing rule UIs live

| UI | File | Mounted? |
|---|---|---|
| Automated offers manager | `components/agency/automated-offers-manager.tsx` | yes (agency builder Offers tab; manager Offers → Automated) |
| Notification settings (8 toggles) | `components/agency/notification-settings-panel.tsx` | yes (agency builder Settings) |
| Streak config + milestones | `components/agency/streak-config-editor.tsx` | yes (agency builder) |
| Mystery pool | `components/agency/mystery-pool-manager.tsx` | yes |
| Automation rules (SMS/email on ledger) | `components/agency/automation-rules-editor.tsx` | **no** (unmounted since CP-37.12; trigger still fires into a queue nobody drains) |
| Webhook settings | `components/agency/webhook-settings.tsx` | **no** |
| Raffle manager | `components/agency/raffle-manager.tsx` | **no** (cron import only) |
| Campaigns studio | `components/manager/campaigns-studio.tsx` | yes, but all "coming soon" |
| Med spa marketing | `components/manager/medspa-marketing.tsx` | yes, read-only view of automated offers |
| Win-back send | `components/manager/insights-dashboard.tsx` (per-member button) | yes |

## 7. Consent and permission data

- `push_subscriptions` (`user_id, business_id, endpoint, p256dh, auth, platform, last_seen_at`), guarded by `_push_sub_guard`, cleaned on leave. Push consent = having a row.
- `profiles` (`email, phone, birthday`); birthday set-once trigger.
- `business_memberships.status` (`active | dormant | blocked`), `is_demo` (excluded by the hourly jobs).
- Per-business kind toggles: `business_notification_settings`.
- **Missing:** email marketing opt-in/unsubscribe, SMS consent (TCPA), per-member "pause messages", quiet-hours setting, global frequency cap. The hub must add these before any email/SMS node goes live.

## 8. Idempotency patterns already used

- `points_ledger.idempotency_key` (unique) — `birthday_<m>_<year>`, `welcome_points:<m>:<cfg>`, `ref_r_<id>`, `ref_e_<id>`, `award_points` caller keys.
- `business_automated_offers.last_triggered_at` 30-day guard; `offers.welcome_config_id` one master offer per config.
- `customer_saved_offers (membership_id, offer_id)` unique + "not since last visit" checks.
- `notification_queue.dedupe_key` + `fired_at`; `fire_due_notifications` `FOR UPDATE SKIP LOCKED`.
- `_notif_gate` 90 s same-kind window; 14 d review-request and 3 d check-in-available cooldowns.
- Route-level "stamp before send" (`emailed_at`, reminder columns on `landing_demo_requests`, `push_sent_at`).
- `finalize_raffle` row lock + status guard.

## (a) Customer events Atlas can detect today

| Event | Source | Support |
|---|---|---|
| `member.enrolled` | `business_memberships` INSERT | **now** (trigger exists) |
| `member.profile_completed` | ledger `profile_complete` | now |
| `checkin.recorded` | `check_in_events` INSERT | now |
| `points.earned` / `points.balance_reached` | `points_ledger` INSERT (delta>0, `balance_after`) | now (trigger `fire_automation_rules` already matches `balance_above`) |
| `purchase.recorded` + amount | `events.event_type='purchase'`, `medspa_shop_orders.paid` | now |
| `spend.threshold_reached` | sum of `events.amount_cents` | derivable |
| `reward.unlocked` | balance crosses `rewards.point_cost` | now |
| `reward.redeemed` / `reward.fulfilled` | `redemptions` INSERT / UPDATE | now |
| `gift.saved` / `gift.revealed` / `gift.fulfilled` / `gift.expiring` | `customer_saved_offers`, `notify_expiring_gifts` | now |
| `streak.milestone` | `member_checkin` returns `is_milestone`; `member_streak_gifts` INSERT | now |
| `streak.broken` / `streak.at_risk` | `member_streaks` vs period + `reset_grace_hours` | derivable (needs a daily evaluator) |
| `tier.changed` | `recalc_tier` updates `business_memberships.tier` | derivable (add trigger on tier change) |
| `inactivity.N_days` | `business_memberships.last_visit_at` | now for 14 d (comeback) and 60 d (dormant); any N derivable |
| `birthday` / `signup.anniversary` | `profiles.birthday`, `joined_at` | now |
| `booking.created/confirmed/completed/cancelled/no_show` | `bookings` trigger already names these | now |
| `booking.upcoming_in_24h` | `bookings.scheduled_at` | derivable (scheduler) |
| `treatment.logged` / `recall.due` | `medspa_treatment_log` + `recall_weeks` | derivable (data stored, no job) |
| `membership.requested/activated/renewed/expiring/cancelled` | `request_membership_v2`, Stripe webhook, `membership_expires_at` | now (activation), derivable (expiring) |
| `review.requested/verified/rejected`, `social.follow_verified` | `reviews` | now |
| `referral.completed` | `complete_referral` | now |
| `raffle.entered/won/ended` | raffles | now |
| `order.paid/fulfilled` (shop) | Stripe webhook, desk | now |
| `cart.abandoned`, `product.viewed`, `email.opened`, `push.opened` | — | **needs new tracking** (no cart or view events, no open tracking) |

## (b) Reusable actions already implemented

| Action | Entry point | Notes |
|---|---|---|
| In-app notification (+ push via cron) | insert `notifications` (gated by `_notif_gate`) | universal sink |
| Instant phone push | `sendPushToUsers(userIds, payload, businessId)` / `sendPushToBusiness` (`lib/notifications/push-server.ts`); `/api/notifications/push-now` | web + FCM |
| Delayed notification | insert `notification_queue` (fire_at, dedupe_key) → `fire_due_notifications` | only 2-min resolution; the natural "wait" primitive |
| Award points | `award_points(membership, delta, rule_type, ref, idempotency_key, notes)` RPC (staff-gated) or inline ledger insert pattern | idempotent |
| Grant a per-member offer/gift | `_grant_automated_offer(config, membership, kind, title, body, idem)` | needs an automated-offer config row |
| Publish a business-wide offer | insert `offers` (`is_featured`, `expires_at`) as `trigger_automated_offers` does; `upsert_offer` | |
| Win-back message + bonus | `send_winback_v2(business, membership, title, body, bonus_points, reward_id, expires_days)` → `customer_messages` | shows on Home banner |
| Announcement banner | `set_business_announcement` | business-wide |
| Email | `sendMail(to, subject, text)` (`lib/waiver-mail.ts`, Resend) | plain text only, no templates, no unsubscribe |
| Record check-in | `member_checkin` | |
| Outbound webhook | `webhook_endpoints` + the two dispatch triggers | |
| Tag / segment a customer | **does not exist** (only `status` and `tier`) | new table needed |
| Notify business admin | `admin_notifications` (agency) exists; manager-facing per-business admin alerts do not | partial |
