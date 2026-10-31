# Things only Andrew can do

Kept up to date by Claude. Everything else (code, Supabase SQL) is done for you.
Check items off as you go.

## Every build
- [ ] Paste the push commands Claude gives at the end of each build (PowerShell, from `C:\Users\andre\code\atlas`).
- [ ] If the build added a package (Claude will say so), run `npm install` once before `npm run medspa:dev`.

## Go live: med spa app (one time, ~20 min)
- [ ] Vercel → Add New → Project → import `atlas-rewards` again, name `atlas-medspa`, Root Directory `apps/medspa`.
- [ ] atlas-medspa → Settings → Environment Variables. Copy these from the atlas-rewards project (same values):
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_ROOT_DOMAIN`,
      `SESSION_HANDOFF_SECRET` (if it exists), `STRIPE_SECRET_KEY`, `STRIPE_PLATFORM_FEE_PERCENT` (if it exists),
      `VAPID_PUBLIC_KEY` or `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (whichever atlas-rewards has).
      Do NOT copy `VAPID_PRIVATE_KEY`; only the venue app sends pushes.
- [ ] atlas-medspa → Settings → Domains → add `med.atlas-engine.app`.
- [ ] Local testing of push: copy the same VAPID public key line from Vercel (atlas-rewards → Environment Variables) into `apps\medspa\.env.local`.

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
- [ ] Turn on "Book after purchase" for each med spa clinic you want it on: admin → Automations → the clinic → Book after purchase → turn on. (The SQL is already live; it's off everywhere until you do this, so no surprise texts or pushes.)

## Done by Claude (no action needed)
- 2026-10-30 · CP-228 SQL applied to Supabase: `wf_cond_run` + `c.entry_kind`, "Book after purchase" journey in the catalog (15 journeys). Verified live.
