# CP-100 — Landing page redesign + CRO build

Replaces the CP-2.5 placeholder at `atlas-engine.app` with a full conversion page
aimed at **local business owners** (gyms, salons, restaurants, med spas), plus a
capped **agency waitlist** and an in-house **demo-request** flow.

## Run it

```bash
cd checkpoint-02-brand-engine/atlas-rewards-app
npm install            # adds @fontsource-variable/inter (self-hosted Inter, no Google Fonts at build)
npm run dev            # http://localhost:3000  and  http://localhost:3000/book-demo
```

Then apply `cp100_landing.sql` in the Supabase SQL editor (idempotent). Without it
the page still renders; only the demo form / waitlist POSTs will fail and the
waitlist shows `0 / 50`.

Optional env (Vercel): `RESEND_API_KEY` (lead emails to andrew@atlas-engine.app),
`LANDING_FROM_EMAIL` (default `Atlas Engine <hello@atlas-engine.app>`).
`SUPABASE_SERVICE_ROLE_KEY` (already set) is required by the two API routes.

## Files

**Created**
- `app/book-demo/page.tsx` — standalone demo-request page (for ads / QR / email signature)
- `app/api/landing/demo-request/route.ts` — POST → `landing_demo_requests` + email
- `app/api/landing/waitlist/route.ts` — GET count / POST join (cap 50, dedupe by email)
- `components/landing/*` — 27 section/primitive components (see `landing-page.tsx` for order)
- `lib/landing/config.ts` — every swappable constant (VSL, CTA target, email, cap, anchors)
- `lib/landing/analytics.ts` — `track()` fan-out to PostHog / GA4 / Plausible / Meta / dataLayer
- `lib/landing/industries.ts` — the five demo brands shown in the phone
- `lib/landing/faqs.ts` — FAQ copy (also feeds FAQPage JSON-LD)
- `lib/landing/font.ts` — self-hosted Inter via next/font/local
- `lib/landing/notify.ts` — Resend email helper, IP hash, validation
- `public/videos/README.txt` — where the VSL goes
- `checkpoint-100-landing-redesign/cp100_landing.sql` — tables + RLS + count RPC

**Modified**
- `app/page.tsx` — now renders `<LandingPage/>` + SEO metadata + JSON-LD
- `app/globals.css` — appended `.lp-*` landing styles (scoped; nothing else touched)
- `package.json` — `+ @fontsource-variable/inter`

Nothing under `app/[business]`, `app/(agency)`, `/login`, middleware, or existing
API routes was changed. `/book-demo` and `/api/landing/*` are root-domain routes
(the middleware leaves `/api/*` alone; `/book-demo` only exists on the root host).

## Installing the VSL

1. Put the file at `public/videos/atlas-vsl.mp4` — H.264 MP4, 1920×1080, AAC audio, ideally ≤ 40 MB
   (export at ~5–8 Mbps). Poster: `public/videos/atlas-vsl-poster.jpg`, 1920×1080, < 300 KB.
2. In `lib/landing/config.ts`, set:
   ```ts
   export const VSL = { src: "/videos/atlas-vsl.mp4", poster: "/videos/atlas-vsl-poster.jpg", embed: null, ... }
   ```
3. That single object controls the player (`components/landing/video-player.tsx`).
   Poster-first, `preload="metadata"`, native controls, no autoplay, progress
   events at 25/50/75/100 %.
4. External hosting instead: leave `src: null` and set `embed` to
   `https://www.youtube.com/embed/ID`, `https://player.vimeo.com/video/ID`, or
   `https://fast.wistia.net/embed/iframe/ID`. The iframe loads only after the
   poster is clicked, so it costs nothing on first paint.

If you upload the final video into a session, it can be installed for you.

## Analytics

Events fired (all via `track()` in `lib/landing/analytics.ts`):
`hero_cta_clicked`, `nav_cta_clicked`, `demo_clicked`, `demo_requested`, `vsl_played`,
`vsl_25_percent`, `vsl_50_percent`, `vsl_75_percent`, `vsl_completed`,
`pricing_viewed`, `final_cta_clicked`, `faq_opened`, `interactive_demo_used`
(`demo: industry_picker | prize_wheel | streak`), `waitlist_joined`.

Hook up a provider by adding its snippet to `app/layout.tsx` (or a `<Script>` in
`app/page.tsx`); `track()` auto-detects `window.posthog`, `gtag`, `plausible`, `fbq`
and always pushes to `window.dataLayer` for GTM. Recommended start: **PostHog**
(events + session replay in one) or **GA4 + Microsoft Clarity** (free heatmaps —
Clarity needs only its snippet, no events). Map `demo_requested` as the
conversion in Google Ads / Meta.
