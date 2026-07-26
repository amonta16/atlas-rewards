# CP-83 — Custom SMTP (kill the 2-emails-per-hour cap)

**Type:** dashboard + DNS configuration. **No code changes, no SQL.**
**Time:** ~20 minutes, plus DNS propagation (usually minutes, up to 24h).
**Priority:** blocking for launch. Do it before the next client staff account is created.

---

## Why this exists

**July 25, 2026 — incident.** An agency admin could not sign in. Supabase Auth returned
`Request rate limit reached`, which the login page prints verbatim. Nothing was wrong with
his account or his password.

Root cause: the project is still on **Supabase's built-in email sender**, which allows
**2 emails per hour for the entire project**. The agency login has a "Send me a sign-in link
instead" button with no cooldown. Two taps — by anyone, on any account — and every further
magic link, invite, and password reset across the whole platform fails for the rest of the hour.

That cap is survivable in dev. It is fatal the moment real client staff start signing up:
one busy afternoon of onboarding and every password reset in the system silently dies.

---

## What changes

| Email path | Built-in sender (today) | Custom SMTP (after this) |
|---|---|---|
| Total email sends | **2 / hour, project-wide** | your Resend limit (100/day free, 50k/mo on Pro) |
| Deliverability | frequently spam-foldered | authenticated (SPF + DKIM), lands in inbox |
| From address | Supabase's | `no-reply@atlasrewards.app`, name "Atlas Rewards" |
| Bounce visibility | none | full log in the Resend dashboard |

Per-user limits do **not** change and do not need to: one magic link per 60s per user,
one password reset per 60s per user. Those are correct and should stay.

---

## Part 1 — Resend account + domain (15 min)

1. Sign up at **resend.com**. Free tier: 3,000 emails/month, **100/day**, 1 domain.
   That covers early clients. Pro is $20/mo for 50,000/month with no daily cap — move
   to it before onboarding a client with a large customer list.

2. **Domains → Add Domain.** Enter a **subdomain**, not the root:

   ```
   mail.atlasrewards.app
   ```

   Resend recommends this, and it matters here: sending auth mail from a subdomain isolates
   its reputation from anything you ever send from the root domain (GHL campaigns, your own
   Google Workspace mail). If transactional auth mail and marketing mail share a reputation,
   a bad campaign takes password resets down with it.

3. Resend shows a **Records** tab with the DNS records to add. There will be three kinds:

   - **MX** record — receives bounce/complaint feedback
   - **TXT** (SPF) — authorizes Resend's IPs to send as you
   - **TXT** (DKIM) — cryptographic signature; this is the long `p=MIGf...` value

   Add every one of them at your DNS host (wherever `atlasrewards.app` is registered —
   Cloudflare, Namecheap, GoDaddy). Copy-paste the values exactly; a single truncated
   DKIM key is the #1 cause of failed verification.

   > If your host auto-appends the domain to record names, enter `mail` rather than
   > `mail.atlasrewards.app`, or you will end up with `mail.atlasrewards.app.atlasrewards.app`.

4. Click **Verify** in Resend. Usually green within minutes. Do not continue until it is.

5. **API Keys → Create API Key.** Permission: **Sending access**. Copy the key — it is
   shown once. This is the SMTP password in the next part.

---

## Part 2 — Supabase SMTP settings (3 min)

Go to `https://supabase.com/dashboard/project/_/auth/smtp` (Authentication → Emails →
SMTP Settings). Toggle **Enable Custom SMTP** on and fill in:

| Field | Value |
|---|---|
| Sender email | `no-reply@mail.atlasrewards.app` |
| Sender name | `Atlas Rewards` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key (the `re_...` string) |
| Minimum interval between emails | `60` seconds |

Port notes: **465** is implicit TLS and is the right default. If your host blocks it,
`587` and `2587` are STARTTLS alternatives; `2465` is an alternate implicit-TLS port.
Do not use `25`.

The sender email domain **must** be the domain you verified in Part 1. Sending as
`no-reply@atlasrewards.app` while only `mail.atlasrewards.app` is verified will fail.

Save.

---

## Part 3 — Raise the rate limits (DO NOT SKIP)

**This is the step that gets missed and it will look like the fix didn't work.**

When you enable custom SMTP, Supabase imposes a fresh low limit of **30 messages per hour**
to protect your new sending reputation. Better than 2, still not enough for onboarding day.

Go to `https://supabase.com/dashboard/project/_/auth/rate-limits` and set:

| Limit | Set to | Reasoning |
|---|---|---|
| Rate limit for sending emails | **150 / hour** | above Resend's 100/day free cap, so Resend is the real ceiling, not Supabase |
| Rate limit for sending OTPs / magic links | **150 / hour** | same |
| Minimum interval between magic link / OTP per user | **60 s** | leave as is — this is the correct anti-abuse guard |
| Rate limit for token refresh | leave default (1800/hr per IP) | not involved in this failure |
| Rate limit for verification | leave default (360/hr per IP) | this is what retry-spam hits; see Troubleshooting |

If you upgrade Resend to Pro, revisit the two email limits and raise them to match.

---

## Part 4 — Email templates in the Atlas voice (5 min)

