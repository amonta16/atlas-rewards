# CP-142 · Make the agency sign-in link actually sign you in

**App only. No SQL.** Three files: a new route handler, the agency login's link target, and one middleware bail-out.

## The bug

The agency login's "Send me a sign-in link" button has never worked. Not for anyone, since CP-37.2 shipped it in June.

`app/(agency)/login/page.tsx` pointed the magic link straight at the destination:

```ts
emailRedirectTo: `${window.location.origin}${dest}`   // dest = "/agency"
```

`/agency` is a server-rendered layout that gates before any browser code runs:

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) redirect("/login");
```

So: click the email → Supabase bounces to `/agency?code=…` → the **server** looks for a session cookie → there isn't one, because nothing has exchanged the token yet → `redirect("/login")`, which **drops the token from the URL**. No client code ever runs on `/agency`. The token is burned, the user lands back on the login page, and the page says nothing about why.

CP-139 hit the same wall on `/<slug>/reset-password` and solved it by consuming the token in a client component. That works there only because that page is not behind a server gate. Anything gated needs the exchange to happen *before* the render.

Nobody reported it because all eight agency accounts signed in with passwords they already knew. The rescue path was never exercised until someone needed it.

## The fix

New route handler at `app/auth/confirm/route.ts` — the one place an emailed auth link is allowed to land. It exchanges the token server-side, writes the session cookies through the cookie-bound client, then forwards to the real destination, which now passes its own gate.

Handles both shapes Supabase might send, because which one arrives depends on the project's email template:

| Link shape | Handling |
|---|---|
| `?token_hash=…&type=…` | `verifyOtp` — the `{{ .TokenHash }}` template |
| `?code=…` | `exchangeCodeForSession` — PKCE, the current default |

The legacy `#access_token=` fragment is deliberately **not** handled: a fragment never reaches the server. If the templates are ever switched back to it, that link needs a client page instead — noted here so the omission doesn't read as an oversight later.

`?next=` runs through `safeRedirect`, so only same-origin absolute paths survive. An open redirect on this route would be an account-takeover vector, because the URL carries a live credential.

## Middleware

`/auth/*` is added to the root-page bail-outs. A mail client can open the link on the apex **or** on a business subdomain, and without this the rewrite turns `/auth/confirm` into `/<slug>/auth/confirm` → 404, burning a one-time token. Same class of bug as the CP-42 service-worker rewrite and the CP-96.1 `/legal` rewrite.

## Failure messages

The route sends people back to `/login` with a reason instead of silently dumping them there, and the login page now says it in plain words:

* `link-expired` — expired or already used.
* `wrong-browser` — PKCE keeps the code verifier in the browser that *requested* the link. Ask on a laptop, open on a phone, and the exchange cannot succeed. This is the flow working as designed; nobody guesses it without being told. Same limitation CP-139 documents.
* `missing-token` — the link arrived with nothing to exchange.

## Deliberately not touched

`/<slug>/forgot-password` and `/<slug>/reset-password` keep their CP-139 client-side handling. That path works, it is well covered, and rerouting it through here would risk a working flow to gain nothing. If the agency path proves out, consolidating later is a reasonable follow-up.

## Still open

* The root cause is structural: an emailed link may land on any gated page, and only this one route knows how to consume a token. A second gated destination would reintroduce the bug. Worth a convention — **all** `emailRedirectTo` values go through `/auth/confirm`.
* Moving the Supabase email templates to `{{ .TokenHash }}` would retire the `wrong-browser` failure mode entirely, since `verifyOtp` needs no browser-held verifier. That is a dashboard change, not code. See the CP-139 README.

## Verified

`tsc --noEmit` = 0 errors.

Not end-to-end tested with a real email — that needs inbox access. Post-deploy smoke test: `GET /auth/confirm` with no token must redirect to `/login?next=%2Fagency&error=missing-token`.
