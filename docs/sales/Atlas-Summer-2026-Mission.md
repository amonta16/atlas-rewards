# Atlas Engine — Summer 2026 Mission

> **3-month mission · June 1 – August 31, 2026**
>
> Get the 5-pillar outreach machine running, sign our first 10 paying businesses, ship the AI Receptionist resale model, and finish the legal/ops scaffolding so we can scale without breaking.

---

## How to use this page

This is the source of truth for what every team member is doing this summer. If you're not sure what to work on today, open this page and find your name. Update your section as you complete tasks. Don't let it go stale — a dead Notion page is worse than no page at all.

**Cadence:**
- **Daily** — async check-in in #standup (what you did, what you're doing, what's blocking)
- **Weekly** — Monday team call, 30 min max, review last week's metrics + this week's targets
- **Monthly** — first of the month review, set 30-day goals

---

# 🚨 Top priority: Legal foundation

Before any of the outreach pillars matter, we have to be able to legally sign clients, collect money, and protect ourselves. This is the first 2 weeks of June.

## Legal checklist

- [ ] **Form the LLC** (Atlas Engine LLC or similar)
    - Lead: **Andrew**
    - Use Stripe Atlas, LegalZoom, or your state's online filing portal. ~$300-500 one-time.
    - Get the EIN from IRS (same day, free, online)
    - Pick state of formation — default to your home state unless there's a tax reason to use Delaware/Wyoming
- [ ] **Operating agreement**
    - Co-founder split between Andrew + Xabi documented in writing
    - Equity %, voting rights, vesting schedule, what happens if someone leaves
    - Templates: Stripe Atlas comes with one, or use Clerky.com
- [ ] **Business bank account**
    - Mercury or Relay (both free, founder-friendly)
    - Get debit cards for Andrew + Xabi
    - **Never mix personal and business money from day one**
- [ ] **Stripe account in LLC name**
    - All Atlas + AI Receptionist subscription revenue goes here
    - Connect to Mercury/Relay for payouts
- [ ] **Client services agreement template**
    - One-page MSA + per-business SOW format
    - Cover: services, payment terms (net 0 / monthly auto-debit), termination clause (30-day notice), IP ownership (data belongs to the business, code belongs to us)
    - Templates: Bonsai, HelloSign templates, or have a lawyer review one for ~$500 (worth it)
- [ ] **Privacy policy + terms of service** on atlas-engine.org
    - Required by Stripe + every app store
    - Use Termly.io or iubenda (~$10/mo) for compliant generators
- [ ] **GDPR/CCPA basics**
    - We collect customer data on behalf of businesses → make sure our agreement says they're the data controller, we're the processor
    - Cookie banner on customer apps (free via Cookiebot or self-built)
- [ ] **Insurance** (lower priority, but research it)
    - General liability + cyber liability ~$50-100/mo combined
    - Talk to Next Insurance, Hiscox, or Embroker

## Owner

| Item | Lead | Target date |
|---|---|---|
| LLC formation | Andrew | June 7 |
| Bank account opened | Andrew | June 10 |
| Operating agreement signed (Andrew + Xabi) | Both | June 14 |
| Client agreement template drafted | Andrew | June 14 |
| Privacy policy + ToS live | Andrew | June 14 |

> **Don't sign a single client before the LLC + agreement template are done.** It's tempting but every signed contract before legal exists creates risk we don't need.

---

# 👥 Team & roles

| Person | Role | Owns |
|---|---|---|
| **Andrew** | Founder · Software + Sales | Atlas codebase, agency dashboard, software-side delivery, in-person sales |
| **Xabi** | Co-founder · AI Receptionist + Ops | AI Receptionist product (GHL-based), reseller pricing model, hiring |
| **Adolfo** | Outreach lead | VA cold-calling team management, email automation execution |
| **Brayan** | Cold caller | Outbound calls, demo bookings |
| **Zahid** | Cold caller | Outbound calls, demo bookings |
| **VAs (hiring)** | Outbound + SMS | Will pick up volume on cold calling + SMS once trained |

