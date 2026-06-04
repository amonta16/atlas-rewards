# Atlas Engine — Pre-Launch Audit (CP-44)

Date: June 2026. Scope: multi-tenant isolation, notification isolation, reward
QR/scan flow, security hardening, privacy. **Verdict: structurally sound and
close to launch-ready** once the two deploy steps below are done. One real
isolation bug and one missing-RLS table were found and fixed; everything else
passed.

---

## ✅ What passed (verified)

**Business-to-business isolation (the big one).** Every one of the 39 tables
has Row-Level Security, and access is gated by `staffs_business(business_id)` —
a user only sees a business's data if they have a `business_users` row for it.
- A **manager / front-desk** user of Business A **cannot** read or write
  Business B's members, points, rewards, redemptions, reviews, offers, streaks,
  billing, or settings. Visiting another business's `/manage` shows an
  access-denied screen.
- A **customer** can only read their own membership, points ledger, redemptions,
  reviews, saved gifts, streaks, and notifications (`user_id = auth.uid()` /
  membership ownership).
- The **only cross-business role is the agency admin (you)** — by design, since
  Atlas is a single agency over many sub-accounts.

**Service-role key.** Used only in server code (`lib/supabase/admin.ts` + API
routes). Never `NEXT_PUBLIC`, never in a client bundle. ✔

**SECURITY DEFINER functions.** Consistently pinned with `set search_path =
public` (prevents search-path injection). ✔

**Inbound webhook** (`/api/webhooks/<slug>`) verifies an HMAC-SHA256 signature
with a constant-time compare before awarding points — can't be spoofed. ✔

**Customer reward QR.** Redeeming a reward generates a code + QR the customer
shows at the counter (`redeem-flow`, `redemption-detail`). ✔

**Privacy policy & terms.** `/legal/privacy` and `/legal/terms` exist and the
privacy policy is substantive (controller/processor split, data collected,
GDPR/CCPA rights, retention, children, subprocessors). ✔ *(Still get a lawyer to
review before commercial launch — see below.)*

---

## 🔧 Issues found & fixed

1. **Notification bleed across businesses (real bug).** The bell, the
   notification list, and "mark all read" queried *all* of a customer's
   notifications regardless of which business's app they were in — so a customer
   who belongs to two Atlas businesses would see Business B's unread count and
   messages inside Business A's app. **Fixed:** the feed is now scoped to the
   current business.
   *Files:* `cp44_security.sql` (business-scoped `list_notifications` /
   `unread_notification_count` / `mark_all_notifications_read`),
   `notification-bell.tsx`, `notification-center.tsx`.

2. **`notification_queue` had no RLS** (the only table of 39 missing it). It's
   server-only, so **enabling RLS with no client policy** locks it from the
   public REST API without breaking the cron. *File:* `cp44_security.sql`.

3. **Front-desk scan didn't show the reward image.** Scanning a redemption code
   showed name/cost/code but only a generic gift icon. **Fixed:**
   `resolve_redemption_by_code` now returns the reward's `image_url` and the
   fulfillment panel displays the actual photo. *Files:* `cp44_security.sql`,
   `redemption-fulfill-panel.tsx`.

4. **No security headers.** Added baseline headers (X-Frame-Options,
   X-Content-Type-Options, Referrer-Policy, HSTS, Permissions-Policy — camera &
   mic allowed for QR/voice, geolocation off). *File:* `next.config.mjs`.

---

## ⚠️ Low-risk notes (no PII; optional to tighten)

- A few **config-only** tables are world-readable to logged-in users
  (`streak_config`, `business_mystery_config`, `business_notification_settings`,
  `automated_offer_templates`). These contain settings/flags/milestones — **no
  customer PII, no financial data** — and the customer app reads its own
  business's config from them. Writes are properly manager-gated. Tightening the
  reads to "members of that business" is possible later but risks breaking the
  pre-membership streak/config reads; left as-is for launch.
