# Lead magnet audit (2026-11-10, branch `lead-magnet-audit`, from origin/main 9cd5e71)

One metric: render-to-book. Checked on the live funnel at phone size (390 px) and in the code:
`apps/venues/components/preview/preview-start.tsx` (entry → gate → quiz → scan), `apps/venues/lib/preview/build.ts`,
`apps/medspa/app/p/[slug]/page.tsx` (the app render), `apps/medspa/app/[clinic]/desk` (portal),
`apps/venues/lib/landing/lead-nurture.ts` + Admin → Lead funnel (sequences).

The real flow today differs from the brief's: **search → contact gate → (texted code) → 4 quiz screens → forced 22 s
scan → "ready" screen → tap → app**. The gate fires before the app exists on screen.

## Step 1 · Scores (1-5) and the biggest leak per screen

| Screen | Score | Biggest leak |
| --- | --- | --- |
| Entry (`/medspa/app`) | 4 | One input, good headline. But the price ("$500 setup … one flat monthly plan") and a 90-word SMS-consent paragraph sit next to the only action, and on a phone the cookie sheet covers the bottom of the first screen. ~11 s to network-idle (the 3-phone video). |
| Build | 2 | The build runs in the background, but the owner waits for it anyway: a forced **22 s** "Optimizing… / almost done" scan after the quiz, even when the build finished long before. |
| App render (`/p/<slug>`) | 2 | Nothing to act on in the first screen: the buttons were ~1,900 px down, under the pitch and a price card, and **"Text me my app" was the primary button, Book second**. No way to fix a wrong logo. No push moment. The app greets them "Welcome, Guest!". |
| Gate | 1 | Fires **right after they pick their spa, before they see anything**: first + last name, email, mobile, two SMS boxes, (+ a 6-digit code when PREVIEW_VERIFY_PHONE=1). Everyone who drops here never sees their app. |
| Portal (`/<slug>/desk`) | 3 | Names the spa, Book button on top, a clean 7-step checklist. But "Every feature unlocked to try": the engine isn't dark, so there's no gap to close. "Good morning 👋" is generic; the explainer video is still a placeholder. |
| Import | 1 | Doesn't exist. No CSV patient import, so the "beautiful empty room with their own patients in it" moment never happens. |
| Skip-ahead | 1 | "Go live" (Stripe) exists but is env-gated off (PREVIEW_SHOW_CHECKOUT). When on, it shows to everyone, with no readiness gate. |
| Territory branch | 3 | The area check runs after the quiz; a taken area swaps Book for the waitlist (good). But the entry page shows "first 10 med spas" and "one per 10-mile area" to everyone before the zip is known, and a taken area still gets the founding price card. The zip comes from Google Places with no way to correct it. |

### Every place it asks before it gives
1. The price, on the entry page, before anything is built.
2. Cookie consent sheet over the first screen (legally needed; can be smaller).
3. First name, last name, email, mobile: before the app is on screen.
4. Two SMS consent boxes: same screen.
5. A 6-digit texted code (when PREVIEW_VERIFY_PHONE=1).
6. "Which booking software do you use?"
7. "Pick at least N treatments."
8. "What's holding your clinic back?" (exactly 2).
9. "Top 2 priorities" (exactly 2).
10. A forced 22 s wait.
11. One more tap ("Open my app"), under a price card.
12. On the app page, "Text me my app" (asks them to text us) was the main button, ahead of booking.

## Ranked fix list (expected lift on render-to-book)

