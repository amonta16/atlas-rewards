# Things only Andrew can do

Kept up to date by Claude. Everything else (code, Supabase SQL) is done for you.
Check items off as you go.

## Every build
- [ ] Paste the push commands Claude gives at the end of each build (PowerShell, from `C:\Users\andre\code\atlas`).
- [ ] If the build added a package (Claude will say so), run `npm install` once before `npm run medspa:dev`.

## Instant app preview (CP-232/233, ads lead magnet)
Owner types their spa (the app starts building) → name, email, mobile (+ texted code when Twilio is on) → booking software → what they offer (pre-ticked from their site) → what's holding them back (2) → priorities (2) → their own app at `med.atlas-engine.app/p/<slug>`, with "Text me my app" and "Book a walkthrough" (your existing /medspa calendar; the quiz creates the qualified lead and holds their area 48 h).
Ad URL: `https://www.atlas-engine.app/medspa/app?utm_source=meta&utm_campaign=…&utm_content=…`.
Leads: **Admin → App Previews** (Leads tab: name, mobile, email, the spa, the ad). You also get an email per lead, and the owner gets an email with their link (Resend, already set up).
- [ ] Claude key: console.anthropic.com → sign in → Settings → Billing → add a card / credits → **API Keys → Create Key** (name it "Atlas previews") → copy it (shown once). Settings → Limits → set a monthly spend limit.
- [ ] Vercel → project **atlas-rewards** (www.atlas-engine.app) → Settings → Environment Variables → add, Production, sensitive:
      `ANTHROPIC_API_KEY` = the key; `ANTHROPIC_MODEL` = `claude-haiku-5-5` (cheapest, fine for reading a website) or `claude-opus-5-5` (best). Then Deployments → ⋯ on the latest → Redeploy.
