# CP-139 · Password reset links never worked

**One file: `app/[business]/reset-password/page.tsx`. No SQL.**

## The bug

Reported as "they got the email but the link didn't work." The email was never the problem — **every reset link in production has been failing**, and the page has been telling people their link expired.

The page assumed the Supabase browser client would pick the recovery token out of the URL by itself:

```ts
supabase.auth.getSession().then(({ data }) => {
  if (data.session) { … }
  else setTimeout(() => setChecking(false), 2000);   // → "This reset link has expired"
});
```

It doesn't. `createBrowserClient` from `@supabase/ssr` runs the **PKCE** flow, where the emailed link lands on the page carrying `?code=<auth code>` and that code must be handed to `exchangeCodeForSession()` explicitly. `exchangeCodeForSession` appears **nowhere** in this codebase — grep returns zero hits. So the code sat unread in the query string, no session was ever created, the two-second timer ran out, and the page blamed the link.

## The fix

Consume the token, whichever of the three shapes the project's email template produces — rather than guessing which one it is:

| URL shape | Handled with |
|---|---|
| `?code=…` | `exchangeCodeForSession` (PKCE — what we get today) |
| `?token_hash=…&type=recovery` | `verifyOtp` (if the template moves to `{{ .TokenHash }}`) |
| `#access_token=…&refresh_token=…` | `setSession` (legacy implicit) |

The token is stripped from the address bar once used, so it can't be replayed from shared history. Minimum password length also went from 6 to 8, and the inputs now carry `autocomplete="new-password"` so password managers offer to save it.

## The cross-device limit, and how to remove it

PKCE keeps its verifier in the browser that **requested** the reset. Request on a phone, open the mail on a laptop, and the exchange cannot succeed — that is the flow working as designed. The page now detects that specific failure and says *"open the link on the same device"* instead of *"expired"*, which is at least honest.

To remove the limit for good, change the recovery email template in **Authentication → Email Templates → Reset Password** to send a token hash instead of a confirmation URL:

```
{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery
```

The page already handles that shape, so the template can change whenever you like with no further code change. Token-hash links work in any browser on any device.

## Also worth checking

The redirect target is built as `window.location.origin + /<slug>/reset-password`, so on a business subdomain it resolves to `https://<slug>.atlas-engine.app/...`. That whole pattern has to be in **Authentication → URL Configuration → Redirect URLs** as a wildcard:

```
https://*.atlas-engine.app/**
```

If it isn't, Supabase drops the redirect and sends people to the Site URL instead — which looks like a second, unrelated "the link didn't work".

## Verified

Project-wide `tsc --noEmit`: 0 errors. The three URL shapes are handled in one code path with a single session check; not reproduced end-to-end against a live inbox — that wants a real reset on a real account after deploy.