`https://supabase.com/dashboard/project/_/auth/templates`. The defaults say "Supabase" and
look like a phishing test. Rewrite these four. Variables available:
`{{ .ConfirmationURL }}`, `{{ .SiteURL }}`, `{{ .Email }}`, `{{ .Token }}`.

**Magic Link** — subject: `Your Atlas sign-in link`

```html
<h2>Sign in to Atlas Rewards</h2>
<p>Tap the button below to sign in. This link works once and expires in 60 minutes.</p>
<p><a href="{{ .ConfirmationURL }}"
   style="display:inline-block;background:#0284c7;color:#fff;padding:12px 22px;
          border-radius:10px;font-weight:600;text-decoration:none">Sign me in</a></p>
<p style="color:#71717a;font-size:12px">If you didn't request this, you can ignore this email.</p>
```

**Reset Password** — subject: `Reset your Atlas password`

```html
<h2>Reset your password</h2>
<p>Tap below to choose a new password for {{ .Email }}. The link expires in 60 minutes.</p>
<p><a href="{{ .ConfirmationURL }}"
   style="display:inline-block;background:#0284c7;color:#fff;padding:12px 22px;
          border-radius:10px;font-weight:600;text-decoration:none">Choose a new password</a></p>
<p style="color:#71717a;font-size:12px">Didn't ask for this? Nothing has changed — ignore this email.</p>
```

**Confirm Signup** — subject: `Confirm your email`

```html
<h2>Welcome to Atlas Rewards</h2>
<p>Confirm this email address to activate your account.</p>
<p><a href="{{ .ConfirmationURL }}"
   style="display:inline-block;background:#0284c7;color:#fff;padding:12px 22px;
          border-radius:10px;font-weight:600;text-decoration:none">Confirm my email</a></p>
```

**Invite User** — subject: `You've been invited to Atlas Rewards`

```html
<h2>You've been invited</h2>
<p>Your team has set up an Atlas Rewards account for you. Tap below to set a password
   and get in.</p>
<p><a href="{{ .ConfirmationURL }}"
   style="display:inline-block;background:#0284c7;color:#fff;padding:12px 22px;
          border-radius:10px;font-weight:600;text-decoration:none">Accept invitation</a></p>
```

The CP-47 reset pages and the CP-41 invite-signup flow already handle the app side of
these links — no code change needed.

---

## Part 5 — Verify

Run all four. Do them in one sitting; if the first three work and the fourth fails, you
hit a limit, not a config problem.

1. `/forgot-password` on a **Gmail** address → email arrives **in the inbox, not spam**,
   sender reads "Atlas Rewards", link opens the reset page and the new password works.
2. Agency `/login` → "Send me a sign-in link instead" → link arrives, signs you straight in.
3. Invite a throwaway teammate from the agency **Team** page → invite email arrives.
4. Resend dashboard → **Emails** → all three show `Delivered`, none `Bounced`.

Then, the check that proves the actual bug is dead: **send five magic links in a row to
five different addresses.** On the old setup, #3 fails. All five should now deliver.

---

## Part 6 — Unblock a locked-out admin (any time this recurs)

`Request rate limit reached` at the login screen, and you need someone in *now*:

1. Supabase → **Authentication → Users** → find their email → ⋯ → **Reset password**,
   set one directly. This goes through the admin API and bypasses email limits entirely.
2. Send them the password out of band. Have them use **email + password**, not the
   magic-link button.
3. Still blocked? The per-IP verification limit (360/hr) is tripped from retry spam —
   have them switch to cell data or wait out the hour. Limits are per IP.
4. While you're on their user row, confirm **Email Confirmed** is set. An unconfirmed
   invited user fails password login with a misleading "invalid credentials" message.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Resend won't verify the domain | DKIM value truncated, or record name double-suffixed | re-paste the full `p=` value; check for `mail.atlasrewards.app.atlasrewards.app` |
| Supabase saves SMTP but no email arrives | sender domain not the verified one | sender must be `@mail.atlasrewards.app` |
| Emails stop after ~30 | Part 3 skipped | raise the limits at `/auth/rate-limits` |
| Emails stop after 100 in a day | Resend free daily cap | upgrade to Pro ($20/mo) |
| `Request rate limit reached` still appears | per-IP verification limit from retry spam | not an email issue — see Part 6, step 3 |
| Mail lands in spam | SPF/DKIM partially configured, or sending from root domain | verify all records green in Resend |
| `over_email_send_rate_limit` in logs | Supabase-side email cap | Part 3 |

---

## Still open after this

Two things this checkpoint deliberately does not touch — worth queuing:

- **60-second cooldown on the magic-link button** on all three login surfaces
  (`app/(agency)/login`, `app/[business]/login`, manager). Right now nothing stops a
  frustrated user from tapping it ten times and burning the project's budget.
- **Friendly copy for rate-limit errors.** `app/(agency)/login/page.tsx` line 63 falls
  through to `setErr(error.message)`, which is how "Request rate limit reached" reached
  a human being's screen. It should say "Too many attempts — wait a minute and try again,
  or ask your admin to reset your password."

---

## Ship it

```bash
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
git add checkpoint-83-custom-smtp
git commit -m "CP-83: custom SMTP runbook (Resend + Supabase) — fixes 2/hr email cap lockout"
git push
```
