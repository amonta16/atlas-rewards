# CP-117 — Front-desk lookup P0 HOTFIX (check-in / QR scan broken)

**Symptom:** the front desk can't check anyone in. Typing a member code or
scanning a QR returns *"No member, redemption, or gift found with code
'…'"* for **every** code on **every** shop, and no member profile ever loads.

## Apply order (important)

1. **Run the SQL first — `cp117_frontdesk_lookup_fix.sql` in Supabase → SQL
   Editor.** This is the actual fix. It's transactional and safe to re-run.
2. **Then deploy the app** (the `manager-dashboard.tsx` change below). This is
   a safety net so a lookup failure can never hide silently again — but the
   desk starts working the moment the SQL is applied, even before you deploy.

## Root cause

CP-110 (security hardening) added a permission gate to
`resolve_member_by_code` — the function the desk calls to turn a scanned code
into a member. The gate went through the helper chain
`staffs_business()` → `is_agency_admin()` / `is_agency_va()`, and it **raises**
when the check fails. This project has a documented history of migrations not
fully applying on the live DB, so if any link in that helper chain is
stale or missing, the gate errors for **every** caller — not just non-staff.

The front-desk client made it invisible: it read only the `data` from that
RPC and **ignored the `error` field**, so any error at all collapsed into the
generic "not found" message. A broken lookup and a genuinely-missing code
looked identical.

## The fix (two layers, both non-destructive)

**SQL (`cp117_frontdesk_lookup_fix.sql`) — the real fix:**
- Re-asserts the helper chain (`is_agency_admin`, `is_agency_va`,
  `staffs_business`) to their correct definitions, repairing any drift. This
  also restores every *other* RPC that depends on them (redemptions, undo,
  billing, analytics).
- Rewrites `resolve_member_by_code` to be **self-contained**: it checks staff
  access inline against `business_users` (no helper-function dependency, so a
  missing helper can never make it error) and **returns no rows** for a
  non-staff caller instead of raising. Same PII protection as CP-110 — a
  non-staff caller still gets zero member rows — but a clean empty result the
  client handles gracefully.

**App (`components/manager/manager-dashboard.tsx`) — the safety net:**
- `resolveCodeInner()` now checks the `error` field on all three lookup RPCs
  (member / redemption / saved-gift). A real error now shows *"Couldn't look
  up that code — <message>"* instead of masquerading as "not found." If
  anything like this ever regresses, you'll see the actual reason at the desk
  instead of a silent dead end.

## Files
- `cp117_frontdesk_lookup_fix.sql` — apply in Supabase (the fix).
- `components/manager/manager-dashboard.tsx` — surface RPC errors (deploy).

## Verified
- SQL parses (pglast, 10 statements) and passed a scratch-Postgres test:
  a staff caller resolves the member; a non-staff caller gets an empty result
  with no error; and the pre-fix drift scenario was reproduced (old gate
  errored) and confirmed fixed.
- App: `tsc --noEmit` 0 errors, `next build` clean.

## If a code STILL says "not found" after applying the SQL
Then the issue is the code value, not permissions. Confirm the code exists for
that business:
```sql
select referral_code from public.business_memberships
 where business_id = '<this business id>' limit 20;
```
and compare to what the QR encodes.
