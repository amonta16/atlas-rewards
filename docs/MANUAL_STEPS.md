# Things only Andrew can do

Kept up to date by Claude. Everything else (code, Supabase SQL) is done for you.
Check items off as you go.

## Every build
- [ ] Paste the push commands Claude gives at the end of each build (PowerShell, from `C:\Users\andre\code\atlas`).
- [ ] If the build added a package (Claude will say so), run `npm install` once before `npm run medspa:dev`.

## Go live: med spa app
Claude already did: created the Vercel project `atlas-medspa`, set it to `apps/medspa`, added the public env vars
(Supabase URL + anon key, root domain, VAPID public key, venue origin), added `med.atlas-engine.app`, and deployed.
Left for you (secrets Claude shouldn't handle):
- [ ] Vercel → atlas-medspa → Settings → Environment Variables → add `SUPABASE_SERVICE_ROLE_KEY` (copy from Supabase → Project Settings → API Keys → service_role, or from your `apps\medspa\.env.local`). Sensitive, all environments → Save → Deployments → ⋯ → Redeploy.
- [ ] Later, for real card payments: add `STRIPE_SECRET_KEY` the same way (the live `sk_live_…` key from Stripe). Until then, the buy buttons fall back to book / text / call.
- [ ] After Claude confirms the app works live: Vercel → atlas-rewards → Settings → Environment Variables → add `NEXT_PUBLIC_MEDSPA_LIVE` = `1` → Redeploy. Med spa tiles in admin then open the new desk + App builder.

## Text-message sign-in (Twilio)
- [ ] Finish Twilio compliance / upgrade from trial.
- [ ] Twilio Console → Verify → Services → Create (name it like the app; it appears in the text). Copy the Verify Service SID (`VA…`), Account SID, Auth Token.
- [ ] Supabase → Authentication → Sign In / Providers → Phone → enable → SMS provider **Twilio Verify** → paste the three values → Save.
      (Claude can't do this one: the Supabase connection can run SQL but not change Auth provider settings.)

## Stripe (to test a real payment)
- [ ] Stripe (test mode) → Developers → Webhooks → add endpoint `https://www.atlas-engine.app/api/stripe/connect/webhook`, "Listen to events on Connected accounts", events: checkout.session.completed, checkout.session.expired, invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.deleted, account.updated. (The live-mode one from CP-149 should already exist.)
- [ ] Connect a test clinic to Stripe in test mode (manager portal → Billing → Connect Stripe, using Stripe's test data).
- [ ] Pay for a plan in the med spa app with card 4242 4242 4242 4242.

## Automations
- [ ] Turn on "Book after purchase" for each med spa clinic you want it on: desk → App builder → Automations (or admin → Automations). (The SQL is already live; it's off everywhere until you do this, so no surprise texts or pushes.)

## Gifts (scratch card on Home)
- [ ] For each med spa clinic, set up at least one automated gift (desk → App builder → Gifts, or admin → the clinic → Offers → automated / welcome gift, e.g. "$25 off your first purchase"). Offers and automations are already ON for spa-by-the-bay, divina-medical-spa and reveal-med, but none has an automated gift yet, so real patients won't see a scratch card until you add one.

## Front desk
- [ ] Try the new desk locally: `npm run medspa:dev`, open http://localhost:3100/spa-by-the-bay/desk and sign in with your Atlas admin email + password. (http://localhost:3100/demo/desk works with no login.)
- [ ] After go-live, give each clinic its desk link: `https://med.atlas-engine.app/<clinic-slug>/desk`. Staff sign in with the same email + password they use for the manager portal. Add front-desk staff in the manager portal → Team, as before.

## Done by Claude (no action needed)
- 2026-10-30 · Vercel project `atlas-medspa` created, env vars (public ones) set, domain `med.atlas-engine.app` added, first production deploy.
- 2026-10-30 · CP-228 SQL applied to Supabase: `wf_cond_run` + `c.entry_kind`, "Book after purchase" journey in the catalog (15 journeys). Verified live.
