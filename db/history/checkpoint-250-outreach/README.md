# CP-250 · Outreach v1 (Atlas's own cold email to med spas)

Admin → **Outreach** (`/agency/outreach`, agency_admin only). Find med spas, read their sites, Claude writes email 1, you approve it, then a 3-step sequence runs at a small daily cap. Replies, bounces and unsubscribes stop it. It's for Atlas's own sales, not a client feature.

**Status: CP-250 SQL applied to production 2026-11-18 (migration `cp250_outreach`). CP-250b SQL applied 2026-11-22 (migration `cp250b_outreach_upgrades`). CP-250c SQL applied 2026-11-22 (migration `cp250c_instagram_step`). Sending OFF.** Nothing goes out until `OUTREACH_SEND=1` is set on Vercel.

## What's in this folder
- `cp250_outreach.sql`: 7 tables (campaigns, leads, messages, replies, steps, settings, suppressions). All are service-role only (RLS on, no policies), and it's safe to re-run. It seeds the 3 steps and the settings row (cap 5/day, Mon–Fri, 8:00–16:00 in the spa's local time). Undo is at the top of the file.
- `cp250b_outreach_upgrades.sql` (applied 2026-11-22): new columns for fit, the opener and notes, plus the `later` status and the `outreach_tasks` table. It also updates the seeded sequence, but only where it still matches the seed: step 1 gets `{opener}`, step 3 becomes a call, and "Last note" moves to step 4. It's additive and safe to re-run. Undo is at the top.
- `cp250c_instagram_step.sql` (applied 2026-11-22): adds the lead's `instagram` handle and `ig_dm` draft, the `instagram_dm` step and task type, and the Sent / Replied / No IG outcomes. It puts the IG step at day 2 only where the sequence still matches the CP-250b seed. It's additive and safe to re-run.

## CP-250b · upgrades after comparing with Origami (founder walkthrough, 2026-11-22)
| Upgrade | What it does | Where |
|---|---|---|
| Fit check | The same Claude call that writes the email also rates each spa as good fit, unsure or not a fit, with a one-line reason. Chains and franchises, surgery-first practices and salons count as not a fit. Review shows good fits first and can filter by fit; "Skip all not a fit" clears the rest. Leads gets a Fit column and filter. | `write.ts` `readSpa`, Review, Leads |
| Opener + your pitch | The default `write_mode = 'opener'`: Claude writes only the personal first line (`{opener}`) and the rest is your template word for word. Review shows the line Claude wrote. Choose "The whole email" to get v1's behavior back. Without AI there's an honest fallback line: "I came across X while looking at med spas in Y." | Settings → How Claude writes email 1 |
| Notes → apply to all | Standing "notes for every draft" go into every draft, and Redraft takes a one-off note. "Redraft all" re-reads and rewrites every first email you haven't edited by hand. | Settings, Review |
| Later | A "not now" reply automatically sets the status to Later, with a re-contact date 60 days out. You can also set Later by hand from the drawer with any date. Leads come up on To-do when their date arrives, with Open thread (Gmail), Followed up and 30 more days. | engine inbox, To-do |
| Call step | A step can be a phone call instead of an email. When it's due, the spa shows up on To-do with its number, its local time and the script, and you log the outcome: talked, voicemail, no answer, not interested or booked. "Not interested" and "booked" stop the sequence; the others log a note and the emails carry on. A call step is skipped when there's no phone number. Add email and Add call append steps, up to 10. | `outreach_tasks`, To-do, Settings |
| Already in Atlas | Before reading a site, the engine skips any spa whose name or phone matches an Atlas business (client or demo app), or whose website already made a /medspa preview or became a lead. | `engine.ts` `alreadyInAtlas` |

Also fixed: Redraft could overwrite an email that had already been approved or sent. It now refuses.

Deliberately not copied from Origami: LinkedIn automation (against LinkedIn's terms and risks the account), paid multi-provider data credits, many mailboxes, warm-up pools (Google discourages them), a chat agent or knowledge base, and CRM integrations or an API.

## CP-250c · a manual Instagram DM step (2026-11-22)
Andrew chose Instagram over LinkedIn for med spas. Nothing is sent to Instagram automatically, because automated DMs break Instagram's terms and risk the account. The step works like the call step:
- **Handle:** reading a spa's site also picks up its Instagram handle from the links on its pages, most-linked profile first. Posts and reels are ignored. You can type or fix it in the lead's drawer as `@handle` or a profile link.
- **DM:** the same Claude call that judges fit and writes the opener also drafts `ig_dm`: under 280 characters, one true detail from their site, a mention that you emailed them, and a low-effort question. No links, hashtags or emojis. The step's own text is the fallback.
- **To-do:** when the step is due, the spa shows up under *Instagram DMs* with **Message @handle** (`ig.me/m/…` opens the DM thread in the app), its Profile, the editable DM and a **Copy** button. Where the browser blocks the clipboard, Copy uses the selected text instead. You send the DM yourself from the Atlas account, then log Sent, Replied, Not interested, Booked or No IG.
- **Outcomes:** Replied, Not interested and Booked stop the emails (Not interested also adds the spa to do-not-contact). No IG clears the handle. Sent just logs a note. A spa without a handle skips the step.
- **Timing:** each step waits from the one before it, and a step skipped for a spa (no handle, no phone) keeps its place in the calendar. So a spa without Instagram still gets email 2 on day 3, not day 1.
- **Settings:** a step's type can be Email, Phone call or Instagram DM. *Add Instagram DM* appends one. DM text with a link is refused.
- **Default sequence** (`cp250c_instagram_step.sql`, only where the steps still match the CP-250b seed and nothing has been drafted or sent): email day 0 → **Instagram DM day 2** → follow-up email day 3 → call day 5 → last note day 7.

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
1b. ~~Apply `cp250b_outreach_upgrades.sql` before merging the CP-250b code~~ done 2026-11-22.
1c. ~~Apply `cp250c_instagram_step.sql` before merging the CP-250c code~~ done 2026-11-22.
2. Merge + deploy (adds the `/api/outreach/tick` cron, every 5 min).
3. Search a city, approve a few drafts while sending is **off**: the Overview shows "would send N".
4. Domain + DNS + warm-up (above), then set `OUTREACH_SEND=1`, start at cap 5.

## Later (not in v1)
Paid email finders (Hunter/Apollo) and verification, several mailboxes in rotation, AI-drafted replies, signals (new locations, hiring), LinkedIn, A/B tests. Open/click tracking is left off on purpose because it hurts deliverability.
