# CP-237 · Preview funnel: 3D phones, build ordering, front-desk email, A2P texting

2026-11-08. Branch `instant-preview`. No SQL in this checkpoint (no schema change). Committed, not pushed or deployed.

## 1. 3D phones on /medspa/app
- `apps/venues/public/landing/medspa-trio/`: `trio.webm` (VP9, 651 KB), `trio.mp4` (H.264, 490 KB), `trio-poster.webp` (52 KB).
  Made from `Claude Resolve Editor/projects/medspa-trio-3d/out/medspa-trio-features.mp4` (1920x1080, 25 fps, 6 s seamless loop):
  `crop=1560:960:180:100,scale=1280:-2` → 1280x788. SSIM against the source crop: 0.992 (MP4) / 0.994 (WebM).
- Replaces the single phone image on the landing (search) step. `autoplay muted loop playsinline`, poster for reduced motion,
  `mix-blend-mode: multiply` so the video's near-white edge disappears into the page.
- Layout: three grid items (text, video, SMS disclosure). On phones the video sits right under the search; on desktop it spans
  the right column at 122% width (687 px at 1440).
- It shows three real practices from the funnel (St. George Med Spa, MedSpa SLO, Spa By the Bay). Andrew OK'd showing their
  names publicly on 2026-11-08.
- The filler photo on the right phone carries an "After" label from the practice's own site. Flagged against the
  before/after rule; Andrew chose to keep it as is (2026-11-08).

## 2. "Complete" only after the build animation
Before: the contact step's chip said "<spa>'s app is built ✓" as soon as the server build finished (instantly for a spa searched
before), and the "your app is ready" email went out as soon as the build finished, usually while the owner was still in the quiz,
so the inbox and the preview link said "ready" before the funnel's scan animation had played.
Now:
- The chip always says "Building <spa>'s app…". "Ready" belongs to the end of the finishing step (≥ 22 s scan AND real build status).
- `/api/preview/contact` → `sendPreviewEmailIfAbandoned`: waits up to 255 s; if the owner finishes the quiz it sends nothing,
  otherwise (they stopped partway) it sends the CP-235 "your app is ready" email. `maxDuration` 120 → 300.
- `/api/preview/answers` → `sendWelcomeEmail` (+ optional text) in `waitUntil`, after 26 s and the real build status. First finish only.

## 3. Welcome email with the front desk
`lib/preview/email.ts` `welcomeEmail()`: their logo and banner photo, "{First}, your app is ready.", a brand-color
**Open my front desk** button (`med.atlas-engine.app/<slug>/desk`), a small desk panel whose four rows deep-link into the desk
(`?view=builder` treatments/rewards, `?view=memberships`, `?view=offers`), "Open <spa>'s app", and the walkthrough link.
Footer: preview saved until <date>, nothing reaches patients until they go live. Table layout, inline styles, all row values escaped.
The finishing step's ready screen also links "Open my front desk".

## 4. The preview's front desk (`apps/medspa`)
Before: `/<pv-slug>/desk` showed "No desk access" for every preview (`getStaff` returned no-access for previews).
Now `getStaff` returns a preview manager ("You (preview)") for preview clinics. The desk runs in the demo mode the example
clinic already uses (clinic id `example` → `demoDeskApi`, client-side data, nothing saved, server desk routes never called).
A banner says it's a preview and links to the walkthrough; the sidebar says "preview, nothing is saved". The App Builder shows
the preview's own logo. The desk page is now `noindex`.
Limitation: changes in the preview desk don't persist (reload resets them), and Home shows the demo numbers (412 patients etc.),
same as /demo/desk.

## 5. Texting from +1 775 252 4211 (Twilio), off by default
How SMS worked before this checkpoint:
- "Text me my app" = an `sms:` link to `PREVIEW_SMS_NUMBER` (atlas-medspa); nothing replied to those texts.
- Desktop fallback (phone field on /p/<slug>) → GHL webhook only.
- 6-digit code = Twilio Verify (`TWILIO_ACCOUNT_SID/AUTH_TOKEN/VERIFY_SERVICE_SID`, `PREVIEW_VERIFY_PHONE=1`), only with the
  informational consent box. Verify uses Twilio's own senders, not this number.
- Walkthrough reminders are email only (`/api/landing/reminders`). No SMS reminders exist.
New:
- `lib/preview/twilio-sms.ts`: `sendSms()` via the Messages API (`MessagingServiceSid` if `TWILIO_MESSAGING_SERVICE_SID` is set,
  else `From` = `PREVIEW_SMS_NUMBER`). Everything is gated on `PREVIEW_SMS_SEND=1`. `textPreviewLink()` texts the app + desk
  links after the funnel's animation, only to the row's number and only with `contact_consent_at` (informational box).
