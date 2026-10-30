# CP-116 — Launch-eve fixes (notifications, manager balance, join screen)

App-code only, **no SQL migration to apply**. Deploy and go.

## 1. Notifications — streak / check-in reminders now actually fire
**Root cause:** the reminder *queue* (`notification_queue` — the 12h "check in again / keep your streak going / spin's ready" nudge) is drained by `fire_due_notifications()`, and **nothing was calling it**. No cron, no route, no live pg_cron. So every queued reminder sat in the queue forever — which is exactly why you never got streak/check-in notifications.
**Fix:** the per-minute `process-pending` cron now drains the queue before pushing (`app/api/notifications/process-pending/route.ts`). Queued reminders now go out within a minute of coming due. One line, no DB change.

**What already worked (unchanged):** immediate notifications — points awarded, reward unlocked, manager announcements / "send to all", raffle wins — insert straight into `notifications` and were already pushed by that same cron.

**⚠️ MUST VERIFY IN PROD BEFORE LAUNCH (I can't check this from here):** notifications only fire if these are set in the **Vercel** project env:
- `CRON_SECRET` — if unset, `process-pending` returns 503 and **nothing pushes at all**. Vercel Cron must send it as `Authorization: Bearer $CRON_SECRET`.
- `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` — required for web push (and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`).
- `FIREBASE_SERVICE_ACCOUNT` — required for native iOS/Android push (web push works without it).

Please confirm those exist in Vercel → Settings → Environment Variables. That's the single most important thing for notifications to work tomorrow.

**Not built (net-new, flagged, not shipped tonight):** a true "your streak is about to EXPIRE" alert has no producer anywhere — it was never built. The reminder above ("check in again") is the closest existing nudge and is now fixed. If you want a real streak-expiration warning, that's a small follow-up build (a producer + schedule), not a one-liner — say the word and I'll do it.

## 2. Manager — live balance no longer shows stale after an award
`components/manager/award-points-panel.tsx` refreshed the on-screen balance from a table named `memberships` — which doesn't exist (it's `business_memberships`). The query errored silently, so after awarding/removing points the big balance number kept showing the pre-award snapshot until the member was re-scanned. Fixed the table name. (The DB was always correct — only the displayed number was stale.)

**Raffles + the rest of the manager desk: audited, no errors.** Every raffle action (create / cancel+refund / redraw / archive / duplicate / set-claim / participants) maps to a real, manager-gated RPC. Award/remove/redeem/undo/scan/search/announcement/membership RPCs all exist and gate correctly. This was the only broken thing found.

## 3. Join screen — logo crop + back button
- Business logos on the shop chooser and the "found it" confirmation card used `object-cover`, which crops non-square logos. Now `object-contain` on a white bed — the whole logo shows.
- Tapping **"Join a new shop instead"** used to strand a customer on the code screen with no way back. Added a **"Back to my shops"** button that returns them to their shop chooser.

## Files
- `app/api/notifications/process-pending/route.ts` — drain the reminder queue.
- `components/manager/award-points-panel.tsx` — correct table name for live balance.
- `app/join/page.tsx` — logo `object-contain` (chooser + confirm card) + Back button.

## Verified
`tsc --noEmit` 0 errors, `next build` clean.

## Optional (belt-and-braces, not required)
The queue drain is now handled in app code. If you'd rather have a DB-side backstop too, you can run this once in Supabase (independent of Vercel):
```sql
select cron.schedule('atlas-fire-due-notifs', '* * * * *', $$ select public.fire_due_notifications(); $$);
```
Not needed if the app fix is deployed — pick one.
