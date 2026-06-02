# Supabase Database Webhook — auto-trigger push delivery

This is the **one missing piece** that wires every auto-trigger notification (reward unlocked, streak break, daily check-in, review request, birthday bonus, etc.) into real phone pushes. The Vercel cron we shipped picks them up within 60s, but a Supabase Database Webhook fires within milliseconds and matches the latency of "Send to all members" exactly.

## What you're doing

You're telling Supabase: "Every time a row is inserted into the `notifications` table, POST it to `https://app.atlas-engine.app/api/notifications/push-fanout`." Our route then calls `sendPushToUsers` — the exact same function that ALREADY works for the broadcast and test buttons.

## How to set it up (one-time, 90 seconds)

1. Open Supabase Dashboard → your project → **Database** (left sidebar) → **Webhooks**.
2. Click **Create a new hook**.
3. **Name**: `notifications_push_fanout`
4. **Table**: `notifications`
5. **Events**: check **Insert** only (leave Update / Delete off).
6. **Type**: `HTTP Request`
7. **HTTP Method**: `POST`
8. **URL**: `https://app.atlas-engine.app/api/notifications/push-fanout`
9. **HTTP Headers**: leave default (Supabase sends `Content-Type: application/json` automatically).
10. **HTTP Params**: leave empty.
11. Click **Create webhook**.

That's it. Every notification row inserted by a trigger (or by the broadcast / test endpoints) now fires the webhook → our route → web-push → phone.

## How to verify

1. Make sure VAPID env vars are set in Vercel (run the diagnostics panel — if VAPID isn't green, push can't fire regardless of webhook).
2. Have a customer who's enrolled + granted push permission.
3. Trigger a real event — easiest: award them enough points to cross a reward threshold via the front-desk panel.
4. Their phone should ring within ~2 seconds.

If you don't see a push, run **Process pending pushes now** in the diagnostics panel — it'll tell you whether the cron path can deliver. If it can, the webhook is the only missing link.

## Why this beats the previous approaches

- **pg_net** (CP-42 universal trigger): unreliable, depends on the `atlas.base_url` Postgres setting + the extension being installed correctly. We disabled it in CP-37.12 because it was silently failing in production.
- **Vercel cron** (CP-37.12): reliable but up to 60s delay. Still on as a backstop in case the webhook misses.
- **Supabase Database Webhook** (this): instant, managed by Supabase, retries automatically on failure.

You can leave the cron running as a safety net — it processes any notification the webhook missed (e.g., transient HTTP failure). The webhook handles the happy path with no perceptible delay.

## Payload format

Supabase webhooks send:

```json
{
  "type": "INSERT",
  "table": "notifications",
  "schema": "public",
  "record": { "id": "...", "user_id": "...", "business_id": "...", ... },
  "old_record": null
}
```

Our `/api/notifications/push-fanout` route handles both this shape AND the legacy `{ notification_id: "uuid" }` shape — no transformation required on the webhook side.