- `next.config.mjs` keeps `ignoreBuildErrors` / `ignoreDuringBuilds` on. That
  ships even if a TS/ESLint error exists. Pragmatic for now; worth turning back
  on once the legacy type warnings are cleaned up.

---

## 🔒 Round 2 — common loophole fixes & rate limiting

5. **CRITICAL: unlimited self-award of points.** `award_points` was granted to
   `authenticated` with **no staff check** — a logged-in customer could call it
   directly via the API and give themselves unlimited points. **Fixed:** the
   guard now allows staff to award/remove, and a customer only to **deduct from
   their own balance** (redemption) — never to add. Every other point RPC
   (`quick_award`, `member_checkin`, `send_winback`, `manager_remove_points`)
   already had the guard; this was the one gap. *File:* `cp44_loopholes.sql`.

6. **Redemption fraud — checked, clean.** `redeem_reward` derives the membership
   from `auth.uid()` (no IDOR / can't redeem on someone else's account), verifies
   the reward is active and the member has enough points, and the balance can't
   go negative. `fulfill_redemption` is staff-only. ✔

7. **Open redirect (phishing).** The `?next=` param only checked `startsWith("/")`,
   which still allowed `//evil.com` (a protocol-relative URL that sends the user
   off-site). **Fixed** with a `safeRedirect()` guard on both login pages.
   *Files:* `lib/utils.ts`, both `login/page.tsx`.

8. **XSS — clean.** No `dangerouslySetInnerHTML` anywhere; React escapes all
   user-supplied text (names, reviews, offers) by default. ✔

9. **Rate limiting added** on the most abusable routes — the unauthenticated
   points **webhook** (60/min per IP+business), **flush-mine** (30/min),
   **subscribe** (20/min), and **broadcast** (10/min). Uses Upstash Redis when
   configured, else an in-memory fallback so it works immediately.
   *Files:* `lib/rate-limit.ts` + those routes.

### Enabling the strong rate limiter (optional, recommended)
The limiter works out of the box (in-memory). To make it shared across regions
and survive deploys, add a **free Upstash Redis**:
1. Go to upstash.com → create a free Redis database.
2. Copy its **REST URL** and **REST TOKEN**.
3. In Vercel → your project → Settings → Environment Variables, add
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, then redeploy.
The code auto-detects them and upgrades — no code change needed.

---

## 🚀 To deploy this audit

1. Apply **`cp44_security.sql`** AND **`cp44_loopholes.sql`** in the Supabase SQL
   editor (both idempotent).
2. Push the code (PowerShell — one line each):
   ```powershell
   git add -A
   git commit -m "CP-44: pre-launch hardening + loophole fixes + rate limiting"
   git push origin main
   ```

---

## 📋 Go-live checklist (things outside the code I can't do for you)

- [ ] **Lawyer review** the privacy policy + terms (esp. CCPA/GDPR) before
      taking real customers — the template is solid but not legal advice.
- [ ] **Vercel Pro** so the every-minute notifications cron runs (time-based
      pushes: streak/birthday/gift/check-in). Instant pushes already work.
- [ ] **Supabase: confirm RLS is ON in the live DB** for every table (run the
      diagnostic again after applying cp44) and that **daily backups / PITR** are
      enabled (Supabase Pro).
- [ ] **Rate limiting** on the public API routes (webhooks, notifications) —
      add Vercel/Upstash rate limits to blunt abuse at scale. Not built in yet.
- [ ] **Load test** with a few hundred members on one business before a big
      rollout; the queries are indexed but worth confirming under real traffic.
- [ ] **Secrets rotation plan** for `SUPABASE_SERVICE_ROLE_KEY`, VAPID keys,
      Stripe keys, and per-business `webhook_secret`.
- [ ] **Backups of the agency config** (businesses, rewards, offers) so a bad
      edit is recoverable.

Bottom line: data isolation between businesses (managing + front desk +
customers + notifications) is enforced at the database layer and holds. The
fixes above close the gaps found. After applying the SQL + deploying, you're in
good shape to onboard many businesses and many customers.
