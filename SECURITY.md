# Atlas Engine — Security Checklist

**Question Andrew asked:** can the Atlas Engine GitHub repo stay public and still be safe from attackers?

**Short answer:** yes — *if* the items in this checklist are all green.

Lots of real SaaS companies run public repos (Discord clients, Mozilla products, many YC startups). Your security doesn't come from hiding the code. It comes from:
1. **Secrets never being in the code** (they live in Vercel env vars + Supabase dashboard)
2. **Row-Level Security on every table** (so even with full SQL access, a logged-in user can only read their own data)
3. **Auth checks on every API route**
4. **Rate limits + abuse detection** (Vercel + Supabase do this for you)
5. **Vulnerability scanning** (Dependabot)

If those are solid, an attacker holding the entire source code can do *nothing more* than an attacker who just hit your production URL.

---

## 1. Audit: secrets never committed

Run these from the project root before going public (or as a pre-commit hook).

```bash
# Anything that looks like a Supabase service key, VAPID private key, or Stripe secret
git log --all -p | grep -E "(sb_secret|service_role|sk_live|sk_test|VAPID_PRIVATE_KEY|SUPABASE_SERVICE_ROLE)"

# Common env-file leaks
git log --all --pretty=format: --name-only --diff-filter=A | sort -u | grep -E "\.env|\.env\.local|\.env\.production"

# JSON files with embedded keys
git log --all -p | grep -E '"(service_role_key|secret|private_key|api_key)"'
```

If any of those return hits, you've leaked. The fix is to **rotate those keys** in Supabase/Vercel/Stripe (a public leak is permanent — `git filter-branch` doesn't help once people have cloned). Steps to rotate:

| Secret | Where to rotate |
|---|---|
| Supabase `service_role` key | Supabase Dashboard → Project Settings → API → Reset service_role key |
| Supabase `anon` key | Same screen → Reset anon key (this one is public-by-design — only worry if it landed in a server-side env var by mistake) |
| Stripe `sk_live_…` | Stripe Dashboard → Developers → API keys → Roll secret key |
| VAPID private key | Run `npm run vapid` → update `VAPID_PRIVATE_KEY` in Vercel → push subscriptions become invalid (users need to re-subscribe via the bell) |

After rotation, update Vercel env vars and redeploy.

---

## 2. Verify `.gitignore` covers every secret-bearing file

```
.env
.env.local
.env.production
.env.*.local
*.pem
*.key
service-account*.json
.vercel
.supabase
```

Open `.gitignore` and confirm those lines exist. (They are, in this repo.)

---

## 3. RLS audit: every table has policies

In Supabase SQL editor, run:

```sql
-- List every public table + whether RLS is on
SELECT
  schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Every row should have `rowsecurity = true`.** If a table shows `false`, either:
- It contains only public data (e.g. `automated_offer_templates` — fine)
- Or it's a gap. Add RLS:
  ```sql
  ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "<descriptive_name>" ON public.<table_name>
    FOR ALL TO authenticated
    USING (<condition>) WITH CHECK (<condition>);
  ```

Then verify each table's policies actually restrict to the caller's scope:

```sql
-- List every policy
SELECT schemaname, tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

The `qual` (USING clause) should reference `auth.uid()` or one of our helper functions (`is_agency_admin()`, `is_business_manager()`, `staffs_business()`). If it just says `true` or has no condition, that's a leak.

---

## 4. API-route audit: every route checks auth

```bash
# Any API route that doesn't call auth.getUser() is suspect
grep -L "auth.getUser\\|createAdminClient\\|notification_id" app/api/**/route.ts
```

Routes called by the database (like `/api/notifications/push-fanout`) intentionally don't check user auth — they're called server-to-server with the `pg_net` extension and only operate on rows that already exist. Mark them clearly with a comment.

---

## 5. Turn on Dependabot

In `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/checkpoint-02-brand-engine/atlas-rewards-app"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

This gets you a PR every time a dependency has a known CVE. Apply them promptly.

---

## 6. Supabase rate limits

Supabase has automatic abuse protection — you don't have to configure anything. But verify in **Project Settings → API → Rate limits**:

- Auth attempts: 30/hour per IP (default — good)
- Email sends: 4/hour per email (default — good)
- DB queries: 200/sec per project (default for free plan)

If you start seeing abuse, you can tighten these.

---

## 7. Vercel — turn on Attack Challenge Mode (optional)

If you ever get DDoS'd: Vercel Dashboard → Project → Settings → Security → enable **Attack Challenge Mode**. Adds a one-time CAPTCHA challenge per visitor. Easy to toggle on/off.

---

## 8. What you DON'T need to worry about

- **Anon key in client code** — it's designed to be public. Supabase RLS is what protects the data, not the key.
- **API route paths being visible** — they're enumerable from your domain anyway.
- **RPC names being public** — same. The RPCs themselves have `SECURITY DEFINER` + permission checks.
- **Database schema being visible** — Postgres schema is queryable from the anon role anyway via `information_schema`.

---

## 9. What you SHOULD worry about

- **Service role key in any client component or env-public var.** That key bypasses RLS. It belongs in `SUPABASE_SERVICE_ROLE_KEY` (server-only env var) and nowhere else.
- **Stripe secret key (`sk_live_…`)** anywhere except `STRIPE_SECRET_KEY`.
- **VAPID private key** in client code.
- **`createAdminClient()` accidentally called from a client component.** The import itself shouldn't be possible from a `"use client"` file — but worth grepping for.

```bash
# Catch any client-component file that imports the admin client
grep -l '"use client"' app/**/*.tsx components/**/*.tsx | xargs grep -l 'createAdminClient'
# Should return NOTHING.
```

---

## Bottom line

If everything in §1–§4 passes and Dependabot is on, your public repo is at least as secure as a private one. The attacker can read your code; they cannot read your data.

If you ever doubt it, do this drill: imagine an attacker has a clone of the repo open in one window and a fresh `curl` window in the other. What can they actually do? Walk through each API route in your head. If nothing scary comes out, you're good.

Email me anytime you're unsure: hello@atlas-engine.app.
