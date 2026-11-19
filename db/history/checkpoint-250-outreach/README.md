# CP-250 · Outreach v1 (Atlas's own cold email to med spas)

Admin → **Outreach** (`/agency/outreach`, agency_admin only). Find med spas, read their sites, Claude writes email 1, you approve it, then a 3-step sequence runs at a small daily cap. Replies, bounces and unsubscribes stop it. It's for Atlas's own sales, not a client feature.

**Status: SQL applied to production 2026-11-18 (migration `cp250_outreach`). Sending OFF.** Nothing goes out until `OUTREACH_SEND=1` is set on Vercel.

## What's in this folder
- `cp250_outreach.sql`: 7 tables (campaigns, leads, messages, replies, steps, settings, suppressions). All are service-role only (RLS on, no policies), and it's safe to re-run. It seeds the 3 steps and the settings row (cap 5/day, Mon–Fri, 8:00–16:00 in the spa's local time). Undo is at the top of the file.

## How it works
| Piece | Where |
|---|---|
| Find: Google Places Text Search ("med spa in Fresno, CA"), CSV import, manual add | `lib/outreach/places-search.ts`, Find tab |
| Read: home page + up to 2 contact/about pages via the CP-232 SSRF guard; emails from `mailto:`, text and Cloudflare-protected addresses; MX check | `lib/outreach/enrich.ts` |
| Write: Claude (`ANTHROPIC_MODEL`, effort low, zod schema) writes email 1 from their site. No links, stats, brand names or medical claims. Falls back to the template | `lib/outreach/write.ts` |
| Review: every email 1 waits for Approve / Edit / Redraft / Skip / Test to me | Review tab |
| Send: Gmail SMTP from the outreach mailbox, plain text, follow-ups threaded as replies, List-Unsubscribe headers, postal address + opt-out line in every email | `lib/outreach/mailer.ts` |
| Engine: cron every 5 min. Inbox → booked check → read 2 new sites → due follow-ups → **one** send (window, daily cap, random 4–12 min gap, claim-before-send) → bounce guard (>5% over 7 days pauses) | `lib/outreach/engine.ts`, `/api/outreach/tick` |
| Inbox: IMAP read-only, matches by In-Reply-To / sender / domain. Replies are sorted (interested, not now, not interested, unsubscribe, out of office) and stop the sequence | `lib/outreach/inbox.ts`, Inbox tab |
| Unsubscribe: signed link, takes effect at once, adds to do-not-contact | `/api/outreach/unsubscribe` |
| Booked: a lead whose email shows up in `landing_demo_requests` / `landing_leads` → Booked | engine step 2 |

**Why not Resend:** Resend's Acceptable Use Policy only allows mail to people who opted in. A suspension would also stop patient and lead emails. Cold email therefore goes out from its own mailbox on its own domain.

## Env vars (atlas-rewards on Vercel)
| Var | Value |
|---|---|
| `OUTREACH_SMTP_USER` | `andrew@getatlasengine.com` (the new mailbox) |
| `OUTREACH_SMTP_PASS` | Google app password (Google Account → Security → 2-Step Verification → App passwords) |
| `OUTREACH_FROM` | optional, e.g. `Andrew Montano <andrew@getatlasengine.com>` (the From name in Settings is used otherwise) |
| `OUTREACH_SEND` | `1` **only after warm-up**. Unset = dry run |
| `MAIL_POSTAL_ADDRESS` | already used by CP-238; must be a real mailing address (a PO box or registered agent works) |
| `GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET` | already set |

Optional: `OUTREACH_SMTP_HOST/PORT`, `OUTREACH_IMAP_HOST/PORT` (defaults are Gmail).

## Domain, DNS and warm-up (Andrew)
1. **Buy `getatlasengine.com`** (it was available on 2026-11-18). Keep it separate from atlas-engine.app so cold email never touches that domain's reputation. Set the domain's website to redirect to https://www.atlas-engine.app, so people who look it up land on the real site.
2. **Google Workspace** on that domain (Business Starter): one mailbox, e.g. `andrew@getatlasengine.com`. Set a profile photo and the same signature as in Outreach → Settings.
3. **DNS at the registrar:**
   - **MX:** Google's (`smtp.google.com`, priority 1), as Workspace setup shows.
   - **SPF:** TXT `@` = `v=spf1 include:_spf.google.com ~all`
   - **DKIM:** Admin console → Apps → Gmail → Authenticate email → generate a 2048-bit key → add TXT `google._domainkey` → click *Start authentication*.
   - **DMARC:** TXT `_dmarc` = `v=DMARC1; p=none; rua=mailto:andrew@getatlasengine.com`. Move to `p=quarantine` after a few clean weeks.
   - Check with https://www.mail-tester.com (aim for 9+/10) and Google Postmaster Tools.
4. **Warm-up (2–3 weeks, before `OUTREACH_SEND=1`):** use the mailbox like a person. Send 5–10 real emails a day to people who'll reply (friends, your own accounts, existing contacts), reply back, and pull anything that lands in spam out of spam. Then turn sending on and ramp the daily cap in Settings: **week 1: 5/day → week 2: 10 → week 3: 15 → week 4+: 20**, max 30. If bounces pass 5%, the engine pauses itself.
5. **App password + check:** create the app password, add the env vars, redeploy, then Outreach → Settings → *Check mailbox* (it logs in, sends nothing). Use *Test to me* on a draft to see the real email.

## Legal checklist (CAN-SPAM; keep the volume small)
- Honest From (your name), honest subject (no fake "Re:" on email 1; follow-ups are real replies in the thread).
- The postal address in every email (`MAIL_POSTAL_ADDRESS`; the footer shows a warning if it's missing).
- A working opt-out in every email: the signed link (one click, no login) plus "reply no thanks". It takes effect at once and the link doesn't expire. The law allows 10 business days to honor it.
- Only business contact addresses a spa publishes on its own site (or that you're allowed to use). The reader skips sites with a "don't harvest addresses" notice.
- California §17529.5: no misleading headers or subjects.
- No cold texts (TCPA), and the Twilio A2P campaign is opt-in only. Phone stays manual (the phone number is in each lead's drawer).
- Google Places terms: a lead keeps the place_id plus what we read from the spa's own site.

## Rollout
1. ~~Review + apply `cp250_outreach.sql`~~ done 2026-11-18. The tables are additive: nothing existing changed, and the app on main doesn't read them.
2. Merge + deploy (adds the `/api/outreach/tick` cron, every 5 min).
3. Search a city, approve a few drafts while sending is **off**: the Overview shows "would send N".
4. Domain + DNS + warm-up (above), then set `OUTREACH_SEND=1`, start at cap 5.

## Later (not in v1)
Paid email finders (Hunter/Apollo) and verification, several mailboxes in rotation, AI-drafted replies, signals (new locations, hiring), LinkedIn, A/B tests. Open/click tracking is left off on purpose because it hurts deliverability.
