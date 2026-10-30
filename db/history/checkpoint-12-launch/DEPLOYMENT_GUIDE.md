# Atlas Rewards — Production Deployment Guide

Going from `lvh.me:3000` to `atlasrewards.app` (or whatever your real domain is). About 90 minutes end-to-end if you have everything in hand.

---

## 1. Buy your domain (~5 minutes)

Anywhere you like — Cloudflare Registrar is cheapest with no markup. Namecheap, Google Domains, and Porkbun also work.

Suggested: `atlasrewards.app` for the platform itself. Each client business gets a subdomain (`joesgym.atlasrewards.app`, `juliasmedspa.atlasrewards.app`, etc.).

## 2. Deploy to Vercel (~10 minutes)

Vercel is the easiest host for Next.js. Free tier is fine until you have ~100 customers.

1. Push your code to GitHub (private repo recommended).
2. Vercel.com → New Project → Import your repo.
3. **Environment variables** — paste these (same values as your `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_ROOT_DOMAIN` — set to your real domain, e.g. `atlasrewards.app`
4. Deploy. Vercel gives you a temp URL like `atlas-rewards-app.vercel.app`.

## 3. Connect your domain (~15 minutes for DNS to propagate)

In Vercel → Settings → Domains:
1. Add `atlasrewards.app` and `*.atlasrewards.app` (wildcard).
2. Vercel shows you DNS records to add at your registrar.
3. **At your registrar:** create the records exactly as Vercel says — usually:
   - `A` record for `atlasrewards.app` pointing to Vercel's IP
   - `CNAME` record for `*` (wildcard) pointing to `cname.vercel-dns.com`
4. Wait 5-15 min for DNS to propagate. Vercel automatically issues SSL for the wildcard.

Once green checkmarks appear on both domains in Vercel, the subdomain routing works in prod. `demo.atlasrewards.app` will now resolve to your customer-facing demo app.

## 4. Re-enable email confirmation in Supabase

Now that you're going live, real sign-ups should confirm their emails.
- Supabase dashboard → **Authentication → Sign In / Up → Email**
- Toggle **"Confirm email"** back ON
- Save

## 5. Configure auth providers (Google + Apple)

For phone OTP, social login, and Apple Sign In (the modern combo):

**Phone OTP** (most retention-friendly):
- Supabase → Auth → Providers → Phone → Enable
- Connect Twilio (you'll already have an account if you set up SMS in step 7). Add Twilio Account SID + Auth Token + a verified phone number.

**Google Sign-In**:
- Google Cloud Console → APIs & Services → Create OAuth 2.0 Client ID
- Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`
- Paste the Client ID + Secret into Supabase Auth → Google → Enable.

**Apple Sign-In** (only if you have an Apple Developer account — $99/year):
- Skip for now if not. Email/password + phone OTP + Google covers 95% of cases.

## 6. Production-grade Supabase config

- **Project Settings → Database → Connection pooling** → enable Supavisor session mode (default is fine).
- **Project Settings → API → Restrict CORS** → add `https://atlasrewards.app` and `https://*.atlasrewards.app` to allowed origins. This prevents random sites from calling your API.
- **Database → Backups** → on the Pro tier ($25/mo), enable PITR (point-in-time recovery). Free tier gives you daily backups.

## 7. Wire up SMS + email (optional but recommended)

This is what makes the automation rules actually send messages.

### Twilio (SMS)
1. Sign up at twilio.com → buy a phone number (~$1/month) → grab your Account SID + Auth Token.
2. In Supabase → Settings → Edge Functions → **Secrets**, add:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_FROM` — the phone number you bought, with country code (`+15551234567`)

### Resend (Email)
1. resend.com — sign up (free tier: 3,000 emails/month).
2. Verify your sending domain (DNS records they provide).
3. In Supabase Edge Functions → Secrets, add:
   - `RESEND_API_KEY`
   - `RESEND_FROM` — `"Atlas Rewards <hi@atlasrewards.app>"`

### Deploy the send-queued-messages edge function
```bash
# From the project root, with Supabase CLI installed
supabase functions new send-queued-messages
# Copy the index.ts from checkpoint-12-launch/edge-function-templates/send-queued-messages/index.ts
supabase functions deploy send-queued-messages
```

### Schedule it to run every minute
In Supabase SQL Editor:
```sql
select cron.schedule(
  'send-automation-messages', '* * * * *',
  $$ select net.http_post(
       url := 'https://<your-project-ref>.functions.supabase.co/send-queued-messages',
       headers := '{"Authorization":"Bearer <your-anon-key>"}'::jsonb
     ); $$
);
```

That's it — automation rules with SMS/email actions will now fire.

## 8. Production checklist before opening to real customers

- [ ] Custom domain working at both `atlasrewards.app` and `*.atlasrewards.app`
- [ ] SSL active (green padlock) on both
- [ ] Email confirmation enabled in Supabase
- [ ] CORS restricted to your real domains
- [ ] Service role key rotated (the one I told you to rotate way back in CP 1)
- [ ] At least one outbound webhook configured so you have logs of every transaction
- [ ] Twilio + Resend secrets set if using messaging
- [ ] Backups enabled in Supabase
- [ ] A real test customer signed up + earned + redeemed end-to-end on the production URL

## 9. Onboarding a new client business (the agency workflow)

When you sign a new client (e.g., "Joe's Gym"):

1. Log in to `atlasrewards.app/agency` as the agency admin
2. Click **+ Add Business** → name "Joe's Gym", slug "joes-gym", industry → Create
3. In the brand editor for the new business:
   - **Brand tab**: upload their logo + hero photo, set their brand colors, paste their Google review URL
   - **Rewards tab**: set their point values, add 4-8 rewards (each with image, name, cost, type)
   - **Insights tab**: ignore until they have transactions
   - **Settings tab**: copy the inbound webhook URL + secret if you're wiring their POS
   - **Membership tab**: add 2-3 automation rules (e.g., "Welcome bonus", "Birthday SMS", "Reactivation offer")
4. Send them their unique URL: `joesgym.atlasrewards.app`
5. Have their front-desk staff bookmark `joesgym.atlasrewards.app/manage` on their iPad
6. They're live.

## 10. What's next after MVP launch

In rough order of value:

- **Atlas Engine native shell (iOS + Android)** — wrap the PWA in a thin native container so customers can install via App Store / Play Store. Each business's app loads via QR-scan or lookup, then becomes that business's permanent app inside the shell. Use Expo / React Native or Capacitor.
- **POS integrations** — Square first (cleanest API). Webhook auto-awards points when a Square transaction posts. Sell this as an upsell add-on.
- **Apple Wallet / Google Wallet** — generate digital loyalty cards that live in the customer's wallet. PassKit + Google Wallet APIs. Maybe a week of work per platform.
- **Reactivation campaign editor** — UI for "send this offer to all 60-day-dormant customers." Already half-built (the dormancy detection + the automation queue + the SMS sender). Just needs the trigger + audience UI.
- **A/B testing on offers** — once you have 5+ businesses, you can offer "test which reward converts best" as a feature.

---

That's launch. Save this guide somewhere you can reference. The whole platform you built is roughly equivalent to ~6 months of work from a normal agency — it's worth real money to your clients.
