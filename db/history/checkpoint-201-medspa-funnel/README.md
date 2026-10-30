# CP-201 · /medspa funnel, rebuilt (brand-site look + every funnel step wired)

**Live after push:** https://www.atlas-engine.app/medspa

## What changed
**Design.** /medspa now uses the same look as atlas-engine.app: white glass and ocean blue,
Manrope, the `.site` tokens in `app/site.css`, the same buttons, ocean bands, phone frame,
GSAP scroll moments, Compare table and reviews band. The old "porcelain" version
(`components/medspa/medspa-page.tsx`, `app/medspa/medspa.css`) is kept but unused.
No nav links: logo + one button, so ad traffic can't wander off.

**The funnel, step by step**
| Step | Where | What happens | Meta signal |
| --- | --- | --- | --- |
| Ad click | /medspa?utm_… | UTMs and `fbclid`/`_fbp`/`_fbc` are kept for the lead | PageView |
| Build your app | modal, 3 taps | name, color/logo, the phone re-skins live | — |
| Your numbers | modal, 4 taps | visits, visit value, rebook rate, current recall → estimate | — |
| **Step 1: qualify** | modal form | name, role, practice, stage, email, mobile, website/IG, booking software, treatments, "what would make this worth it" → `POST /api/landing/lead` | — |
| **The gate** | server | `qualify()` in `lib/landing/medspa-funnel.ts`. Owner / co-owner / manager of an open, independent practice = qualified | qualified: **Lead** (Pixel + Conversions API, same event_id). Not a fit: **nothing** |
| Not a fit | modal | kind screen + one nurture email (estimate + demo app). No calendar. | — |
| Pick a time | modal | Andrew's real availability (Google Calendar). Server re-checks the gate. | **Schedule** (Pixel + CAPI) |
| Pre-call page | /medspa/confirm/&lt;token&gt; | "Your call isn't confirmed yet": short video, **Yes, I'll be there**, add to calendar, what to have ready | custom `call_confirmed` |
| Reminders | email, cron every 15 min | 24 h before (with the confirm link if not confirmed), 2 h before | — |
| Didn't book | email, once | qualified but no time picked after 3 h → "your times are still open" → /medspa?lead=&lt;id&gt; opens straight on the calendar | — |
| After the call | email to Andrew | 30 min after the call ends: one-tap **Showed / No-show / Paid / Not a fit** links (signed) | Paid → **Purchase** (CAPI) |

Andrew also gets an email for every lead (qualified or not) and for every confirmation.

## Before ads run
1. **Vercel env** (Production): `META_CAPI_TOKEN` (Events Manager → Pixel → Settings → Conversions API → Generate access token).
   `NEXT_PUBLIC_META_PIXEL_ID`, `RESEND_API_KEY`, `CRON_SECRET` and the Google Calendar vars from CP-189 should already be set.
   Optional: `LANDING_LINK_SECRET` (any long random string; falls back to `CRON_SECRET`), `META_PURCHASE_VALUE` (default 500).
2. **Optimize the campaign on Lead** (qualified only) at first; switch to **Schedule** once it gets ~50/week per ad set.
3. **Record the pre-call video** (2–3 min) → paste the Vimeo embed into `PRECALL_VIDEO.embed`. Until then the page shows the written version.
4. Optional: set `PRICE_BEFORE_CALL` to say the price before the call (filters for buyers). Null = "quoted on your walkthrough".
5. Turn off empty review slots (`SHOW_REVIEW_SLOTS` in `lib/landing/site-reviews.ts`) once you want only real reviews showing.
6. Test: go through /medspa with your own email as Owner → Lead in Events Manager (Test events + `META_TEST_EVENT_CODE`), book a slot → Schedule, open the pre-call page, tap confirm. Then once as "Front desk or staff" → no calendar, nurture email, no Lead.

## Tuning (all in `lib/landing/medspa-funnel.ts`)
`ROLES`, `STAGES` (`qualifies: true/false`), `VISIT_BAND_QUALIFIES` (all bands qualify for now; set `v1` to false to send "Under 100 visits" to nurture), `BOOKING_SYSTEMS`, `TREATMENT_OPTIONS`, `PRECALL_VIDEO`, `PRICE_BEFORE_CALL`, `PRECALL_PREP`, `REMINDERS` timings.

## SQL (already applied to production on Oct 7 2026; safe to re-run)
`cp201_medspa_funnel.sql`: new `landing_leads` table (RLS on, server-only) and new nullable columns on `landing_demo_requests`
(`lead_id, confirm_token, confirmed_at, video_pct, precall_viewed_at, reminder_early_at, reminder_late_at, outcome_prompt_at, outcome, outcome_at, paid_value, schedule_event_id, fbp, fbc`).

## Files
New: `lib/landing/medspa-funnel.ts`, `lib/landing/meta-capi.ts`, `lib/landing/funnel-sign.ts`,
`app/api/landing/{lead,precall,reminders,outcome}/route.ts`, `app/medspa/confirm/[token]/page.tsx`,
`components/medspa/{medspa-funnel,medspa-funnel-page,precall-page}.tsx`.
Changed: `app/medspa/page.tsx`, `app/api/landing/demo-request/route.ts` (gate + token + CAPI Schedule; venues bookings unchanged),
`lib/landing/analytics.ts` (lead_qualified → Lead with eventID; lead_unqualified sends Meta nothing), `components/site/site-page.tsx`
(exports Compare, ReviewsBand, AppShot), `vercel.json` (reminders cron).

## Verified
Full `tsc --noEmit` = 0 errors; `next build` green. Clicked through the whole funnel at 1440px and 390px (qualified path → calendar →
pre-call page; not-a-fit path → nurture), no console errors, no horizontal overflow.
