# CP-130 · Front desk: phone-number lookup + big-removal guardrail

The first step of the Sept 2026 plan (see the *Atlas Niche Layouts* spec). Two small things that answer what happened at Exotic on Sep 5, and the "backup code" question.

**Apply `cp130_desk_phone_lookup.sql` in the Supabase SQL editor first, then push.**

## 1 · Phone number is the backup identity

The desk's **"Type code"** button is now **"Phone number"**. The box takes a 10-digit number in any formatting — `8055550123`, `(805) 555-0123`, `+1 805 555 0123` — *or* the old 6-char member / 7-char redemption codes. Anything with 7+ digits and no letters is treated as a phone.

- New RPC `resolve_member_by_phone(p_phone, p_business_id)` — same row shape and same permission gate as `resolve_member_by_code`, so a phone hit opens the award panel exactly like a scan.
- Exact match on the normalized last 10 digits (`normalize_phone`, CP-59). If staff type only 7 digits, it matches on the last 7 **only when that's unique inside the shop** — an ambiguous hit returns nothing instead of the wrong member. Other shops' members are never visible.
- Expression index on `normalize_phone(phone)` so the lookup stays instant.
- Number pad comes up on tablets (`inputMode="tel"`); clear error copy when there's no match ("No member with the number (805) 555-0123 at this shop…").
- Customer Check-in screen now says *"or just tell them your phone number"* under the QR.

Scratch-tested on Postgres 16 with citext: formatted numbers, leading 1, ambiguous 7-digit, cross-tenant, too-short, unauthorized caller, and re-running the migration.

## 2 · Guardrail on big removals

Removing **more than 500 points** now requires a written reason and a second, louder tap:

1. Staff type the amount → the reason box turns required with an amber note.
2. "Review removal of 1,838 points" → a confirm card: *Remove 1,838 points from Brayan? Their balance drops to 0. This is logged with your name and reason.*
3. "Yes, remove 1,838 points" (ring-highlighted, different button) or Cancel.

Changing the amount or the reason disarms the confirm, so a double-tap can't fire it. Removals of 500 or less are unchanged — one tap, reason optional. Constant `LARGE_REMOVAL` in `award-points-panel.tsx`.

Why 500: every one of the 18 Sep-5 removals except two was above it; a legitimate correction (a mis-keyed $20 sale at 10 pts/$) is far below it.

## Files

- `components/manager/manager-dashboard.tsx` — `isPhoneLike()`, `formatPhone()`, phone branch in `resolveCodeInner`, entry box + hint copy
- `components/manager/award-points-panel.tsx` — `LARGE_REMOVAL`, `removeArmed`, confirm UI
- `components/customer/scan-client.tsx` — copy only
- `checkpoint-130-desk-phone-guardrails/cp130_desk_phone_lookup.sql`

Full-project `tsc --noEmit` on a cloud mirror of HEAD + these files: **0 errors**.

## Not in this checkpoint (deliberately)

A manager-only "reset program" action was in the build order. Holding it: a mass reset needs its own ledger `rule_type` and every CP-127 analytics RPC would have to learn to exclude it (otherwise a reset shows up as a redemption spike). Worth doing properly alongside the layout presets, not as a footnote here.

## Push

```
git fetch origin
git reset --mixed origin/main
git add -A
git commit -m "CP-130: front desk phone-number lookup (resolve_member_by_phone) + reason/confirm guardrail on removals over 500 pts"
git push origin main
```