## Weekly accountability

Every Monday at 10am Pacific. 30 min. Format:
1. Each person: 2 metrics from last week + 1 goal for this week
2. Andrew: software/product update (anything broken? anything launching?)
3. Xabi: AI Receptionist progress
4. Adolfo: outreach numbers (calls made, emails sent, demos booked)
5. Open floor: blockers

---

# 🏛️ The 5-Pillar Outreach Machine

The strategy: 5 simultaneous channels feeding the same goal — book in-person demos with local business owners. No single channel has to carry the load.

```
       ┌────────────────────────────────────┐
       │       OUTREACH MACHINE             │
       │   (goal: book in-person demos)     │
       └─────────────┬──────────────────────┘
                     │
   ┌────────┬────────┼────────┬────────┐
   │        │        │        │        │
[ Pillar 1 ] [P. 2] [P. 3] [P. 4] [Pillar 5]
   VAs      Email   SMS    Ads     In-Person
  Cold     Auto    Auto   (later)   Demos
  Call

   └────────┴────────┴────────┴────────┘
                     │
                     ▼
             [ DEMO BOOKED ]
                     │
                     ▼
              [ DEMO HELD ]
                     │
                     ▼
              [ CLOSE OR FOLLOW UP ]
```

---

## Pillar 1 · 📞 VA "Cold Calling"

**Goal:** 200+ qualified outbound calls per week by end of June. 500+ by end of August.

### Team
- **Lead:** Adolfo
- **Callers:** Brayan, Zahid, + 2-3 hired VAs
- **Status:** Interviewing VAs now

### Flow

```
[VA pulls list]  →  [Cold call w/ script]  →  [Qualifies interest?]
                                                       │
                                  ┌────────── YES ─────┴───────── NO ──────┐
                                  ▼                                          ▼
                       [Book demo for sales rep]              [Add to nurture email list]
                                  │
                                  ▼
                       [Demo confirmation SMS sent]
                                  │
                                  ▼
                      [Andrew or Adolfo runs demo in-person]
```

### Tasks

- [ ] Finalize cold-call script (Adolfo to draft, Andrew to review)
- [ ] Finish VA interviews — hire 2-3 by June 15
- [ ] Set up shared call dialer (Aircall, OpenPhone, or Google Voice for free)
- [ ] Build the lead list (D7 lead finder = same tool email pillar uses)
- [ ] Set up shared Google Sheet pipeline (or use Notion DB) — name, phone, status, last contact, next step
- [ ] Onboarding doc for new VAs — what to say, what NOT to say, how to log calls
- [ ] Set up demo-booking calendar (Calendly or Cal.com — free tier fine)

### Cost
- **VA salaries:** $300-600/mo per VA (varies by experience, Philippines/Latin America standard)
- **Call dialer:** $0-30/mo (Google Voice free; OpenPhone $19/mo if we need more lines)
- **Total per pillar:** ~$1,000-2,000/mo at full team (3 VAs)

### Targets
- Week 1-2 (June): Hire 2 VAs, finish training
- Month 1: 100 calls/week as the team ramps
- Month 2: 200 calls/week, 5-10 demos booked weekly
- Month 3: 500 calls/week, 15-20 demos booked weekly

---

## Pillar 2 · 📧 Email Automation

**Goal:** Cold email 1,000+ businesses per week by end of June. Open rate 20%+, reply rate 2-5%.

### Team
- **Lead:** Adolfo
- **Support:** Andrew (deliverability, technical setup)
- **Status:** Have all services, just need to buy. Waiting for software setup.

### Flow

```
[D7 Lead Finder pulls list]
        │
        ▼
[List enriched + verified emails]
        │
        ▼
[Smartlead sends warmed sequences]
        │
        ▼
[Reply lands in shared inbox]
        │
        ▼
[Adolfo qualifies + books demo]
        │
        ▼
[Andrew runs demo]
```

### Tasks

