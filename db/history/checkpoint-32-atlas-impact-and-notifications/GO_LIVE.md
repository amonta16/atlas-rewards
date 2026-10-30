# Atlas — Going live on atlas-engine.org

Step-by-step deploy walkthrough. Follow top-to-bottom. The whole
thing takes **~45 minutes** the first time, including coffee.

You'll touch four services:

- **GitHub** — to host the code so Vercel can pull from it
- **Vercel** — the host (free tier is fine to start)
- **GoHighLevel** — for the DNS records on `atlas-engine.org`
- **Supabase** — to update the allowed redirect URLs

Each section has a "✅ done when…" line so you can sanity-check
before moving on.

---

## 0 · Before you start — one local check

In the Atlas folder, run once to make sure the SQL is applied and the
build still works locally:

```bash
cd "OneDrive/Documents/Claude/Projects/Atlas Engine APP/checkpoint-02-brand-engine/atlas-rewards-app"
npm install
npm run build
```

✅ **Done when:** `npm run build` finishes with "Compiled successfully."
If it errors, copy the error and paste it in chat — fix that before
deploying.

---

## 1 · Push the code to GitHub

Right now Atlas only lives on your computer. Vercel needs to pull it
from somewhere it can see.

### 1a. Make a new repo

1. Go to **https://github.com/new**
2. Repository name: **`atlas-rewards`** (or whatever you like — Vercel
   doesn't care)
3. Set it to **Private** (it has your Supabase URL hardcoded in
   places; never push secrets like `SUPABASE_SERVICE_ROLE_KEY` —
   those go in `.env.local` which is git-ignored already)
4. **Don't** add a README, .gitignore, or license — leave it empty.
5. Click **Create repository**

Copy the URL it shows (looks like `https://github.com/your-name/atlas-rewards.git`).

### 1b. Push from your computer

Open a terminal in your Atlas root folder (the one with the
`checkpoint-*` folders inside) and run, replacing the URL with yours:

```bash
cd "OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git init
git add .
git commit -m "Atlas — CP-32 ready for go-live"
git branch -M main
git remote add origin https://github.com/YOUR-NAME/atlas-rewards.git
git push -u origin main
```

If git asks for credentials, use your GitHub username and a
**personal access token** (not your password — GitHub stopped
accepting those). Make one at
**https://github.com/settings/tokens** → "Generate new token
(classic)" → tick `repo` → generate → copy and paste when git asks
for the password.

✅ **Done when:** you can see all the `checkpoint-*` folders on
github.com under your new repo.

---

## 2 · Import into Vercel

1. Go to **https://vercel.com/new**
2. Click **Import** next to your `atlas-rewards` repo (if it's not
   listed, click "Adjust GitHub App Permissions" and grant access to
   the repo).
3. **CRITICAL — set the Root Directory.** Atlas's Next.js app lives
   inside `checkpoint-02-brand-engine/atlas-rewards-app/`, not at
   the repo root. Click **Edit** next to "Root Directory" and pick:

   ```
   checkpoint-02-brand-engine/atlas-rewards-app
   ```

4. Framework Preset: **Next.js** (auto-detected)
5. Build Command, Install Command, Output Directory: leave defaults
6. **Don't deploy yet** — click **Environment Variables** and add
   these. (You'll generate the VAPID ones in step 3.)

   | Name | Value | Where to find it |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project>.supabase.co` | Supabase → Project Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | starts with `eyJ…` (anon public key) | Supabase → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | starts with `eyJ…` (service_role — **secret**) | Supabase → API |
   | `NEXT_PUBLIC_ROOT_DOMAIN` | `atlas-engine.org` | (just type it) |
   | `STRIPE_SECRET_KEY` | `sk_live_…` (or `sk_test_…` for testing) | Stripe → Developers → API keys |
   | `STRIPE_WEBHOOK_SECRET` | `whsec_…` | Stripe → Webhooks (set up in step 6) |

   Leave the VAPID rows blank for now — we'll come back to them.

7. Click **Deploy**. It takes ~2 minutes to build.

✅ **Done when:** Vercel shows a green "Deployment Ready" screen with
a temporary `*.vercel.app` URL. Don't visit it yet — it'll error
because the domain isn't matched.

---

## 3 · Generate VAPID keys and add them to Vercel

VAPID is the protocol that lets your server send push notifications
without anyone having to install an app. You need a public/private
key pair.

In your Atlas terminal:

```bash
cd "OneDrive/Documents/Claude/Projects/Atlas Engine APP/checkpoint-02-brand-engine/atlas-rewards-app"
npm install   # if you haven't yet — pulls in web-push
npm run vapid
```

You'll see something like:

```
──────────────────────────────────────────────────────────────
VAPID_PUBLIC_KEY=BIa…
VAPID_PRIVATE_KEY=jK…
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BIa…
VAPID_SUBJECT=mailto:hello@atlas-engine.org
──────────────────────────────────────────────────────────────
```

In Vercel → your project → **Settings → Environment Variables**, add
all four. Save.

⚠️ **Save the private key somewhere safe** (1Password etc.). If you
lose it, every subscribed device has to re-subscribe.

Then go to **Deployments → … menu → Redeploy** so the new env vars
are picked up.

✅ **Done when:** the four VAPID rows are present in Vercel's env vars.

---

## 4 · Point atlas-engine.org at Vercel (in GoHighLevel)

In Vercel → your project → **Settings → Domains**, type
`atlas-engine.org` and click **Add**. Vercel will show you the DNS
records it wants — keep that tab open.

Then add the wildcard so every business slug works
(`dermis.atlas-engine.org`, etc.):

1. Click **Add** again
2. Type `*.atlas-engine.org`
3. Add

Vercel will now show you **three** records to set up. Switch to GoHighLevel:

### In GoHighLevel — DNS records for atlas-engine.org

1. Go to **Settings → Domains** (or wherever your domains live in
   GHL — depends on which plan/setup you have)
2. Click your `atlas-engine.org` domain → **DNS Records** (or
   "Manage DNS")
3. Add these three records (delete or update any existing `@` /
   `www` / `*` records first, otherwise GHL's defaults will fight
   you):

   | Type | Name / Host | Value | TTL |
   |---|---|---|---|
   | `A` | `@` (or blank) | `76.76.21.21` | Auto / 3600 |
   | `CNAME` | `www` | `cname.vercel-dns.com` | Auto / 3600 |
   | `CNAME` | `*` | `cname.vercel-dns.com` | Auto / 3600 |

   (Vercel may show you a different A-record IP — use whatever Vercel
   tells you instead of the `76.76.21.21` example above.)

4. Save.

### Wait for DNS to propagate (10–60 min)

Back in Vercel's Domains page, both `atlas-engine.org` and
`*.atlas-engine.org` should eventually show **Valid Configuration**
with a green check. SSL certs auto-issue once DNS is verified.

If after an hour it's still pending, run `nslookup atlas-engine.org`
in a terminal — if you don't see Vercel's IP, the DNS hasn't
propagated yet (or GHL didn't save the record).

✅ **Done when:** both domains show green checks in Vercel.

---

## 5 · Update Supabase auth URLs

This is the most-forgotten step. Without it, magic-link logins and
team invites will silently fail.

1. Go to **Supabase → Authentication → URL Configuration**
2. **Site URL:** set to `https://atlas-engine.org`
3. **Redirect URLs** — add ALL of these (one per line, comma-
   separated, or whatever the UI wants):

   ```
   https://atlas-engine.org/**
   https://*.atlas-engine.org/**
   https://atlas-engine.org/accept-invitation/**
   ```

4. Save.

Also: **Authentication → Providers → Email** — make sure "Confirm
email" is **OFF** (otherwise customers have to click an extra link
before they can use their points). Toggle "Allow signups" **ON**.

✅ **Done when:** both URLs are listed in the redirect allow-list.

---

## 6 · Stripe webhook (if you're using Stripe for paid plans)

1. Go to **Stripe → Developers → Webhooks → + Add endpoint**
2. **Endpoint URL:** `https://atlas-engine.org/api/stripe/webhook`
3. **Events to listen for:** select these (or just pick "all events"
   for now):
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Click **Add endpoint** → Stripe shows you a **Signing secret**
   starting with `whsec_…`. Copy it.
5. Paste into Vercel as `STRIPE_WEBHOOK_SECRET` (Settings → Env
   Vars). Redeploy.

✅ **Done when:** Stripe shows the webhook as "Active" and a test
event you fire from Stripe lands in Vercel's logs.

---

## 7 · Smoke test the live site

Visit **https://atlas-engine.org** — should land on your agency
login. Sign in, you land in the agency dashboard.

Now create / pick a business with slug e.g. `dermis`. Visit
**https://dermis.atlas-engine.org/app** in your phone's browser
(make sure you're signed in). You should see:

- The business's logo and brand colors
- An **"Add Dermis to your home screen"** install prompt after ~5
  seconds
- The notification bell in the hero header (top right)

### Test push (the moment of truth)

On **Android Chrome:**
1. Tap **Install** when the prompt appears
2. Open the installed app from your home screen
3. Tap the bell — it asks for notification permission, grant it
4. Sign in to the manager dashboard from another tab/device, go to
   **Notifications**, type a test message, click **Send to everyone**
5. The push should land on your phone within a few seconds

On **iOS 16.4+:**
1. Open in **Safari** (not Chrome — iOS PWA push only works through
   Safari-installed PWAs)
2. Tap **Share → Add to Home Screen**
3. Open the icon from your home screen
4. Tap the bell — permission prompt appears, grant it
5. Send a broadcast from the manager dashboard → push should land

✅ **Done when:** the push notification arrives on your home-screen
PWA from a manager broadcast.

---

## How customers will experience it

Here's the flow once you go live, end-to-end:

1. **Business prints a QR code** that points to
   `https://<their-slug>.atlas-engine.org`
   (the QR generator lives in the agency dashboard already — under
   each sub-account)
2. **Customer scans it** → opens in their phone browser
3. **Customer signs up** (email + name; CP-1 makes membership auto)
4. After ~5 seconds, the **"Add Dermis to your home screen"** prompt
   appears with **the business's logo** (the per-business
   `manifest.ts` already pulls `logo_url` from the businesses table)
5. They tap install → **Dermis icon** lands on their home screen
6. Next time they open it, it launches **full-screen** with **Dermis
   branding**, looking like a real app
7. **Push notifications** work after the first time they grant
   permission
8. **No App Store required**

The only iOS quirk: their customers have to use Safari (not Chrome)
to install. Tell them "open in Safari, then Add to Home Screen" —
that's the universal phrase.

---

## What to do if something breaks

| Symptom | Fix |
|---|---|
| Vercel build fails with TS errors | Paste the first 10 lines of the error in chat |
| Customer signs in, gets "Invalid login link" | Step 5 — Supabase redirect URLs aren't updated |
| Sub-account URL shows the agency dashboard | Step 4 — wildcard `CNAME *` is missing in DNS, or `NEXT_PUBLIC_ROOT_DOMAIN` env var is wrong |
| Install prompt never appears | The page must be served over HTTPS (it will be on atlas-engine.org). On localhost it only fires on `localhost`, not `lvh.me`. |
| Push permission is denied | Reset in browser site settings. On iOS, the PWA must be installed first — pre-install permission requests fail silently. |
| Manager broadcast says "0 push_sent" | VAPID keys missing in Vercel env vars (step 3) |

---

## After it's live — tell me

Once `atlas-engine.org` resolves and you've signed in successfully,
ping me with the URL of a test business sub-account
(`https://<slug>.atlas-engine.org/app`) and any issues you ran into.
That tells me everything's wired and we're ready to roll out to
real businesses.
