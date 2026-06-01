# CP-37.3 — Third hotfix bundle

Four bugs Andrew reported after CP-37.2.

## What this ships

### 1. Rewards redeemable from Home + Shop / See-all

- `app/[business]/app/page.tsx` — "Top rewards" cards are now `<a>` tags. Unlocked rewards link to `/<slug>/app/rewards?redeem=<reward_id>`; locked rewards just open the Rewards tab.
- `components/customer/rewards-client.tsx` — picks up `?redeem=<reward_id>` on mount, auto-opens the `RedeemFlow` modal, and cleans the query string so a refresh doesn't re-trigger.
- `app/[business]/app/shop/shop-client.tsx` "Ready to redeem" cards already linked to `?redeem=<id>`; with the new handler in place they now actually open the redemption flow.
- Copy on Home tab `Ready to redeem ✨` changed to `Tap to redeem ✨` so it reads as interactive.

### 2. Redeem-reward modal — show the actual reward image

- `components/customer/redeem-flow.tsx` — when `reward.image_url` is set, the modal now renders the product photo in a 40-unit-high tile. Falls back to the brand-gradient + Gift icon only when no image was uploaded. Andrew's screenshot showed a pink gradient with a generic gift mark even though the reward had a great BOGO photo.

### 3. Remove dummy "Before Atlas 4.2★ → Now 4.7★"

- `cp37_3_hotfix.sql` rewrites `atlas_review_funnel` to return NULL instead of the hardcoded 4.2 / 4.7 fallbacks introduced in CP-32. The Insights panel already short-circuits on null and hides the whole stat row — so the dummy comparison disappears completely until there's real verified-review data with rating values stored in `verification_data->>'rating'`.

### 4. Invited team members can't sign in with the password they set

**Root cause.** The `/accept-invitation/[token]` page was doing `supabase.auth.signUp` client-side. When Supabase has Confirm-email enabled, signUp creates the user **without** a confirmed email — Supabase then refuses `signInWithPassword` until they tap the confirmation link, which never arrives because the page redirects them straight to sign-in. Result: every freshly-invited admin / manager / front-desk gets "Invalid login credentials" with the correct password.

**Fix.**

- New endpoint `app/api/team/accept-signup/route.ts`. Runs server-side with the admin Supabase client. Calls `admin.auth.admin.createUser({ email_confirm: true, password })` so the user is pre-confirmed. Also defends the "email already exists" case — if it does, it confirms any stuck email and falls through to the existing-account branch on the client.
- `accept-invitation-client.tsx` — replaces the old `signUp` call with a POST to the new endpoint. After it returns, the client does a normal `signInWithPassword` which now succeeds immediately. The existing post-sign-in role-attachment via `/api/team/accept` is unchanged.
- `cp37_3_hotfix.sql` includes a one-shot backfill that confirms every `auth.users` row that still has `email_confirmed_at IS NULL` AND has a matching `pending_invitations` row — so the friends already half-stuck unstick themselves the moment you run the SQL. (Random unconfirmed customer signups are intentionally left alone.)

**Action items.**
1. Run `cp37_3_hotfix.sql` in Supabase SQL editor.
2. **Still recommended**: disable Confirm-email in Supabase Auth → Providers → Email. The admin endpoint sidesteps it, but the customer signup flow still benefits.

## Files

| File | Purpose |
| --- | --- |
| `cp37_3_hotfix.sql` | atlas_review_funnel null-fallback + invitee-confirm backfill |
| `app/api/team/accept-signup/route.ts` | New server-side admin createUser endpoint for invitees |
| `app/accept-invitation/[token]/accept-invitation-client.tsx` | Switches to the new endpoint |
| `app/[business]/app/page.tsx` | Top-rewards cards now link to `?redeem=<id>` |
| `components/customer/rewards-client.tsx` | Auto-opens RedeemFlow on `?redeem=<id>` |
| `components/customer/redeem-flow.tsx` | Renders reward image in confirm modal |
