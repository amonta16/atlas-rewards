# CP-137 · Waiver signup gate, minors, and the guardian path

Flippos asked for the ROLLER waiver to happen inside the app instead of a separate flow with a pile of checkboxes. This makes a required waiver a real gate, teaches it about children, and gives a minor with their own account a way in that an adult cannot fake.

**Run `cp137_waiver_gate.sql` in the Supabase SQL editor before deploying.** It runs after CP-135, is idempotent, and needs no downtime.

## The bug this found

CP-135's `sign_waiver()` declares `v_camp record`, only ever `SELECT ... INTO`s it when a campaign slug is supplied, and then reads `v_camp.id` in the INSERT regardless. With no campaign, Postgres raises:

```
record "v_camp" is not assigned yet
```

That is exactly the required-at-signup path — the one Flippos is about to switch on. It has never fired in production only because no waiver version has been published yet (zero submissions at the time of writing). Section 7 of the migration replaces `sign_waiver()` with a thin wrapper over `sign_waiver_v2()`, so there is now one implementation and one place for this to be wrong.

## The gate

CP-135 put the required-waiver check in `CampaignResumer` — a client `useEffect` that redirected to `/app/waiver`, once per session. That is advisory: it runs after the page has rendered, and not following the redirect was enough to skip it.

It is now a server check. `app/[business]/app/layout.tsx` calls `my_waiver_gate()` and, when the answer isn't `ok`, renders the waiver **instead of** `CustomerAppShell` — no tabs, no header, no route to navigate to, whatever URL under `/app` was asked for. Signing calls `router.refresh()`, the layout re-runs, the gate opens.

Cost: one extra RPC per app page load. `my_waiver_gate` returns on the first index hit for businesses with no required waiver, which is all of them but Flippos.

The campaign path still works through the gate: in gate mode the screen recovers a remembered promo slug the same way `CampaignResumer` does and passes it to `sign_waiver_v2`, so a "sign the waiver, get 10% off" QR still pays out.

## Minors

`waiver_submissions` gains `minors jsonb`, `signer_dob` and `signer_relationship`. The signing screen has a **Just me / Me and my kids** toggle; each child is a name and a date of birth, up to twelve per signature. They appear on the printable record under "Minors covered".

The signer's date of birth is required and **a date under 18 is refused, in the UI and in the function**. A waiver signed by a child is worth nothing, so there is no way to talk the database into accepting one.

## The guardian path — why there is no "my parent signed" button

A button a minor taps to say a parent signed is worth nothing and an adult taps it just as easily. So the unlock never originates with the person being let in:

1. **The minor names a guardian.** `request_guardian_signature()` mints a token; `/api/waivers/guardian-invite` emails it — to the address stored on the row, never one from the request body. The minor's account state becomes `awaiting_guardian`.
2. **The guardian signs at `/g/<token>`.** A public page, outside the business subdomain rewrite (see `middleware.ts`), because it is opened by someone with no account. `guardian_sign_waiver()` is the one anon write here: single use, 14-day expiry, adult date of birth enforced, and it can only ever cover the one membership the token names.
3. **Or the front desk links them.** `link_minor_to_submission()` attaches an existing signed submission to a member's account — for the kid who turns up with no code and a parent who signed in person.

Coverage lives in `waiver_coverage`, keyed on the signed version, so publishing new waiver text re-locks the covered minor exactly as it re-locks the adult who signed it.

## Age line

`business_waivers.min_account_age` defaults to **13**. Under that, a child should be a name on a guardian's waiver rather than an account holder — COPPA's amended Rule (compliance date 22 Apr 2026) brings verifiable parental consent, retention limits and separate third-party-sharing consent, and California requires parental consent under 13 and opt-in for 13–16. Keeping under-13s off accounts keeps those obligations off the platform. The column is read by the gate and exposed to the signing screen; enforcing it at signup is the obvious next step.

## Emailed copy

On signing, the screen fires `/api/waivers/email-copy`, which sends the signer the document, the consent line they ticked, the minors named, the timestamp and the SHA-256 — through Resend, the CP-100 path. Best effort by design: the fetch is unawaited and a missing `RESEND_API_KEY` logs rather than throws, because a mail failure must never cost someone a signature they already gave.

## Files

`checkpoint-137-waiver-gate/cp137_waiver_gate.sql`, `app/[business]/app/layout.tsx`, `app/[business]/manage/waiver/[id]/page.tsx`, `app/g/[token]/page.tsx`, `app/api/waivers/{email-copy,guardian-invite}/route.ts`, `components/customer/{waiver-sign-client,guardian-sign-client,campaign-resumer}.tsx`, `lib/waiver-mail.ts`, `middleware.ts`.

## Verified

* Migration applied twice on a scratch Postgres 16 — clean, idempotent.
* Ten behavioural tests pass: gate states, a minor's date of birth refused, an adult signing for two children, coverage via the guardian link, an under-18 "guardian" refused, single-use token, a new version re-locking both the signer and the covered minor, and the staff-only link being staff-only.
* Project-wide `tsc --noEmit` against the repo's own toolchain: 0 errors.

## Not done

* The age line is stored and surfaced but not yet enforced at signup — nothing collects a date of birth when the account is created.
* No claim codes printed at the desk; the guardian email and the staff link cover the same ground for now.
* The desk UI for `link_minor_to_submission()` isn't built — the RPC is there, the button isn't.
