# Checkpoint 2 — Brand customization engine

This is the first chunk of actual app you can click on. Next.js 14 (App Router) + Tailwind + shadcn/ui + Supabase. Subdomain routing works on your laptop using `lvh.me` — no hosts-file editing required.

## What's in here

```
atlas-rewards-app/
├── app/
│   ├── page.tsx                         landing page (Atlas Rewards root)
│   ├── (agency)/
│   │   ├── login/page.tsx               email/password login
│   │   └── agency/
│   │       ├── page.tsx                 list of businesses
│   │       └── businesses/[id]/page.tsx brand editor
│   └── [business]/
│       ├── layout.tsx                   applies the business's brand theme
│       └── page.tsx                     branded customer dashboard preview
├── components/
│   ├── ui/                              shadcn primitives (Button, Input, etc.)
│   ├── brand-editor/brand-editor.tsx    THE editor — form + live preview
│   └── customer-preview/customer-preview.tsx the branded preview component
├── lib/
│   ├── supabase/{client,server,middleware}.ts  Supabase wiring
│   ├── types/database.ts                Business / WidgetConfig / PointRules types
│   └── utils.ts                         cn() + hexToHsl()
├── middleware.ts                        SUBDOMAIN ROUTING — the magic
├── supabase/storage-setup.sql           run in Supabase to add the logo bucket
└── package.json, tsconfig, tailwind, etc.
```

## Get it running (5 minutes)

You'll need **Node.js 20+** (`node --version` to check; install from nodejs.org if missing).

### 1. Open the project in Cursor / VS Code

```bash
cd "Atlas Engine APP/checkpoint-02-brand-engine/atlas-rewards-app"
```

### 2. Install dependencies

```bash
npm install
```

Takes about a minute the first time. You'll see a `node_modules/` folder appear.

### 3. Create `.env.local`

Copy the example and fill in your Supabase values:

```bash
cp .env.local.example .env.local
```

Then open `.env.local` and paste in:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase dashboard → Settings → API → "Project URL"
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — same page → "Project API keys" → `anon public`
- `SUPABASE_SERVICE_ROLE_KEY` — same page → "Project API keys" → `service_role` (keep this secret)
- `NEXT_PUBLIC_ROOT_DOMAIN` — leave as `lvh.me` for local dev

### 4. Add the storage bucket (one-time)

In Supabase SQL Editor, paste and run `atlas-rewards-app/supabase/storage-setup.sql`. This creates the `business-logos` bucket we'll use for logo uploads next sub-checkpoint.

### 5. Start the dev server

```bash
npm run dev
```

You should see:
```
▲ Next.js 14.2.x
- Local:   http://localhost:3000
- Network: http://192.168.x.x:3000
```

### 6. Open these three URLs

| URL | What you'll see |
|---|---|
| `http://lvh.me:3000` | The Atlas Rewards landing page |
| `http://lvh.me:3000/login` | Agency login — sign in with the email/password you set in Supabase |
| `http://demo.lvh.me:3000` | The DEMO BUSINESS's customer-facing branded view |

`lvh.me` is a public DNS entry that resolves any `*.lvh.me` to `127.0.0.1`. Zero setup. When you later switch to your real domain, you only change `NEXT_PUBLIC_ROOT_DOMAIN`.

## How to test the brand editor

1. Go to `http://lvh.me:3000/login` and sign in.
2. Click "Demo Rewards Co." in the dashboard.
3. In the editor:
   - Change the **primary color** to red.
   - Toggle off **Rewards store**.
   - Hit **Save changes**.
4. Open `http://demo.lvh.me:3000` in another tab. Refresh. The customer view should re-theme to red, and the rewards store should disappear.

That round-trip — agency edits → database update → customer view re-themes — is Checkpoint 2 in one sentence.

## What's deliberately not yet in CP 2

- **Logo file upload** — the field accepts a URL for now. CP 2.5 (a small follow-up) will add direct upload to the `business-logos` bucket.
- **Services catalog editor UI** — the data type exists, the UI for it lands in CP 5 alongside rewards.
- **New business creation** — disabled button on the dashboard. Lives in CP 9 (widget builder ships with the "clone a new sub-account" flow).
- **Real-time live preview at `demo.lvh.me`** — the in-editor preview is live; the actual customer subdomain requires refresh. Realtime subscriptions land in CP 3.

## Approval gate for CP 2

Once you can:
1. Sign in to the agency dashboard
2. Edit the demo business's name, colors, point rules, and widget toggles
3. See the live preview update as you edit
4. Save and see the changes persist in the Supabase `businesses` row
5. Open `demo.lvh.me:3000` and see the branded customer view reflect your changes

...CP 2 is done. Ping me and we'll start Checkpoint 3 — the real customer dashboard (signup, login, member account, points balance pulling from the ledger).

## Troubleshooting

- **"Module not found" on first run** — make sure `npm install` finished cleanly. Re-run if interrupted.
- **Blank page at `demo.lvh.me:3000`** — check that the `demo` row in `businesses` has `status = 'active'`. RLS only exposes active businesses to anonymous users.
- **"Not an agency admin" message** — re-run the agency-admin insert SQL from CP 1's README. The middle of the auth chain is your user_id, which has to have a row in `business_users` with `role = 'agency_admin'`.
- **Subdomain not detected** — confirm `NEXT_PUBLIC_ROOT_DOMAIN=lvh.me` in `.env.local`. If you changed it, restart `npm run dev`.
