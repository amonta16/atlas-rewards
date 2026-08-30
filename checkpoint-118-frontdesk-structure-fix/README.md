# CP-118 — Front-desk lookup HOTFIX #2 (P0): "structure of query does not match function result type"

**Symptom:** typing a member code or scanning a QR at the front desk shows
*"Couldn't look up that code — structure of query does not match function
result type"* and no member profile ever loads. (Seeing that message at all
is CP-117's error-surfacing doing its job — before CP-117 this exact failure
was masked as a plain "not found".)

## Apply

**Run `cp118_frontdesk_structure_fix.sql` in Supabase → SQL Editor. That's
the whole fix — no app deploy needed.** The client code from CP-117 is
already correct; only the SQL function was broken. The desk starts working
the moment the SQL runs.

## Root cause (found and reproduced)

`profiles.email` is **CITEXT** (checkpoint-01 schema), but
`resolve_member_by_code` declares `email text` in its RETURNS TABLE.

- The original pre-CP-110 resolver was `LANGUAGE sql`, which applies the
  implicit citext→text coercion when the function is created — so it worked.
- CP-110 rewrote it as `LANGUAGE plpgsql` with `RETURN QUERY`, and plpgsql's
  row conversion requires the query's column types to match the declared
  types **exactly** — no implicit coercion. Every call has raised
  *"structure of query does not match function result type"* since then.
- CP-117 kept the plpgsql `RETURN QUERY` shape, so it inherited the bug.
  Its scratch-DB test used a plain `text` email column (no citext
  extension), which is why it passed there but not on live.

Reproduced in a scratch Postgres with citext:
`ERROR: structure of query does not match function result type —
DETAIL: Returned type citext does not match expected type text in column 4.`
— the exact error on the desk screen.

## v2 note (if you ran v1 and got error 42P13)

`CREATE OR REPLACE` can't change a function's return columns, and the live
`resolve_redemption_by_code` carries CP-44's `reward_image_url` column, so
v1 failed with *"cannot change return type of existing function"* and rolled
back (nothing was applied). v2 drops each resolver first and keeps the
CP-44 column, so the fulfillment screen still shows the reward photo. It
also notifies PostgREST to reload its schema cache so the recreated RPCs
work immediately.

## The fix

All three desk lookup RPCs (`resolve_member_by_code`,
`resolve_redemption_by_code`, `resolve_saved_offer_by_code`) are recreated
as `LANGUAGE sql` with an **explicit cast on every output column**, so the
query's structure matches the declared result type by construction — immune
to citext, enum, or any other column-type drift on the live DB. The
CP-110/CP-117 PII gate is kept, inline against `business_users` (no helper
dependency): a non-staff caller gets zero rows, never an error. The CP-117
helper-chain re-assertions are included unchanged (idempotent).

## Verified (scratch Postgres 
with the citext extension, live-like schema)

- CP-117's function reproduces the production error verbatim.
- After CP-118: staff caller resolves the member (name, email, points,
  tier, visit count all correct).
- Non-staff caller: zero rows, no error (PII protection intact).
- Redemption + saved-offer resolvers create cleanly and run without error.
- SQL is transactional and safe to re-run.

## Files
- `cp118_frontdesk_structure_fix.sql` — apply in Supabase (the fix).
