# CP-208 · Med spa manager dashboard (the Dermis model), Marketing tab, one financing provider, locked layouts

**Check after push** (sign in as a med spa manager): `/<slug>/manage` → lands on **Overview**; sidebar → **Marketing**; Brand editor → Shop (one-provider "Pay over time"), Brand editor → Brand (Layout now locked).

## Overview (new manager home, med spas only)
- Dermis-style home: Patients / Active members / Total visits / App sales cards, a 12-month trend (Visits · App sales · New patients toggle), and a **Live activity** feed (signups, logged treatments, paid orders, with names).
- One RPC: `medspa_overview` (SQL in this folder, **already applied to production**). Manager/agency gated — front desk staff never see it (tab hidden + RPC raises).
- Managers land on Overview; front-desk logins land on Front desk like before.
- "Marketing pulse" strip: recall engine status, automated offers running, ad campaigns → Marketing.

## Marketing tab (replaces generic Campaigns for med spas)
- **Always-on**: Recall messages (live status from `medspa_config`), Automated offers (live count via `list_automated_offers_for_business`), Win-back (→ Insights).
- **Ad engine**: planning view — four patient-facing plays (new-patient offer, before/after reels, membership launch, review & referral), the Ad → Install → First visit → Member funnel, and a per-campaign results strip honestly labeled **"Tracking coming soon"**. Nothing claims to send or measure yet.
- Entertainment/venue businesses keep the old CampaignsStudio untouched.

## One financing provider (CP-207 follow-up)
- Builder now picks **Off / Klarna / Affirm** — one provider, not two switches. Two tiles at checkout just split the same decision.
- Checkout/server still handle either (and legacy both-on configs render fine). Default stays Klarna-on.

## Layouts locked
- The brand editor's Layout section is read-only: shows the active preset + "Locked". The niche is chosen at creation (new-business modal) and can't be flipped live — switching scrambled tabs/data across niches. Need a different niche → create the business fresh.

## Sidebar fix
- The desktop sidebar was missing the med spa Patients/Shop tabs (filter lists predated CP-186/190); they now show, and groups read "Practice / Patient app / Business" for med spas.

## Verified
`tsc` 0 errors, `next build` green. Playwright 1440px with demo data: Overview (cards, chart toggle, live feed, pulse strip), Marketing (always-on cards, ad plays, funnel, coming-soon strip). No overflow, no console errors. RPC shape smoke-tested against production data (Spa by the Bay). NOT yet exercised end-to-end as a signed-in manager — check `/spa-by-the-bay/manage` after push.