| # | Fix | Step | Status |
| --- | --- | --- | --- |
| 1 | Move the gate after the render (scroll-past or 45 s), email + zip only; quiz after or in the portal | 3 | Done (quiz parked for the portal, step 4) |
| 2 | Open the app the moment it's ready: forced 22 s scan → 3.5 s reveal, no extra tap | 2.1 | Done |
| 3 | Brand-first build: name, logo, color live in seconds; menu and photos fill in behind and the app refreshes itself | 2.1 | Done |
| 4 | Two equal buttons, always on screen on a phone: [Book 15 min · turn it on live] [Just look around] | 2.4 | Done |
| 5 | "Wrong logo or color? Fix it", one tap, on every render | 2.2 | Done |
| 6 | "Preview mode — engine off." banner, top of the page, sticky | 2.5 | Done |
| 7 | Tappable test push from their spa (real one where the browser allows; iPhone Safari gets the Add to Home Screen step in place) | 2.3 | Done |
| 8 | Name their spa everywhere ("Welcome, Guest!" in the app, "Good morning 👋" on the desk); one ask per screen | 5 | Done |
| 9 | Portal: engine rows locked and greyed ("Turn on to fire"), sticky "Turn on the engine →" bar | 4 | Done |
| 10 | CSV patient import | 4 | Done (the list stays in the owner's browser) |
| 11 | The full follow-up schedule (0:45 SMS → day 14), every SMS, email and call task visible and editable in Admin → Lead funnel, with each lead's follow-through | 6 | Done (needs CP-243 applied) |
| 12 | Events (build_started … book_clicked) + render-to-book on the Lead funnel dashboard, red under 3% | 7 | Done |

Step 2's "under 15 s p95" can only be met once #1 lands: with the gate and quiz still in front, the owner spends that
time answering questions before the app shows. The brand phase itself is one home-page fetch + logo + colors
(a few seconds; not yet measured in production).

## Step 2 · What changed (commit `304c818`)

**Build (venues)**
- `lib/preview/build.ts`: phase 1 writes logo, colors, font, the example menu and `status: ready` as soon as the brand is
  known; phase 2 (site read, treatments, photos) then fills in and sets `built_at`. A phase-2 failure keeps the brand.
- `app/api/preview/status/route.ts`: returns `enriching` (ready, `built_at` null, not stale) and allows the med spa
  origin to read it (CORS).
- `components/preview/preview-start.tsx`: the scan minimum is 3.5 s (was 22 s); "ready" goes straight to the app.
- `app/api/preview/brand/route.ts` (new): the logo/color fix. Upload (≤ 2.5 MB, PNG/JPG/WebP/GIF) or link (SSRF guard),
  same normalizer and hosting as the build; color goes through the palette contrast check. CORS: med spa origin only;
  10 changes / 10 min per visitor.

**App render (medspa)**
- `app/p/[slug]/page.tsx`: sticky "Preview mode — engine off." banner; the phone stage; the two-button bar right under
  the headline (fixed to the bottom of the screen on a phone); the old badge removed.
- `components/preview-stage.tsx` (new): the phone with the fix chip and the brand sheet, the test push (an iOS-style
  banner slides onto the phone and is tappable; a real notification through `/sw-push.js` where allowed; the Add to Home
  Screen step on iPhone Safari), the self-refresh while treatments are still coming, and `CtaBar`.
- `components/phone-frame.tsx`: an `overlay` slot drawn in phone-screen coordinates.
- `components/preview-actions.tsx`: Book moved to the bar; "Text me my app" is a quiet option lower down.

**Checked:** venues typecheck clean; `npm test` 112/112 pass. Medspa typecheck: only the existing
`@mediapipe/tasks-vision` errors (skin-scan dependency not installed in the shared node_modules).
**Not checked:** the page in a browser with live data (no local Supabase env), a real build's phase-1 timing, and the
push on real devices. Not pushed or deployed.

## Step 3 · The gate, after the app (commit `0ee7fd3`, on top of step 2)

The funnel is now **search → 3.5 s reveal → their app**. Nothing is asked before the app is on screen.

**On the app page (medspa)**
- `components/preview-gate.tsx` (new): fires when the phone scrolls off the top of the screen or after 45 s,
  whichever is first. "Your app is ready. Unlock it." Email + zip, nothing else. The zip is prefilled from
  Google and can be corrected. Light dim, no blur; closable (stays closed for that visit); never asks again once
  unlocked (server flag + this browser). Waits if the logo-fix sheet is open. After it's sent: "Unlocked.
  {Spa}'s front desk is in your inbox." with an "Open my front desk" button.
- `app/p/[slug]/page.tsx`: mounts it under the phone.

**Server (venues)**
- `app/api/preview/unlock/route.ts` (new, CORS med spa origin only, 6 tries / 10 min): saves `contact_email`,
  `contact_at` (first time), `area_zip`; a corrected zip re-runs the territory check, and the page refreshes
  (Book ↔ waitlist). Sends Meta "Lead" (CAPI, hashed email, fbp/fbc from the build), GHL `app_preview_contact`
  (now with `zip`, no name/phone), the email to you, and the welcome email with their front desk link (first
  unlock only). The follow-up emails start from `contact_at`, as before.
- `app/api/preview/status/route.ts`: also returns `zip` and `unlocked` (never the email).
- `components/preview/preview-start.tsx`: picking the spa goes straight to the reveal; the contact, code and quiz
  screens are no longer reached (kept for the portal). The reveal says "Building {Spa}'s app…". The entry page's
  SMS note no longer describes the two boxes (there are none now).
- Emails without a name greet the spa ("Glow Aesthetics, your app is ready.", "Hi Glow Aesthetics,") instead of
  "there": `lib/preview/email.ts`, `lib/landing/lead-nurture-send.ts`.

**What this changes elsewhere (decide before deploying)**
- **Meta:** "Lead" now means email + zip after seeing the app (CAPI only; the med spa site has no browser
  Pixel). Expect many more Leads; a campaign optimizing for Lead will re-learn.
- **SMS / A2P:** no phone or SMS boxes in the funnel any more. Texting starts only when the owner texts us
  ("Text me my app") or books. If the A2P campaign registration describes the old two-box form as the opt-in,
  update it (and the page at `SMS_CONSENT_PAGE`).
- **No name or phone on the lead** until they book (the /medspa calendar asks). The call tasks in step 6 need a
  phone: those can only start for owners who book or text us, or the portal asks for it later (step 4).
- **Quiz answers** (booking tool, offers, priorities) are no longer collected, so the page pitch uses the default
  three bullets, and no `landing_leads` row or 48 h area hold is made at the gate (that table needs a name and
  phone). "Book 15 min" goes to the regular /medspa start page, which asks for them.

**Checked:** venues typecheck clean; medspa typecheck shows only the existing `@mediapipe/tasks-vision` errors;
`npm test` 112/112. **Not checked:** the gate in a browser with a live preview (no local Supabase env), and the
unlock against the real database. Nothing committed, pushed or deployed.

## Step 4 · The portal (commit `68c8be6`, on top of steps 2 and 3)

Everything here is the **preview** desk only (`/pv-…/desk`). Live clinics and the demo are unchanged.

**Engine locked, app open** (`components/desk/engine-lock.tsx`)
- Anything that would fire to patients is greyed, can't be clicked or tabbed into, and shows "Turn on to fire."
  on hover and focus: the Automated offers on/off pills (a grey "Locked" pill), the offer's "On" switch, Settings →
  Care & recall "Send recall reminders", the three always-on cards in Journey → Campaigns, and Insights → Inactive
  patients "Send to all" / "We miss you". Treatments, plans, rewards, the patient list and check-in stay usable.
- The desk banner now says "nothing is sent to patients until you turn the engine on".

**Patient import** (`components/desk/preview-portal.tsx`, `lib/patient-csv.ts`)
- Home shows "See your desk with your own patients → Import patients" until a list is in; Client profiles has an
  Import button. Any CSV/TSV export: columns are found by title (full name or first + last, phone, email, last
  visit, last treatment, visit count), up to 5,000 rows. A last treatment that matches a menu item with "due
  again" weeks lands on Patients due.
- **The list never leaves their browser** (localStorage). Only "imported, N rows" is reported. That keeps
  patient data off our servers before there's a contract, but it also means the list is only on that computer.
- 5 new tests (`apps/venues/tests/preview-patient-csv.test.ts`): quotes, commas and newlines in quotes, tabs and
  semicolons, column matching, phone/email clean-up, due dates, bad dates, the row cap.

**After the import:** a sticky full-width "Turn on the engine →" bar along the bottom (to the walkthrough).

**First login only:** a muted, captioned video plays in place at the top of Home, on the first desk visit (server
flag + this browser). It uses `PREVIEW_DESK_VSL_URL` (+ `PREVIEW_DESK_VSL_VTT` for captions). **There is no 45 s
video yet**, so nothing shows until those are set. The entry page has no video sales letter (its 3-phone loop
is a product shot), so nothing to remove there.

**Install prompt on the second visit:** from the second desk visit (counted in this browser), until their app
is installed: "Put {Spa}'s app on your phone" with a QR code (a link on a phone) and the Add to Home Screen
steps. The preview app reports itself when it's opened from a Home Screen.

**Skip-ahead, gated on all three:**
- verified = they opened the desk from the signed link in our emails (`?v=` HMAC of slug + email; welcome email
  and the follow-up emails' `{desk_link}`);
- csv_imported_at = they imported a list;
- app_installed_at = their preview app ran from a phone's Home Screen.
Until then "Turn it on now" is hidden. The button reads "Turn it on now, $500 setup": **the brief says $297,
but `lib/offer.ts` says the founding setup is $500**, so the label follows the config. Change `setupFounding`
if $297 is the new price. It also still needs `PREVIEW_SHOW_CHECKOUT=1` + `STRIPE_FOUNDING_CHECKOUT_URL`;
with checkout off (today) it never shows.

**Server (venues):** `POST /api/preview/progress` (desk_visit / verified / csv_imported / app_installed; CORS med
spa origin, rate limited; emails you on verified, imported and installed). Status also returns `progress`
and `desk_seen`. New columns in `db/history/checkpoint-242-lead-magnet-portal/cp242_preview_progress.sql`.

**Before deploying step 4**
1. Apply CP-242 (5 columns on `app_previews`). Without it the progress endpoint answers 503, so the skip-ahead
   stays hidden and the video shows on every visit from a new browser. Nothing breaks.
2. Make the 45 s video and set `PREVIEW_DESK_VSL_URL` / `PREVIEW_DESK_VSL_VTT`.
3. Decide the setup price ($297 vs $500) and whether checkout goes on.

**Not done in step 4:** the quiz (parked in step 3) isn't in the portal yet. The sample orders, vouchers and
reviews on a preview desk still use sample names after an import. Previews still don't appear in Admin as
clinics (your earlier request).

**Checked:** both typechecks (medspa: only the old mediapipe errors); `npm test` 117/117 (112 + 5 new).
**Not checked:** the desk in a browser (no local Supabase env), and the import on real exports from Boulevard,
Vagaro, Mangomint or Zenoti. Nothing committed, pushed or deployed.

## Step 5 · Copy (commit `e899ea6`, on top of steps 2-4)

**Their spa, by name, everywhere**
- Patient app home: "Welcome, Guest!" → "Welcome to {Spa}" (signed in without a first name: "Welcome back to {Spa}!").
  This is the line the owner sees first in their preview, and every live clinic's guests see it too.
- Desk: "Good morning 👋" → "Good morning, {Spa}".
- Emails without a name (step 3): "Hi {Spa}," and "{Spa}, your app is ready." instead of "there". The follow-up
  emails' `{first_name}` falls back to the spa name.
- Texts the desk drafts to patients ("Patients due", "Skin scans") drop the "Hi there" fallback; they already name
  the clinic.

**One ask per screen**
- App page (`/p/<slug>`): the only ask is the bar (Book 15 min, or Join the waitlist). "Go live" is gone from the
  page (it's the gated skip-ahead in the portal now), and so is "We emailed you the link" (not true before the gate).
  "Text me my app" stays as a quiet give.
- The reveal screen: just "Open my app" (it shows for under a second while their app loads); the offer card and the
  front desk link are gone from it.
- Welcome email: one ask, "Open my front desk". The "Book a 15-minute walkthrough" block and "Questions? Just
  reply" are out.
- Follow-up emails (starting copy): one link each. Email 1 loses "Just reply if you have a question", email 2
  loses its second link (the app), email 3 loses "Reply 'later'".
- Preview desk: once the "Turn on the engine →" bar is up, the banner's "Book a walkthrough" button hides.

**Scarcity only when the area is known to be open**
- Entry page: "our first 10 med spas", the struck-through price and "One med spa per 10-mile area" are gone
  (nobody's area is known there). It now says: free preview, setup is $500, one flat monthly plan.
- App page, area open: "Want it live? First 10 med spas" and "One med spa per 10-mile area" as before.
  Area unknown: the offer without either line. **Area taken: no offer card and no scarcity line at all**. The bar's
  button is "Join the waitlist" (as before), and the "another practice near you already works with Atlas" note is gone.
- "Yours is held for 48 hours" is gone too: since step 3 no hold is created at the gate.

**Email 2: their average ticket in the math**
- New merge tags `{avg_ticket}` and `{ten_rebooks}` (listed in Admin → Lead funnel's tag list). The average ticket is
  the median price on the menu we read from their website, rounded to $5. With no real menu (example treatments, or
  fewer than 3 prices) it says "$450 (a typical med spa visit)" rather than passing that off as theirs.
- Email 2 now reads: "Quick math. Your average treatment is about {avg_ticket}. If I bring back just 10 patients a
  month who were due, that's {ten_rebooks}. Every month."
- **If you've already saved the emails in Admin → Lead funnel, the saved copy wins.** Press "Starting copy" on
  each email there to pick up the new text, then save.

**Tests:** 4 new (`tests/preview-copy.test.ts`): median ticket and rounding, bad and thin menus, email 2's math
filled in, one link and no "reply" in every default email. `npm test` 121/121; both typechecks clean (medspa:
only the old mediapipe errors). **Not checked:** the pages in a browser. Nothing committed, pushed or deployed.

## Step 6 · The follow-up schedule (commit `7815dc6`, on top of steps 2-5)

**Did the schedule exist and fire?** No. Before this step there were 3 emails (24 h, 72 h, day 12), no texts and no
call tasks. Also, a "Text me my app" tap marked the preview "claimed", which **stopped every follow-up email** and
**counted the owner as Paid** on the Lead funnel page. Both are fixed: "claimed" no longer stops anything or counts
as paid.

**Now: one clock from the unlock (email + zip), 10 steps, each editable in Admin → Lead funnel → Sequence**

| When | Channel | Step |
| --- | --- | --- |
| 0:45 | Text | First text: their app link + book 15 min |
| 3 h | Email | "Saw you clicking around" |
| 5 h | Call task | First call (script: did the logo and treatments come out right? book the walkthrough) |
| 24 h | Text | "Did it look right? Fix the logo in one tap" |
| day 2 | Email | "Why not switch me on?" with their average-ticket math |
| day 3 | Call task | Second call, leading with their numbers |
| day 4 | Text | The ticket math in one line |
| day 6 | Email | What the front desk would have done this week |
| day 8 | Email | Break-up ("deleted on {expires_on}") |
| day 14 | Email | Nurture: one idea for slow days, no pitch |

- **Sequence tab:** each step's channel, timing (minutes, hours or days), copy or call script, and on/off. It has
  a live preview (the email; a text bubble with the character and segment count; the script with sample numbers),
  "Starting copy", and "Send me a test" for emails. Texts must keep an opt-out line, or they won't save.
- **Follow-through tab:**
  - "Calls to make": each open call task with a tap-to-call number (the owner's mobile, else the business line from
    Google), the script filled with their numbers, and one-tap outcomes (Talked, Voicemail, No answer, Booked,
    Not a fit). You also get an email when a call comes due.
  - "Every lead, step by step": one row per owner, one cell per step, showing sent / would send (sending off) /
    skipped (hover for why) / call open / called / cancelled / due now. Each row has its status and an "End" button.
- **The rules, enforced by the cron** (now every 5 minutes, so the 0:45 text lands within 5 minutes):
  - **Texts stop on any reply** (STOP, a question, anything) from that number. You get the message by email.
    Emails and calls carry on.
  - **Booking cancels every remaining step**, open call tasks too. This happens at the moment of booking, and the
    cron also catches it. So do "paid", "Booked" or "Not a fit" from a call, and "End".
  - Emails stop on unsubscribe.
  - A lead who's behind (sending was off, or the cron was down) gets only the latest due step. The ones passed
    over are logged, never sent in a burst.
- **Booking now links back to the preview.** "Book 15 min" carries `?pv=<slug>` into /medspa/start, and the lead it
  creates is linked to the preview. Before this, a preview owner's booking never stopped their follow-up emails.
  The name and mobile from that form go on the preview for the call tasks, never for texts: that form has no SMS consent.
- Owners already part-way through the old 3 emails keep their place when CP-243 is applied (old email 1 → step 2,
  2 → step 5, 3 → step 9), and any copy you edited in the old tab is carried over.

**What won't fire yet, and why**
1. **Apply CP-243** (`db/history/checkpoint-243-lead-sequence/cp243_lead_sequence.sql`). Until then the cron runs
   the old 3 emails, and the admin shows the new schedule read-only with a note.
2. **Texts need SMS consent on file, and since step 3 the funnel collects none.** So today the 3 texts are logged
   as "skipped: no SMS consent". To make them fire, an owner has to give a mobile number with the marketing box
   ticked somewhere: an optional field after the unlock, or in the portal. That's your call. It's a compliance
   question (TCPA / A2P), not a code one.
3. Sending switches stay off: emails with `LEAD_NURTURE_SEND=1` (plus `MAIL_POSTAL_ADDRESS`), texts with
   `PREVIEW_SMS_SEND=1` + Twilio. While off, each step is logged as "would send", so you can watch the
   follow-through before turning it on.

**Tests:** 10 new (`tests/lead-sequence.test.ts`): the schedule itself, the SQL seed matching the code word for
word, 0:45 timing, call tasks, consent, stop-on-reply (texts only), unsubscribe, catch-up without bursts,
switched-off steps, booking stops all, SMS segment counting. `npm test` 131/131; both typechecks clean.
**Not checked:** the admin pages in a browser (they need the database), a real Twilio reply, a real booking end to end.
Nothing committed, pushed or deployed.

## Step 7 · Measurement (commit `8c5ebd4`, on top of steps 2-6)

**The ten events**, one row per preview per event (`preview_events`, with first/last time, a count and a little
meta), so every rate is "previews that did X" and reloads don't inflate it:

| Event | Recorded where |
| --- | --- |
| build_started | `/api/preview/start`: a new build, or the same spa found again (`cached` in meta) |
| app_rendered | the app page, from the browser, once per page load |
| brand_overridden | `/api/preview/brand`: a successful logo/color fix (which one, in meta) |
| notif_previewed | the "Send me a test push" tap |
| gate_submitted | `/api/preview/unlock` (whether the zip was corrected) |
| portal_login | the front desk reporting a visit |
| vsl_played | the first-login video starting |
| csv_imported | the desk import (row count) |
| app_installed | the preview app opened from a Home Screen |
| book_clicked | `/medspa/walkthrough/<slug>`, which every Book link goes through; `?src=` says which one (page, desk, desk_bar, email, sms, call) |

The browser can only report the three it alone sees (`POST /api/preview/event`, med spa origin only, rate
limited); the rest are recorded on the server where they happen. Recording never throws or blocks a response.

**Dashboard:** Admin → Lead funnel → Overview opens with **Render-to-book**: owners who clicked Book ÷ owners who
saw their app, for apps first shown in the chosen range (7/30/90 days).
- **Under 3% with at least 20 renders, the panel turns red** with "This is the product, not the copy" and
  where to look first (the build, the app page, time to first paint).
- Under 20 renders it shows the rate but says "too few to judge".
- Below that: the ten events as a funnel (each as a share of renders) and where the Book clicks came from.

**Tests:** 3 new (`tests/preview-events.test.ts`): the ten events match the SQL constraint, the browser-only
list, and the red/ok/too-few thresholds. `npm test` 134/134; both typechecks clean.

## Database (applied 2026-11-10, project "Atlas Engine Reward")

Applied with your OK, in order, all additive (new columns, tables and one function; nothing dropped or rewritten):
`cp242_preview_progress`, `cp243_lead_sequence`, `cp244_preview_events`. Checked afterwards:
- the 8 new `app_previews` columns exist;
- `lead_sequence_steps` holds the 10-step schedule;
- no old emails had been edited, so there was nothing to carry over, and no preview was mid-sequence;
- `record_preview_event` counts and merges correctly (tested inside a rolled-back transaction, 0 rows left);
- `anon` can't call it.

The security advisor's only notes on them are "RLS on, no policies", which is intended: they're service-role
only, like `lead_email_steps`. The live site still runs the old code, which ignores all of this until the
branch is deployed.

## To ship steps 2-7

1. Review and merge branch `lead-magnet-audit` (one commit per step, 2-7). Both apps deploy: venues (www) and medspa (med.).
2. After deploy, the cron runs the new sequence. Sending stays off until `LEAD_NURTURE_SEND=1` (+ `MAIL_POSTAL_ADDRESS`)
   and `PREVIEW_SMS_SEND=1`. Until then every step shows as "would send" in Follow-through.
3. Your calls, from earlier steps: SMS consent capture (step 6), the setup price $297 vs $500 and checkout on/off
   (step 4), the 45 s desk video (step 4), the Meta campaign re-learning on the new "Lead" (step 3), A2P opt-in wording (step 3).
4. Not verified anywhere yet: the pages in a browser with live data, a real build's time to first paint, a real
   Twilio reply, a real booking end to end. Worth a staging pass before ads point at it.
