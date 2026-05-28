# Atlas Rewards — Complete Project Overview

A white-label client retention and rewards SaaS platform. Agency-cloneable across industries (medspa, restaurant, gym, dental, salon, arcade, home service, retail). Built in 12 checkpoints + 2 follow-on sub-checkpoints.

## What this is

You can sell this to your agency's clients as a fully-branded rewards app for their business. Each client gets their own subdomain, logo, colors, rewards catalog, automation rules — all configurable through the agency dashboard in ~3 minutes per client.

## Stack

- **Frontend:** Next.js 14 (App Router) + Tailwind + shadcn/ui + TypeScript
- **Backend:** Supabase (Postgres + Auth + Realtime + Storage + Edge Functions + pg_cron + pg_net)
- **Hosting:** Vercel (free tier sufficient until ~100 customers)
- **Multi-tenancy:** Single deployed app, sub-account routing via wildcard subdomain
- **Future native shell:** Atlas Engine — iOS + Android container that QR-scans into a business's PWA

## The 12 checkpoints

| # | What | Status |
|---|---|---|
| 1 | Foundation: Supabase schema + multi-tenant routing | Done |
| 2 | Brand customization engine | Done |
| 2.5 | UI polish pass (Patient App style) | Done |
| 3 | Customer profile + points dashboard | Done |
| 3.5 | Manager front-desk app (QR scan + keypad) | Done |
| 4 | Points rules engine + Realtime live updates | Done |
| 5 | Rewards store + redemption | Done |
| 6 | Referral tracking | Done |
| 7 | Review reward flow | Done |
| 8 | Birthday + milestone + reactivation rewards | Done |
| 9 | Widget toggle builder + agency power tools | Done |
| 10 | Analytics dashboard | Done |
| 11 | GoHighLevel + webhooks (inbound + outbound) | Done |
| 12 | Push / SMS / Email + Launch polish | Done |

## Folder structure

```
Atlas Engine APP/
├── atlas_rewards_roadmap.html                ← original visual roadmap
├── PROJECT_OVERVIEW.md                       ← this file
│
├── checkpoint-01-foundation/                  ← run-once SQL files
│   ├── 01_schema.sql
│   ├── 02_rls.sql
│   ├── 03_functions.sql
│   ├── 04_seed_demo.sql
│   ├── 05_routing.md
│   └── README.md
│
├── checkpoint-02-brand-engine/
│   ├── atlas-rewards-app/                     ← THE Next.js application
│   │   ├── app/                               ← routes (agency, customer, manager, webhooks)
│   │   ├── components/                        ← UI components organized by role
│   │   ├── lib/                               ← Supabase clients, types, hooks
│   │   ├── middleware.ts                      ← subdomain routing
│   │   ├── public/                            ← static assets (logo, sw.js)
│   │   └── package.json
│   └── README.md
│
├── checkpoint-03-customer-and-manager/        ← SQL + READMEs
├── checkpoint-04-realtime-rules/
├── checkpoint-05-redemption/
├── checkpoint-06-referrals/
├── checkpoint-07-reviews/
├── checkpoint-08-milestones/
├── checkpoint-09-agency-builder/
├── checkpoint-10-analytics/
├── checkpoint-11-webhooks/
└── checkpoint-12-launch/
    ├── 01_automation_rpcs.sql
    ├── edge-function-templates/send-queued-messages/
    ├── DEPLOYMENT_GUIDE.md                    ← ★ how to go live
    └── README.md
```

The actual app lives in `checkpoint-02-brand-engine/atlas-rewards-app/`. Every other folder contains the SQL migrations and READMEs for the checkpoint.

## How to run it locally

```bash
cd "checkpoint-02-brand-engine/atlas-rewards-app"
npm install
cp .env.local.example .env.local
# Fill in your Supabase project URL + keys in .env.local
npm run dev
```

Then open `http://lvh.me:3000` for the agency landing, `http://demo.lvh.me:3000` for the demo business's customer-facing app, and `http://demo.lvh.me:3000/manage` for the front-desk app.

## How to deploy to production

Follow [`checkpoint-12-launch/DEPLOYMENT_GUIDE.md`](checkpoint-12-launch/DEPLOYMENT_GUIDE.md). About 90 minutes start to finish.

## How to onboard a new client business

1. `atlasrewards.app/agency` → **+ Add Business**
2. Brand editor for the new business → upload logo + hero, set colors, add rewards
3. Send your client the URL `<their-slug>.atlasrewards.app`
4. Their front-desk staff bookmark `<their-slug>.atlasrewards.app/manage`
5. Live.

## What was deliberately left for "after MVP"

These are listed in priority order — pick them up as the platform proves itself with real customers.

- **Atlas Engine native shell** — iOS + Android wrapper. Customer opens it, scans a business QR, the branded PWA loads inside and becomes their permanent view in the shell. Same data, same RLS, just a thin native wrapper.
- **VAPID-signed web push delivery** — service worker handler exists; needs VAPID keys + push subscription tracking + actual `push.send()` from the edge function.
- **POS integrations** — Square first (cleanest API). Sell as a paid upsell tier.
- **Apple Wallet / Google Wallet cards** — digital loyalty cards in the customer's wallet.
- **Hero image generator / brand kit AI** — for clients who don't have polished assets yet.
- **A/B testing on offers** — once 5+ clients are running.
- **Reactivation campaign UI** — audience picker + bulk SMS / email send.

## Key memories saved (in your auto-memory)

- **Atlas Rewards project context** — what you're building, three-tier views, MVP order
- **Tech stack decisions** — Next.js + Supabase + PWA + single-app routing
- **Your role** — agency owner, Pro plan, prefers checkpoint-by-checkpoint
- **Design direction** — "simple clean poppy," Patient App style
- **POS strategy** — universal Manager web app, no per-vendor integrations for MVP

These auto-load in future Cowork sessions so we don't repeat context.

---

Six months of work, ~12 sessions. Now you have a sellable SaaS.