- [ ] Buy D7 Lead Finder ($45/mo)
- [ ] Buy Smartlead account ($32/mo)
- [ ] Purchase 5 domains for sending ($45 total, one-time)
- [ ] Set up Google Workspace inboxes on each domain ($7/mo per inbox)
- [ ] Warm up domains for 2 weeks before first campaign (Smartlead auto-warms)
- [ ] Draft 4-email sequence (intro → value → case study → soft ask)
- [ ] A/B test subject lines for first 2 weeks
- [ ] Build segment lists: salons, gyms, restaurants, dental, retail
- [ ] Set up shared inbox monitoring (everyone watching for replies)

### Cost — monthly

| Tool | Cost |
|---|---|
| D7 Lead Finder | $45 |
| Smartlead | $32 |
| Google Workspace (5 inboxes) | $35 (was listed as $7 → that's per inbox, 5 = $35) |
| Domains (annual, prorated monthly) | ~$4 ($45/yr ÷ 12) |
| **Total** | **~$116/mo** |

> **Pricing note:** The original board listed $129 total — that was using a different math. The corrected monthly run-rate above is ~$116 once domains amortize. Either number gets you in the ballpark.

### Targets
- Week 1-2: Domains warmed, sequences drafted
- Week 3: First 500 emails sent
- Month 2: 1,000+ emails/week, 20-50 replies, 5-10 demos
- Month 3: 2,000+ emails/week, ramp up to capacity

### Best practices
- **Never send more than 30 emails/inbox/day** during warmup, 50/day max ever
- **Always use plain-text-looking HTML** — no images, no fancy footers (kills deliverability)
- **Always have a clear unsubscribe link** + comply with CAN-SPAM

---

## Pillar 3 · 💬 SMS Automation

**Goal:** Text follow-up to anyone who shows interest from any channel. Convert lukewarm leads to demos.

### Team
- **Lead:** Adolfo + Andrew
- **Execution:** All & VA pool

### Flow

```
[Lead expresses interest via call/email/web]
        │
        ▼
[Phone number captured into pipeline]
        │
        ▼
[Automated SMS sequence kicks off]
        │
   ┌────┴────┐
   ▼         ▼
[Reply]   [No reply after 3 messages → archive]
   │
   ▼
[Human takes over — book demo]
```

### Tasks

- [ ] Pick SMS sender platform (Twilio, GHL SMS module, or OpenPhone)
- [ ] Pay the one-time A2P 10DLC registration fee (the $20 mentioned on the board — required by carriers in 2026)
- [ ] Draft 3-message follow-up sequence (Day 0, Day 2, Day 5)
- [ ] Wire SMS sender to the same pipeline as cold-call + email
- [ ] Build STOP/unsubscribe handler (legally required)
- [ ] Test deliverability before going live

### Cost
- **One-time A2P 10DLC registration:** $20
- **SMS sender service:** $10-30/mo + per-message costs (~$0.0075 per SMS in US)
- **Monthly estimate:** ~$50/mo at moderate volume

### Why this matters
SMS reply rates are 5-10x higher than email. Use it for warm follow-up, not cold first-contact (which violates carrier rules anyway).

---

## Pillar 4 · 📢 Ads

**Goal:** Paid acquisition channel once we have proven unit economics. Coming online month 2-3.

### Team
- **Lead:** Andrew (initially), hand off to Xabi or hired marketer once volume is there
- **Status:** Coming soon, 2-3 months out

### Flow

```
[Targeted ad on Meta / Google Local]
        │
        ▼
[Landing page on atlas-engine.org/demo]
        │
        ▼
[Form fill: name, business, phone]
        │
        ▼
[Auto SMS + email confirmation]
        │
        ▼
[Sales rep calls within 24 hr]
```

### Tasks (defer until July/August)

- [ ] Build a /demo landing page on atlas-engine.org
- [ ] Create 3 ad creative variants (problem-aware, social proof, ROI)
- [ ] Set up Meta Business Manager + ad account
- [ ] Set up Google Ads account
- [ ] Set a budget ceiling for the first month ($500-1000)
- [ ] Define CAC ceiling — if it costs more than $200 to acquire a paying business, kill the channel and revisit creative

### Cost
- **Initial test budget:** $500-1000 first month
- **Tools (free at start):** Meta Ads Manager, Google Ads
- **Designer if needed:** Fiverr ~$50-150 for ad creative

### Why delay
We don't know our true conversion rate yet. Paying for clicks before we know what converts is how startups burn money. Get the 3 non-paid pillars running, learn what messaging works, THEN pay to amplify it.

---

## Pillar 5 · 🤝 In-Person Approach

**Goal:** The most effective channel by close rate. Walking into local businesses with the brochure + a live demo on tablet.

### Team
- **Lead:** Everyone (rotate)
- **Status:** Need to create brochures + onboarding SOPs (✅ brochures done — see Resources below)

### Flow

```
[Pick 5 target businesses on a given day]
        │
        ▼
[Walk in 30 min before their slow time]
        │
        ▼
[Ask for the owner / manager]
        │
   ┌────┴────┐
   ▼         ▼
[Talk now]  [Schedule callback]
   │
   ▼
[Hand over sales brochure + pitch from flowchart]
        │
        ▼
[Demo on tablet w/ THEIR logo pre-loaded]
        │
        ▼
[Close or follow-up SMS]
```

### Tasks

- [ ] Print sales brochures (use the one in `/sales-and-manuals/atlas-sales-brochure.html` → print to PDF → take to FedEx Office or Vistaprint)
- [ ] Print owner manual brochures for closed deals (`/sales-and-manuals/atlas-owner-manual.html`)
- [ ] Build "onboarding SOP" doc — what happens in the 24 hr after a business signs
- [ ] Build a "demo sub-account swap" workflow — given a business name + logo, create their preview in < 5 min
- [ ] Decide territories per team member (don't all hit the same shopping center)
- [ ] Buy tablets if needed (or use phones — works either way)
- [ ] Business card design + print (Vistaprint $20 for 250)

### Resources

> **📎 Sales Brochure** — `/sales-and-manuals/atlas-sales-brochure.html`
> 8 pages. PAS framework. Includes secret rep-only flowchart on the last page. Print to PDF → print on cardstock. Cover, problem agitation, competitor stats, solution, features (×12), ROI calculator, secret objection→pivot map.

> **📎 Owner Manual** — `/sales-and-manuals/atlas-owner-manual.html`
> 14 pages. Hand to clients AFTER they sign. Walks them through every feature in plain English. Lower-priority print job — only print after a deal closes.

### Cost
- **Printing brochures (cardstock):** ~$2/copy at FedEx Office, ~$0.75/copy at Vistaprint in bulk
- **Tablets (if needed):** $200-400 one-time (iPad SE works fine)
- **Business cards:** $20 one-time for 250
- **Mileage / gas:** track for tax deduction

### Targets
- June: 30 walk-ins per team member per week, 2-3 demos booked from those
- July: First 5 closed deals from in-person
- August: 15+ closed deals from in-person

---

# 💼 What we sell

## Service 1 · Atlas Engine (the loyalty app)

The product Andrew has been building. Production-ready as of CP-35.

| Tier | Setup fee | Monthly | Notes |
|---|---|---|---|
| Standard | $497 | $197 | Full Atlas app, all features |
| Multi-location | $997 | $397 | Same as Standard × multiple sub-accounts under one business |

**Status:** Live at atlas-engine.org (pending wildcard DNS — see Andrew). Ready to sell.

**Lead:** Andrew owns delivery, anyone can sell.

## Service 2 · AI Receptionist (resale model)

GHL-based AI phone receptionist. Answers calls, books appointments, handles common questions. White-labeled per business under the Atlas brand.

| Tier | Setup fee | Monthly | Notes |
|---|---|---|---|
| Standard | TBD | TBD | Xabi finalizing pricing |
| Bundle w/ Atlas | TBD | TBD | Discount when sold together |

**Status:** Xabi is building this out. Targeting July launch.

**Lead:** **Xabi**. Tasks for him:
- [ ] Lock down GHL agency subscription + AI Voice setup
- [ ] Build the "resale model" — what we configure per business, what we charge
- [ ] Demo flow — how do we show this to a prospect alongside Atlas?
- [ ] First test installation (one of our team's businesses or a friendly first client)
- [ ] Pricing — both standalone and bundled with Atlas
- [ ] Onboarding SOP — what we need from the business to set this up
- [ ] Pricing card / one-pager for sales team

## Service 3 (future) · Atlas + AI Receptionist Bundle

The pitch most local businesses will hear: "Your customer app + an AI that answers your phone." Powerful combo, premium pricing, hard for competitors to match.

---

# 💰 Total cost breakdown

## Recurring monthly costs (everything running at scale)

| Category | Cost |
|---|---|
| **Outreach** | |
| VA salaries (3 VAs avg $450/mo) | $1,350 |
| Email automation stack (D7 + Smartlead + Workspace + domains) | $116 |
| SMS automation | $50 |
| Ads (when active, conservative) | $500 |
| **Software** | |
| Supabase Pro (database, see go-live doc) | $25 |
| Vercel Hobby (hosting) | $0 |
| Domain registrar (atlas-engine.org) | $1.50 ($18/yr) |
| Stripe fees (~2.9%, varies — not a fixed cost) | usage-based |
| **Tools** | |
| Notion team plan | $10-15 |
| Google Workspace (admin emails) | $14 |
| Calendly or Cal.com (free tier OK) | $0 |
| **Legal/Ops** | |
| Insurance (general + cyber) | $75 |
| Bookkeeping (Bench, Pilot, or DIY) | $0-200 |
| **TOTAL MONTHLY** | **~$2,150-2,400** |

## One-time costs (front-loaded, summer 2026)

| Item | Cost |
|---|---|
| LLC formation + EIN | $300-500 |
| Operating agreement (template or lawyer-reviewed) | $0-500 |
| Client agreement template (lawyer-reviewed) | $300-500 |
| SMS A2P 10DLC registration | $20 |
| Domain purchases (email pillar, 5 domains) | $45 |
| Initial ad creative (if outsourced) | $150 |
| Business cards | $20 |
| Brochure printing (first batch ~100 copies) | $75-200 |
| Tablets for in-person demos (if needed) | $400-800 |
| **TOTAL ONE-TIME** | **~$1,310-2,735** |

## When does this become profitable?

At **$197/mo per Atlas client + $500/mo AI Receptionist bundle**, every active customer generates ~$700/mo MRR. Breakeven on a $2,300/mo run rate = **~3-4 paying customers**.

| Customers signed | MRR | Run rate | Profit/loss |
|---|---|---|---|
| 1 | $197 | $2,300 | -$2,100 |
| 3 | $590 | $2,300 | -$1,710 |
| 5 | $985 | $2,300 | -$1,315 |
| 10 | $1,970 | $2,300 | -$330 |
| 15 | $2,955 | $2,300 | **+$655** |
| 20 | $3,940 | $2,300 | **+$1,640** |
| 30 | $5,910 | $2,300 | **+$3,610** |

**Goal: 15-20 paying customers by August 31.** That's profitable + provable + fundable.

---

# 📅 3-Month Timeline

## June — Foundation

**Theme: "Build the machine."**

- **Week 1 (Jun 1-7):** LLC formed, EIN received, bank account opened
- **Week 2 (Jun 8-14):** Operating agreement signed, client contract template drafted, privacy/ToS live on site
- **Week 3 (Jun 15-21):** VAs hired and onboarding, email domains warming up, SMS infra set up
- **Week 4 (Jun 22-30):** First demos held, first close attempts, brochures printed, in-person walks begin

**June targets:**
- Legal foundation complete
- 5+ demos booked
- 1-2 closed deals (testing the close)

## July — Volume

**Theme: "Find what works. Repeat it."**

- AI Receptionist launches (Xabi)
- Cold calls hit 200/week sustained
- Email sends hit 1,000/week
- In-person walks: 4 days/week × 30 walk-ins
- First case study captured from a happy client

**July targets:**
- 5-8 closed deals
- $1,000+ MRR
- 1 AI Receptionist sold standalone

## August — Compounding

**Theme: "Scale what's already working."**

- Add ads channel (Meta + Google Local)
- First bundle deal (Atlas + AI Receptionist)
- Referral program launched
- First testimonials filmed
- Hire if it makes sense (2nd sales rep)

**August targets:**
- 15-20 active paying clients
- $3,000+ MRR
- Profitable
- Decision: stay solo / hire / raise

---

# 🎯 Andrew's added suggestions

Stuff that wasn't on the board that we should bake in:

## 1. CRM / pipeline tracking
We can't manage 5 channels without one source of truth for "where is each lead." Free options:
- **Notion database** — easy, integrates with this page
- **HubSpot free CRM** — overkill but works
- **Google Sheets** — fine for first 100 leads

**Owner:** Adolfo

## 2. Activity metrics dashboard
A simple Google Sheet that tracks weekly:
- Calls made / replies / demos booked / demos held / deals closed
- Per person, per channel
- Conversion rates between each stage

We need this by week 2 of June. Without it, we're flying blind.

## 3. Case studies — capture every win
For each of our first 5 closed deals:
- 1-page case study (problem they had, what Atlas changed, the numbers)
- Short video testimonial (60 sec, phone-recorded)
- Logo + permission to use in marketing

Worth its weight in gold for the next 50 deals.

## 4. Referral program for happy clients
After 60 days as a customer, offer them: "Refer a fellow business owner → 1 free month for both of you." Costs us nothing if no one bites. Compounds if even 20% participate.

## 5. Build out atlas-engine.org/demo
Right now atlas-engine.org goes to the agency login. We need a public-facing marketing site:
- Hero with the value prop
- 3-5 feature highlights with screenshots
- ROI calculator (interactive — same math as the brochure)
- Demo booking form
- Pricing page
- Customer testimonials (once we have them)

This is a July project, not a June one. Don't rush it.

## 6. Networking — show up where local business owners are
- Local Chamber of Commerce meetings (often free or $50/yr to attend)
- BNI / Le Tip groups (more structured referral networks)
- Industry-specific events (salon trade shows, gym franchise meetups)

Walking in cold works. Walking in with a referral from a chamber works 10x better.

## 7. Decide on a money-back guarantee
**Suggested:** 30-day no-questions-asked refund. Reduces friction at close, costs us almost nothing because if the product works (it does), nobody asks for refunds. The signal it sends to a hesitant buyer is way more valuable than the rare refund we'd issue.

## 8. Capture EVERY objection
Adolfo + the VAs: log every "no" reason in a shared doc. After 100 nos we'll see patterns. Patterns become brochure copy, ad headlines, and FAQ pages.

---

# 🧭 North Star metrics

If we have to pick ONE number per month, it's:

| Month | North Star |
|---|---|
| June | **# of demos held** (top of the funnel — proves outreach works) |
| July | **# of closed deals** (proves the demo + close works) |
| August | **MRR** (proves we can compound) |

Track these weekly. Talk about them on every standup.

---

# 📎 Linked resources

- 🔗 **Sales brochure** (8 pages) — `/sales-and-manuals/atlas-sales-brochure.html`
- 🔗 **Owner manual** (14 pages) — `/sales-and-manuals/atlas-owner-manual.html`
- 🔗 **Go-live doc** — `/checkpoint-32-atlas-impact-and-notifications/GO_LIVE.md`
- 🔗 **Atlas codebase** — github.com/amonta16/atlas-rewards
- 🔗 **Live site** — atlas-engine.org

---

> **Last updated:** May 28, 2026
>
> **Next review:** Monday, June 1, kickoff call.
>
> **If this page is more than 7 days stale, someone update it.** The mission only works if the doc reflects reality.
