# CP-141 · Front-desk PIN throttle: per-IP, with trusted devices

**SQL + one app file.** Run `cp141_frontdesk_throttle.sql`, then deploy. The SQL is idempotent and is written so the currently-deployed app keeps working in the gap between the two — see *Deploy order*.

## What was wrong

`verify_front_desk_pin()` throttled per **business**:

```sql
locked_until = case when fails + 1 >= 8
                    then now() + interval '5 minutes' else null end
```

`fails` only reset on a successful PIN, so once a shop crossed eight failures every later wrong PIN re-locked it for another five minutes.

**That is a denial-of-service anyone can run.** Business slugs are public — they are the subdomains. One `POST /api/frontdesk/login` with a wrong PIN every five minutes keeps a paying client's front desk permanently unable to sign in. No IP check, no alert, no record beyond a single counter. `front_desk_throttle` has never had a row in production, so it has never fired in anger — which is the only reason this hasn't bitten yet.

Secondary: a 4-digit PIN with one active PIN per business is 10,000 combinations. The old throttle allowed roughly one attempt per five minutes after lockout — about 17 days to hit it on average, unattended and silent.

## What it does

Locks the **source**, not the shop.

| | Behaviour |
|---|---|
| **Per-IP counting** | Failures count against `(business_id, ip)`. One attacker's failures never touch another device's budget. |
| **Trusted devices** | An IP that signs in successfully is trusted for 30 days. Trusted IPs skip the business-wide brake entirely — this is what kills the DoS. |
| **Distributed brake** | Untrusted IPs are still collectively limited: 40 failures in 15 minutes across all untrusted sources locks further untrusted attempts. Rotating IPs don't get a free run at a 4-digit PIN. |
| **Escalating backoff** | Per IP: 5 fails → 1 min, 8 → 5 min, 12 → 30 min, 20 → 4 hours. |
| **Alerting** | Ten failures from one IP writes one `admin_notifications` row to the agency owner. Fires on the transition only, so it can't spam. |

Storage changes on `front_desk_throttle`: adds `ip text not null default ''` and `trusted_at timestamptz`, repoints the primary key to `(business_id, ip)`, and adds `front_desk_throttle_recent_idx (business_id, updated_at desc)` for the 15-minute window scan. The table was empty in production, so the key change moves no data.

## Deploy order

The old two-argument signature is dropped and replaced with a three-argument version whose `p_ip` defaults to `NULL`. Once the two-arg version is gone, a two-arg call resolves unambiguously to the new function — so **the deployed app keeps working** between running the SQL and shipping the route.

During that window every caller buckets into a shared `'unknown'` IP, which behaves exactly like the old per-business throttle: no regression, no improvement. Ship the app change promptly.

`CREATE OR REPLACE` cannot add a parameter, so this is a genuine `DROP` + `CREATE`. That resets the ACL, so the file restates the CP-138 lockdown (`revoke from public, anon, authenticated` / `grant to service_role`). Verify the grants after applying — `verify_front_desk_pin` must not be `anon`-callable.

## App change

`app/api/frontdesk/login/route.ts` — reads the client IP and passes it as `p_ip`:

```ts
const ip =
  (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
  req.ip ||
  null;
```

Only the **first** entry of `x-forwarded-for` is the client on Vercel; later entries are proxy hops and are attacker-writable. Reading the whole header would let someone forge a fresh identity per request and skip the per-IP budget entirely.

## Known limits

* **A spoofed `x-forwarded-for` first entry.** Vercel overwrites the leading entry at the edge, so this is trustworthy *behind Vercel*. If the app is ever fronted by something else, revisit.
* **Shared NAT.** Every device behind one shop router shares an IP, so they share a budget. Fine here — a front desk is one or two devices, and the trusted-device path means the shop's own address is exempt from the collective brake anyway.
* **Dynamic IPs.** If the shop's address changes it loses trusted status and has to earn it back with one successful PIN. In practice the desk holds a persistent session and rarely re-enters a PIN at all.
* **The real fix is entropy.** 10,000 combinations is small. Six-digit PINs would take brute force off the table; that's a product decision and a separate checkpoint.

## Still open

* No inactivity timeout on the front desk. A tablet stays signed in indefinitely — if it's stolen, or a staffer leaves without the PIN being rotated, access continues. Needs a session-age check on the manager layout. Not addressed here.
* `set_front_desk_pin` is still `anon`-callable per its ACL. It has its own internal guard, but it's inconsistent with the CP-138 posture and worth a look.
* No rate limit on `/api/frontdesk/login` itself above the RPC — the database is doing all the work. An edge-level limit would shed load before it reaches Postgres.

## Verified

`tsc --noEmit` = 0 errors.

Applied to production 2026-09-18 as tracked migration `frontdesk_pin_throttle_per_ip`. After applying:

* Only one signature exists — `verify_front_desk_pin(uuid,text,text)`. The old 2-arg version is gone, so there is no unguarded overload left behind.
* Grants are `postgres` + `service_role` only. Not `anon`-callable, matching CP-138.
* `SECURITY DEFINER` and `search_path=public, extensions` intact.
* Primary key is `PRIMARY KEY (business_id, ip)`.

Functional test against a live business using TEST-NET addresses: five wrong PINs from `203.0.113.5` locked **that IP** (`fails=5, locked`), while a single attempt from `198.51.100.9` was unaffected (`fails=1, not locked`). Under the old per-business throttle both would have shared one counter and the second source would have inherited the first's lockout. Test rows deleted afterwards; the table is back to zero rows.
