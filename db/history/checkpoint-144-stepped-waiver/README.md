# CP-144 — the waiver asks one thing at a time

**Status:** SQL applied to production · code built clean · ready to push

## The problem

Both waiver screens put everything on one page: the document, the name, the
date of birth, the who-does-this-cover toggle, the children rows, the signature
pad and the consent box. Every field was visible before any of them mattered,
and the Sign button sat greyed out with no explanation of which of seven inputs
was missing. The kiosk version had grown an amber "still needed" box listing
every unmet requirement — which was the form admitting it asked too much at
once to be read in order.

ROLLER's flow is the model: ask one thing, confirm, ask the next.

## The flow

    email  →  your details  →  who does this cover?  →  the document + signature

The steps are **computed, not hard-coded**. A business with minors turned off
gets a three-step flow and a three-segment progress bar, so the bar never lies
about how much is left.

Every step gates its own one or two fields, and when Continue is off, the
reason is printed underneath it — named, singular, and always about something
visible on screen. That replaces both the silent greyed-out button in the app
and the amber checklist on the kiosk.

## Why the email step exists

`sign_waiver_v2` never took an email. It read `profiles.email` off the session
and stored that, so the signed copy always went to the **account** address —
which is frequently a parent's login, or whatever got typed at a counter two
years ago. Every existing row has an address; it just isn't necessarily the one
the signer would have picked.

So CP-144 adds a trailing `p_signer_email` parameter. The app pre-fills it from
the account (one tap for the common case) and lets them correct it. Blank or
malformed falls back to the profile exactly as before, so an older client that
doesn't send the parameter behaves identically — this migration cannot regress
a submission that already works.

On the kiosk nobody is logged in, so there is no address to fall back to. The
step is asked plainly, with an "I don't have one" escape — a tablet at a
counter cannot hold up the queue over an email address.

## Files

| File | What changed |
|---|---|
| `cp144_signer_email.sql` | `sign_waiver_v2` dropped + recreated with `p_signer_email text default null`; form address wins, profile is the fallback, bad shapes fall back rather than store |
| `components/customer/waiver-sign-client.tsx` | stepped flow; sends `p_signer_email`; Back button for a minor signer; `h-13` → `h-14` |
| `components/customer/kiosk-waiver-client.tsx` | same stepped flow, tablet-sized; "still needed" checklist replaced by per-step reasons; minor-count snapshot so the confirmation survives the reset |

## Two things worth knowing

**Drop-and-recreate, not CREATE OR REPLACE.** Adding a trailing DEFAULT
argument leaves the old 12-arg signature in place, and PostgREST then sees two
candidates and refuses the call outright ("could not choose the best candidate
function"). CP-140 learned this on `upsert_mystery_prize`. A fresh CREATE also
gets the default `PUBLIC` EXECUTE grant that `anon` inherits, so the CP-138
revoke is repeated at the bottom of the migration. Verified after applying:
one function, 13 args, `anon` false, `authenticated` true.

**`h-13` is not a Tailwind class.** Three CTAs in the app flow used it and
nothing in `tailwind.config.ts` defines it, so the tall tap target silently
fell back to the Button default. Now `h-14`.

## A correction to the record

I told Andrew earlier that "every submission stores a null email". That was
wrong — `select count(signer_email)` returns every row. The function was
populating it from the profile all along. The email step is still worth having
for the reason above, but it is not fixing null data.

## Still open

- A minor covered by a guardian signature gets no green check anywhere.
- Signature payloads average 30 KB (DPR-scaled PNG). Capping DPR at 2, encoding
  JPEG and trimming to the ink bounding box gets that to 3–5 KB. Parked at
  Andrew's call.
- Checkpoint numbers 140/141/142 collide with Bobby's. 143 and 144 are clean.
