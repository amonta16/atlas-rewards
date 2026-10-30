# CP-205 · Funnel review fixes: 48-hour area hold, offer stack, placeholder video

**Live after push:** https://www.atlas-engine.app/medspa · https://www.atlas-engine.app/medspa/start

## What changed (from the Hormozi-style funnel review, Oct 8 2026)
| Fix | Where |
| --- | --- |
| **Placeholder video**: the Atlas logo animation plays once (muted, inline) when the frame scrolls into view, then the logo lifts and an end card rises: "coming soon" + the next step. Mobile is a 4:5 crop. Replaces the empty placeholders on the landing hero and the pre-call page. | `components/medspa/intro-video.tsx`, `public/landing/atlas-intro.{mp4,webm}` + 2 posters |
| **48-hour area hold, contact first**: an open zip asks for name, practice, email and mobile to hold the area. The hold is real: other practices within the radius see "held until …" and can only join the waitlist. Booking extends it to the call + 48 h; not a fit / lost / no-show releases it. | `app/api/landing/hold/route.ts` (new), `lib/landing/territory.ts`, `components/medspa/medspa-funnel.tsx` |
| **Speed to lead**: Andrew gets "CALL NOW: … is holding …" the moment a hold is placed (with a tel: link), and "QUALIFIED, call now" after the gate. | hold + lead routes |
| **3 number questions** instead of 6 (no practice type, no current-recall question; the estimate assumes some manual recall). | `medspa-funnel.tsx`, `DEFAULT_RECALL_ID` |
| **About you = 2 taps** (role, practice today). Contact came with the hold. Website / booking software / treatments are optional, framed as "help Andrew build your app preview". | `medspa-funnel.tsx`, `app/api/landing/lead/route.ts` (updates the held lead) |
| **Named, stacked offer**: "The Founding Partner Program", every setup deliverable listed, $1,000 struck → $500, on the results screen and the landing offer section. | `SETUP_STACK`, `OFFER_NAME` |
| **Price next to the estimate**: set `MONTHLY_PRICE` and the results show "Atlas is $X/month · about N× back" (and the offer/FAQ show the price). Null = "quoted on your call". | `MONTHLY_PRICE` |
| **Your app, built before the call**: on the calendar, the confirmation email and a new "Andrew is building {practice}'s app" section on the pre-call page. | `TimePicker`, demo-request email, `precall-page.tsx` |
| **Closer calls**: the calendar offers only the first 4 days with open times. | `BOOKING_WINDOW_DAYS` |
| **Follow-up sequence** (was one email): hold confirmation right away, then 3 h ("your area is held"), 24 h ("about 24 hours left"), 4 h before the hold ends ("ends tonight"). Stops when they book or aren't a fit. | `app/api/landing/reminders/route.ts`, `FOLLOWUPS` |

## Needs you
1. **Build the app preview before each call.** The funnel now promises it (calendar, confirmation email, pre-call page). If that's not doable for every call, turn the copy down in `SETUP_STACK[0].detail`, the TimePicker card and the pre-call section.
2. **Set `MONTHLY_PRICE`** in `lib/landing/medspa-funnel.ts` to show the return multiple.
3. **Call within 5 minutes** of every "CALL NOW" email.
4. **SMS** (show-up rate) still needs Twilio or similar; not built.
5. Record the real videos; paste the embeds in `LANDING_VSL.embed` / `PRECALL_VIDEO.embed` and the logo animation steps aside.

## SQL (applied to production Oct 8 2026; safe to re-run)
`cp205_medspa_hold.sql`: `landing_leads.role` nullable; new `hold_expires_at`, `qualified_at`, `followups`, `followup_last_at`; index on holds.

## Verified
`tsc --noEmit` 0 errors, `next build` green. Playwright at 1440 and 390 px: landing (video plays → end card), offer stack, zip → hold → held timer → 3 numbers → results → 2 taps → calendar (4 days) → booked → pre-call page; area held by another practice → waitlist. No console errors, no horizontal overflow.
