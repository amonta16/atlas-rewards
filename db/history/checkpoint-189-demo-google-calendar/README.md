# CP-189 · Demo booking on Andrew's Google Calendar

Andrew: "We'll use Google Calendar (Workspace admin account, no new spend). I'm the only one doing sales."

## What changed
- **Real availability.** `GET /api/landing/availability` = Andrew's demo hours (`WEEKLY_HOURS` in `lib/landing/availability.ts`) minus everything busy on his Google Calendar. Classes, practice visits, anything on the calendar blocks slots automatically. 20-min calls, 10-min buffer, 4 h minimum notice, 21 days out.
- **Real booking.** `POST /api/landing/demo-request` re-checks the slot against free/busy (409 → "someone just booked that time", the UI drops it and sends them back to the times), saves the lead, creates the event on andrew@atlas-engine.app **with a Google Meet link and the prospect as a guest**. Google emails her the invite; she can accept it into her own calendar.
- **Confirmation she can't miss.** On screen: "You're booked", the time in her timezone, the Meet link, "invite on its way to <email>", Add to Google Calendar. Plus our own plain confirmation email (Resend) from hello@ with Reply-To andrew@.
- **Andrew's side.** The event lands on his calendar (email reminder 24 h before, popup 30 min before) with name, business, phone, the app choices from the builder and the ad source in the description. If the calendar call fails he gets a "⚠ Calendar invite FAILED" email so no booking is lost.
- **Meta.** A booking with a time now fires the standard `Schedule` event (and still `Lead`). Optimize the campaign on **Schedule**.
- Columns added to `landing_demo_requests`: `calendar_event_id`, `meet_url`, `calendar_status`.

Until the env vars below are set, everything still works: slots come from `WEEKLY_HOURS` only, the lead is saved and emailed, and `calendar_status = not_configured`.

## One-time setup (≈15 minutes, free)
1. **Google Cloud** (console.cloud.google.com, signed in as andrew@atlas-engine.app) → New project "atlas-booking" → APIs & Services → **Enable "Google Calendar API"**.
2. IAM & Admin → **Service accounts → Create** "atlas-booking" (no roles needed) → Keys → **Add key → JSON** → download.
3. On the service account's details page copy its **Unique ID (client ID)**.
4. **Google Admin** (admin.google.com) → Security → Access and data control → API controls → **Manage Domain Wide Delegation → Add new**: Client ID = that number, OAuth scope = `https://www.googleapis.com/auth/calendar` → Authorize.
5. **Vercel** → atlas-rewards → Settings → Environment Variables (Production + Preview):
   - `GOOGLE_SA_CLIENT_EMAIL` = `client_email` from the JSON
   - `GOOGLE_SA_PRIVATE_KEY` = `private_key` from the JSON (paste as-is, including the `\n`s)
   - `GOOGLE_CALENDAR_USER` = `andrew@atlas-engine.app`
   - optional `GOOGLE_BUSY_CALENDARS` = other calendars that should block time (e.g. your Cal Poly schedule calendar ID, shared to andrew@ with "See free/busy")
   - make sure `RESEND_API_KEY` is set (it powers the prospect confirmation)
6. Redeploy. Test: book a slot on /medspa with your personal email → event on your calendar with Meet, invite in your inbox, confirmation email, and that slot gone from the picker.

## To change your hours
Edit `WEEKLY_HOURS` in `lib/landing/availability.ts` (0 = Sunday … 6 = Saturday, ranges in Pacific time, halves allowed: `[[9, 12], [13.5, 18]]`). Put classes on your calendar and they're excluded without touching code.

## Files
`lib/google-calendar.ts` (new) · `app/api/landing/availability/route.ts` (new) · `app/api/landing/demo-request/route.ts` · `lib/landing/availability.ts` · `lib/landing/notify.ts` · `lib/landing/analytics.ts` · `components/landing/booking-calendar.tsx`