- [ ] Google Cloud → APIs & Services: **Places API (New)** enabled (search already works). Credentials → the `GOOGLE_PLACES_API_KEY` key → API restrictions: Places API (New) only. Set a daily quota cap.
- [ ] Meta (optional but recommended for ad optimization): Events Manager → your Pixel → Settings → Conversions API → Generate access token → Vercel atlas-rewards: `META_CAPI_TOKEN` and `NEXT_PUBLIC_META_PIXEL_ID` (the Pixel's number). Each lead is sent as `Lead` (content_name `app_preview`) with hashed email + phone.
- [x] Twilio A2P 10DLC approved (2026-11-08). Number: **+1 775 252 4211**.
- [x] CP-237 texting is ON (2026-11-08): Twilio + Vercel values set by Andrew, `PREVIEW_SMS_SEND=1` set by Claude and atlas-rewards redeployed. Still to do: text the number once from your phone and check you get your app link back (or an email "Text to the Atlas number" for a text without a pv- code). Reference, what was set: Vercel → Settings → Environment Variables, Production:
      **atlas-medspa**: `PREVIEW_SMS_NUMBER` = `+17752524211` → turns on the "Text me my app" button (owner texts first). Redeploy.
      **atlas-rewards** (sensitive): `TWILIO_ACCOUNT_SID` (`AC…`, Twilio Console home), `TWILIO_AUTH_TOKEN` (same page), `PREVIEW_SMS_NUMBER` = `+17752524211`.
      Optional on atlas-rewards: `TWILIO_MESSAGING_SERVICE_SID` (`MG…`, Messaging → Services → the service your A2P campaign is attached to). Without it, texts go out "From" the number, which works as long as the number sits in that campaign's service.
      Twilio Console → Phone Numbers → +1 775 252 4211 → Messaging → "A message comes in" → Webhook, HTTP POST: `https://www.atlas-engine.app/api/preview/sms-inbound` (if the number is in a Messaging Service, set it on the service's Integration page instead). This is the auto-reply with their link.
      When you've tested: `PREVIEW_SMS_SEND` = `1` on atlas-rewards and redeploy. Before that, nothing is texted (inbound texts still get logged and emailed to you).
      Optional, the 6-digit texted code step: Twilio Console → Verify → Services → Create → `TWILIO_VERIFY_SERVICE_SID` (`VA…`) and `PREVIEW_VERIFY_PHONE` = `1` on atlas-rewards. Verify sends from Twilio's own numbers, not yours.
- [ ] Self-serve "Go live" checkout is hidden until you set a monthly price. When ready: Vercel atlas-medspa `PREVIEW_SHOW_CHECKOUT` = `1` (plus `STRIPE_FOUNDING_CHECKOUT_URL`).
- [ ] Stripe → Payment Links → the founding setup offer → Vercel atlas-medspa: `STRIPE_FOUNDING_CHECKOUT_URL`. The preview adds `client_reference_id=<slug>`.
- [ ] Vercel atlas-medspa: check `VENUE_APP_ORIGIN` = `https://www.atlas-engine.app`. Redeploy after adding vars.
- [ ] Optional: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` on atlas-rewards (rate limits shared across instances). `GHL_INBOUND_WEBHOOK_URL` only if you ever want leads copied into GHL; not needed.
- [ ] Test: open `/medspa/app`, pick a real spa, fill the form while it builds, check the preview, and see the lead in Admin → App Previews and in your inbox.

## Lead funnel + follow-up emails (CP-238)
New: **Admin → Lead Funnel** (visits → opt-ins → walkthroughs booked → paid, per day and per campaign) with a **Follow-up emails** tab: 3 emails after opt-in (day 1, day 3, day 12), editable timing and copy, live preview, "Send me a test". The desk Home now opens with setup cards, a 7-step checklist and a "Your access" card; Offers and Atlas Engine moved into App Builder → Journey.
- [x] CP-238 SQL applied by Claude (2026-11-09): `funnel_visits`, `lead_email_steps` (3 emails seeded), 4 `nurture_*` columns on `app_previews`. File: `db/history/checkpoint-238-lead-funnel/cp238_lead_funnel.sql`. Visits start counting once this code is deployed.
- [ ] Read and edit the 3 emails in Admin → Lead Funnel → Follow-up emails. Use "Send me a test" for each.
- [ ] Vercel atlas-rewards: `MAIL_POSTAL_ADDRESS` = a physical postal address where Atlas can receive mail, e.g. `123 Main St, Suite 4, San Diego, CA 92101`. Not an email or web address. A USPS PO box or a registered virtual mailbox (iPostal1, Anytime Mailbox) works if you don't want a home address in emails. US law (CAN-SPAM) requires it in every marketing email; it prints in the small footer.

## Funnel upgrades from the landing-page review (CP-246, branch `funnel-upgrades`)
Every "Book" on a preview now lands on `/medspa/book/<slug>`: the **Launch Plan call** sold as its own offer (20 min, "worth $300", 3 takeaways, the 90-day guarantee, the bonus deadline), then name + mobile + 2 taps (+ email only if the preview has none) and the calendar on the same page. Before, it went through the whole `/medspa/start` quiz. The app page `/p/<slug>` adds "Why patients don't come back on time" + **Due-Date Recall**, a proof row, the call offer and a P.S. The unlock sheet asks (optionally) for a mobile with the two SMS boxes; the informational box texts their app link right away, the marketing box lets the follow-up texts go out. A real "N med spas built their app this week" line shows at 3 or more (entry page and app page).
- [ ] Check the call copy is true for how you run calls: `LAUNCH_CALL` in `apps/venues/lib/landing/medspa-funnel.ts` and `apps/medspa/lib/offer.ts` (keep both the same; a test checks). The third takeaway promises a **written launch plan emailed after the call**, so send one after every call. Change `value` (300) if you'd rather state another number.
- [ ] **Connect Google Calendar** (it isn't, on production: `/api/landing/availability` says `live: false`). Until then the calendar shows standard open hours, not your real free/busy, and no event or Meet link lands on your calendar. Vercel atlas-rewards: `GOOGLE_SA_CLIENT_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GOOGLE_CALENDAR_USER` (see `lib/google-calendar.ts`).
- [ ] Email follow-ups: `MAIL_POSTAL_ADDRESS` and `LEAD_NURTURE_SEND` = `1` on atlas-rewards (neither is set yet). Texts are already on (`PREVIEW_SMS_SEND=1`).
- [ ] A2P: the opt-in now also appears after the unlock on `/p/<slug>` and on `/medspa/book/<slug>` (same wording). If Twilio asks, describe those two places in the campaign's opt-in description.
- [ ] The follow-up copy in Admin → Lead funnel still says "15 minutes"; the call is 20. Edit the steps there.
- [ ] The weekly count includes every preview built, your own test builds of real spas too (only names containing "test" are left out). It was 8 on 2026-11-12, before any ads. If you keep test-building, raise the 3-minimum in `ProofRow` (`apps/medspa/components/preview-close.tsx`) and `BuiltThisWeek` (`apps/venues/components/preview/preview-start.tsx`) or ask Claude to leave out builds from your IP.

## Review screenshots (CP-240)
Admin → **Reviews**: drop review screenshots (or a whole folder), tick which pages each shows on (Med spa pages / All-business home / Entertainment venues), drag to reorder, hide or delete. They slide left → right in the ocean review band (`/`, `/med-spas`, `/medspa`), in the strip right under the hero of the lead magnet (`/medspa/app`) and in the venues "In their words" section. Once any screenshot is live on a page, that page's dashed "Review slot" cards disappear. Sites pick up changes within ~60 s.
- [ ] Run `db/history/checkpoint-240-review-images/cp240_review_images.sql` in the Supabase SQL editor (table `site_review_images` + public bucket `site-reviews`). Until then Admin → Reviews shows "Has the CP-240 SQL been applied?" and the sites look exactly as before.

## Partner reviews (CP-239)
The review carousel and quote spots are built: bottom of `/medspa/app`, the offer card after the preview, the `/medspa` funnel (after How it works and after the offer) and `/med-spas` (after the week of reminders and after pricing), plus the existing band. They show nothing until real reviews are added.
- [ ] In `apps/venues/lib/landing/site-reviews.ts`: set `REVIEW_PARTNER.name`, then add each review with `via: "partner"`, the client's exact words, their name/role/practice/city as they agreed, `sourceNote` (where the original lives) and `topics`. Flip `SHOW_REVIEW_SLOTS` to false once there are real ones.
- [ ] Then turn sending on: Vercel atlas-rewards `LEAD_NURTURE_SEND` = `1`, redeploy. The cron (every 15 min) only emails owners who opted in within the last 30 days, and stops when they book, pay, unsubscribe or the preview is deleted.
- [ ] Replace the homepage explainer video: `EXPLAINER` in `apps/medspa/components/desk/get-started.tsx` is the Dermis reference video (id `s_AEjkfhL2Q`), shown only to Atlas admins, the /demo clinic and local dev. Put the Atlas video's YouTube id there and set `internal: false`.

## Go live: med spa app
Claude already did: created the Vercel project `atlas-medspa`, set it to `apps/medspa`, added the public env vars
(Supabase URL + anon key, root domain, VAPID public key, venue origin), added `med.atlas-engine.app`, and deployed.
Left for you (secrets Claude shouldn't handle):
- [ ] Vercel → atlas-medspa → Settings → Environment Variables → add `SUPABASE_SERVICE_ROLE_KEY` (copy from Supabase → Project Settings → API Keys → service_role, or from your `apps\medspa\.env.local`). Sensitive, all environments → Save → Deployments → ⋯ → Redeploy.
- [ ] Later, for real card payments: add `STRIPE_SECRET_KEY` the same way (the live `sk_live_…` key from Stripe). Until then, the buy buttons fall back to book / text / call.

## Text-message sign-in (Twilio)
Until this is on, the app's sign-in screen uses email + password by itself. It switches to phone numbers within a minute of you turning this on; email stays as a second option so existing accounts keep their points.
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

## Ship the med spa app to the App Store / Google Play (Phase 6, not built yet)
Accounts and setup only you can do (start these now, some take days):
- [ ] Apple Developer Program, enrolled as the business (Atlas Engine LLC). Needs a free D-U-N-S number first (can take 1–2 weeks). $99/yr.
- [ ] Google Play Console. If your existing account is a *personal* one, new apps need a closed test with 12+ testers for 14 days before production. An *organization* account (same D-U-N-S) skips that.
- [ ] A way to build iOS: Xcode only runs on a Mac. Either borrow/buy a Mac, or use a cloud Mac build service (e.g. Codemagic; Claude can set up the config).
- [ ] Decide: one "Atlas Med Spa" app where patients pick their clinic (one listing under Atlas's account), or a branded app per clinic (Apple requires those to be published from each clinic's own developer account).
- [ ] Clinic content per clinic: real treatments, prices, photos, booking method, at least one gift.
- [ ] Privacy policy + support URL for the store listing, and store screenshots (Claude can make these).

## Done by Claude (no action needed)
- 2026-11-08 · CP-237 committed (not deployed): 3D phones video on /medspa/app, "built" only after the scan animation, front-desk welcome email after the last step, preview front desk at `med.atlas-engine.app/<slug>/desk` (no sign-in, nothing saved), Twilio texting from +1 775 252 4211 (off until `PREVIEW_SMS_SEND=1`). See db/history/checkpoint-237-preview-desk-sms/README.md.
- 2026-11-08 · CP-235 live: cleaner /medspa/app landing, booking-software logos, no pre-ticked treatments, ~22 s scanning screen that shows what was found (logo, color, treatments, photos), branded "your app is ready" email (their logo, photo and color), Admin → Funnels tab, SMS sections in Terms and Privacy (for A2P review).
- 2026-11-07 · CP-234 SQL applied to Supabase: quiz answers (booking tool, offered, challenges, priorities), phone_verified_at and landing_lead_id on `app_previews`; `get_app_preview` returns `priorities` only (other answers stay private). Verified with rolled-back test rows; funnel tested end to end on production (Tirage Medspa, test contact).
- 2026-11-07 · CP-233 SQL applied to Supabase: contact columns (name, email, consent time) and deep-build columns (hero photo, font, about, team) on `app_previews`; `get_app_preview` returns the new display fields but never contact details. Verified with rolled-back test rows (unsafe font names rejected, table still unreadable with the public key).
- 2026-11-07 · CP-232 SQL applied to Supabase: `app_previews` table (RLS on, no direct access for anon/authenticated), `get_app_preview(slug)` and `app_preview_state(slug)` read functions. Verified with rolled-back test rows: ready previews readable by slug only, building/expired ones hidden, table not selectable with the public key.
- 2026-11-05 · CP-231 SQL applied to Supabase: Shop orders earn points when they're paid (Stripe or Mark paid at the desk), once per order; no points on gift cards; not counted as a visit. Tested with rolled-back demo orders.
- 2026-10-30 · CP-229: admin folders split by tab (Venues | Med Spas), med spa folders moved to Med Spas; the missing subfolder column added (creating/editing folders was failing before). Automations business picker grouped by Venues / Med Spas.
- 2026-10-30 · Vercel project `atlas-medspa` created, env vars (public ones) set, domain `med.atlas-engine.app` added, first production deploy.
- 2026-10-30 · Admin med spa tiles now open the new App builder by default (no env switch needed).
- 2026-10-30 · CP-228 SQL applied to Supabase: `wf_cond_run` + `c.entry_kind`, "Book after purchase" journey in the catalog (15 journeys). Verified live.
