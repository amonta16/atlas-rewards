# Checkpoint 11 — Webhooks (inbound + outbound)

Atlas Rewards now talks to the outside world. External systems (GoHighLevel, Zapier, Make, your client's POS) can POST events in to award points automatically, and Atlas Rewards can POST events out to any URL when something happens.

## What got built

**Backend — `01_webhooks.sql`:**
- Enables `pg_net` for outbound HTTP from Postgres triggers
- Adds `webhook_secret` to `businesses` (per-business inbound signing secret)
- `webhook_deliveries` table — log of every webhook in or out (for debugging)
- `regenerate_webhook_secret(business_id)` — rotate the inbound secret
- `upsert_webhook_endpoint` / `delete_webhook_endpoint` — manage outbound URLs
- **Postgres trigger on `points_ledger`** — fires the moment a ledger entry is written, dispatches HMAC-signed POSTs to every active outbound endpoint subscribed to the event type
- `inbound_webhook_award(...)` — service-role-only RPC the API route calls after signature verification

**API Route — `app/api/webhooks/[slug]/route.ts`:**
- POST endpoint at `https://<your-domain>/api/webhooks/<business-slug>`
- Reads `X-Atlas-Signature` header, verifies HMAC-SHA256 against the business's secret
- Constant-time signature comparison
- Forwards to `inbound_webhook_award` SQL function

**Brand editor — Settings tab:**
- **Inbound** card: copyable URL, masked signing secret (Copy / Rotate buttons), example POST body in a collapsible details
- **Outbound** card: list of configured endpoints (URL + events + active toggle + delete), Add modal with URL + event chips ("Points awarded" / "Points redeemed" / "Everything")
- **Recent deliveries** card: last 20 inbound + outbound events with direction badge (IN/OUT), event type, target URL, timestamp, and status pill (success / error)

## How to install (2 min)

1. Supabase SQL Editor → run [`01_webhooks.sql`](01_webhooks.sql). Enables pg_net, adds the secret column, creates the dispatcher trigger.
2. Restart `npm run dev`.

## How to test

### Outbound (easier to start with)

1. Get a test webhook URL — `https://webhook.site` is the easiest: open the page, it gives you a unique URL like `https://webhook.site/abc-123-def`.
2. In the brand editor → **Settings** tab → **Outbound webhooks** → **+ Add** → paste that URL, leave events as "Everything" → Add webhook.
3. Go to the manager app → award yourself 100 points via Quick Award (Google Review).
4. **Switch to the webhook.site tab** — you should see a POST come in within ~1 second, with body:
   ```json
   {
     "event": "points.awarded",
     "rule_type": "review",
     "business_id": "...",
     "member_email": "...",
     "delta": 100,
     "balance_after": 250,
     "occurred_at": "..."
   }
   ```
   …and an `X-Atlas-Signature` header containing the HMAC.
5. Back in the brand editor → **Settings** tab → scroll to **Recent deliveries**. The outbound event is logged with status 200.

### Inbound (a bit more involved — needs HMAC signing)

For development, the easiest way is curl with a tiny signing script. Save this as `test-webhook.sh`:

```bash
#!/bin/bash
SECRET="<paste your business's webhook secret here>"
URL="http://localhost:3000/api/webhooks/demo"
BODY='{"event_type":"purchase","member":{"email":"andrewmontano619@gmail.com"},"amount_cents":4250,"idempotency_key":"test-1"}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)
curl -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "X-Atlas-Signature: $SIG" \
  --data-raw "$BODY"
```

Run it once. You should get back `{"success":true,"ledger_id":"...","points_awarded":42,"new_balance":...}` and the customer's points balance goes up by 42 (purchase_per_dollar × $42.50).

If you don't have a shell to run scripts, you can do this in **Postman** instead — set the URL, paste the body, generate the HMAC in the pre-request script.

### Production setup with GoHighLevel

For real usage with GoHighLevel:
1. GHL → Workflows → Create a new workflow with trigger "Contact Updated" or "Order Placed"
2. Add action **Webhook**
3. URL: your inbound webhook URL (e.g., `https://your-domain.com/api/webhooks/joes-gym`)
4. Method: POST
5. Headers: add `X-Atlas-Signature` with a value computed by an HMAC formula. (GHL's webhook action doesn't natively support HMAC signing — you'd use Make.com or n8n as a middle layer to sign the body, or accept reduced security by skipping HMAC verification for trusted internal traffic.)
6. Body: map GHL contact email to `member.email`, order amount to `amount_cents`, set `event_type: "purchase"`

For Zapier/Make, the same setup but they have built-in HMAC signing actions.

## What's NOT in CP 11

- **Retry queue** — failed outbound webhooks log the error but don't auto-retry. For production, we'd add a retry worker (CP 12 territory). For most cases, GHL/Zapier endpoints are reliable enough.
- **Inbound signature bypass option** — currently HMAC is mandatory. Some clients may want to disable for internal-only use. Easy toggle to add later.
- **Webhook filtering by member tag / segment** — outbound currently fires for every member. Filtering by tier or segment could be added.
- **GHL-specific contact sync (push direction)** — currently we just emit generic events. A "sync this member to GHL" action that hits GHL's specific contact API would be a CP 11.5 add-on.

## Approval gate

Once you've configured one outbound webhook (e.g., to webhook.site) and seen at least one event POST out successfully, CP 11 is done. Last checkpoint is **CP 12 — push/SMS/email + launch polish**, which adds the messaging providers and the final pre-launch checklist.