- `POST /api/preview/sms-inbound`: Twilio's incoming-message webhook. Checks `X-Twilio-Signature` (HMAC-SHA1 with the auth
  token; verified against Twilio's documented example). A text containing `pv-…` gets its app + desk links (TwiML reply), the
  preview is marked claimed and GHL is told; other texts get "Andrew will reply shortly" and are emailed to Andrew.
  STOP/START/HELP words get no reply (Twilio's opt-out handles them). 5 replies per sender per hour. While sending is off it
  replies with an empty `<Response/>`.
- Message: `Atlas Engine: <spa>'s app is ready: <app url> Your front desk: <desk url> Reply STOP to opt out.` (~200 chars, 2 segments).
- Env: see docs/MANUAL_STEPS.md (Instant app preview section).

## Checks run
- `tsc --noEmit`: apps/venues and apps/medspa, green.
- `next build`: apps/venues and apps/medspa, green.
- Playwright on the production builds (funnel APIs mocked, build reported "ready" from the first poll, the worst case for the old
  bug), at 390x844 and 1440x900: video plays (WebM), no horizontal scroll; contact chip says "Building…"; nothing says ready 8 s
  into the finishing step; ready screen at ~23 s; "Open my front desk" links to `/<slug>/desk`.
- Preview desk against the real Supabase (anon key) for `pv-tirage-medspa-smhd5u`: 200 at both widths, banner shown,
  `?view=builder` opens App Builder.
- sms-inbound: unsigned and forged signatures → 403; signed STOP → empty TwiML; signed text while sending is off → empty TwiML.
- Welcome email rendered and checked at 390 px.
Not done: no real SMS or email was sent; the live contact/answers routes weren't run against the database (no service key locally).

## Part 2 (same day): website video, the offer, Dermis-style hand-off
- **Video on the website**: `components/landing/trio-video.tsx` (shared) and `medspa-apps-band.tsx`, a white band
  "Your app, built from your own website." with a "See my app" button into /medspa/app (UTMs kept). On /medspa
  (right after the hero, before Assurances) and /med-spas (right after Showcase). Plays at 390 and 1440, no side scroll.
- **The offer, stated plainly** (all numbers from `lib/landing/medspa-funnel.ts`):
  · /medspa/app landing: one line under the checks ("The preview is free. If you want it live, our first 10 med spas
    pay a $500 setup ~~$1,000~~ and one flat monthly plan. One med spa per 10-mile area.").
  · Ready screen: an offer card (Founding Partner Program, $500 vs $1,000 setup, monthly quoted on the walkthrough,
    the six setup items, the three guarantees, area held 48 h or waitlist) with "Book a 15-min walkthrough".
  · med.atlas-engine.app/p/<slug>: the same card before the buttons. Its numbers live in `apps/medspa/lib/offer.ts`,
    a mirror of the venue file. **Change both when the offer changes.**
- **Finishing step, Dermis-style** (from Dermis's onboarding screenshots: Optimizing → "{Name}, I'm almost done…" → OR →
  "Take Dermis on the go" → a prefilled message; "Don't leave me!" on exit):
  · "Optimizing… N%" for the first ~3 s, then "{First}, we're almost done…", the phone filling in, a progress bar,
    "Est. time remaining: N sec" and the current step.
  · OR → **Take your app on the go**: on phones an `sms:` link to PREVIEW_SMS_NUMBER with
    "Hi! I'm waiting on my <spa> app (pv-…). Here's the email I used: <email>"; on desktop a QR code of the same text.
    The inbound webhook finds the pv- code and replies with the app + desk links (only once `PREVIEW_SMS_SEND=1`).
    Disclosure under it: number, "we reply with your app link", rates, STOP.
  · "Don't leave me!" bubble (and a sad phone) when they come back from another app/tab, or move the mouse to the tab bar.
  · `/medspa/app` reads `PREVIEW_SMS_NUMBER` at build time (static page). Without it, the OR block is hidden.
- Checked (production builds, funnel APIs mocked): iPhone UA at 390 → "Optimizing… 6%", "Andrew, we're almost done…",
  "Est. time remaining: 16 sec", the sms: link with the slug, "Don't leave me!" on return, ready screen with the offer;
  1440 → the same with the QR code. /p/<slug> offer card at both widths (Tirage preview, real data). tsc + next build green.
- Vercel (checked by name only, values are hidden): atlas-rewards has TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
  PREVIEW_SMS_NUMBER, TWILIO_MESSAGING_SERVICE_SID; atlas-medspa has PREVIEW_SMS_NUMBER. PREVIEW_SMS_SEND is not set yet.
