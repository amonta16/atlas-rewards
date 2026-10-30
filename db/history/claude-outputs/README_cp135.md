# CP-135 — Waivers + promo signup campaigns

Flippos feedback items 3, 4 and 5. Run **after** CP-134.

## Run first (Supabase SQL editor)

`cp135_waivers.sql` — idempotent. Needs `pgcrypto` (already on every Supabase project).

Tables (all RLS'd per business):

| table | what |
|---|---|
| `business_waivers` | one row per waiver (title, active, required at signup, pointer to current version) |
| `waiver_versions` | **append-only** — text, optional document URL, SHA-256 of the text. Publishing creates a new version; old ones are never edited, so signed records always point at the exact text the customer agreed to |
| `waiver_submissions` | the signed record: version, member, signer name/email, drawn signature (PNG data URL) or typed name, consent text, body hash, user agent, `signed_at` |
| `signup_campaigns` | promo QR campaigns: slug, headline, optional waiver, reward (`none` / `points` / `offer`) |
| `campaign_completions` | one per member per campaign — the reward can only be issued once |

RPCs: staff — `upsert_waiver`, `publish_waiver_version`, `upsert_signup_campaign`, `delete_signup_campaign`, `list_waiver_submissions` (search name/email/phone, filter by waiver + date range, paged), `get_waiver_submission`, `member_waiver_status`. Customer — `get_signup_campaign` (anon, for the landing page), `required_waiver_for_business`, `my_waiver_status`, `sign_waiver` (refuses a stale version; records the signature; completes the campaign; awards points via `award_points` or saves the offer via `save_offer` — only after the signature is stored), `complete_signup_campaign` (campaigns with no waiver).

Every staff RPC is gated on `staffs_business()`; cross-tenant offer/waiver/campaign ids are rejected at the SQL level.

## Customer flow

Scan promo QR (`/j/<join_code>?c=<campaign>` or `/qr/<slug>?c=`) → landing shows the campaign headline + reward → create account / sign in (the campaign slug survives the hops in localStorage, `lib/campaign-storage.ts`) → `CampaignResumer` (mounted in the app layout) sends them to `/app/waiver?c=…` → review the current waiver text, draw or type a signature, tick consent → `sign_waiver` → success screen with points or the offer's redeem code → home with confetti.

If a business marks a waiver **required at signup**, every member who hasn't signed the current version is routed to `/app/waiver` on their next app open (once per session check).

## Staff

* **Builder → Waivers** tab (`waivers-manager.tsx`): create waivers, publish versions (version history modal), create campaigns with a QR code + copyable link, and the signed log.
* **Front desk → Waivers** tab: the signed log (search / filter / open). Front-desk staff see this too — that's the verification surface.
* **Front desk → scanned member**: green/red waiver strip under the VIP strip (signed on current version / not signed / signed on an outdated version) with a "View" link.
* `/<slug>/manage/waiver/<id>`: printable signed record — exact text, consent line, signature image, timestamp, version, SHA-256, device.

## Files

`app/[business]/app/waiver/page.tsx`, `app/[business]/manage/waiver/[id]/{page,print-button}.tsx`, `app/[business]/{page,signup/page,login/page}.tsx`, `app/[business]/app/layout.tsx`, `app/j/[code]/{page,landing-client}.tsx`, `app/qr/[slug]/page.tsx`, `components/customer/{waiver-sign-client,signature-pad,campaign-resumer,campaign-remember}.tsx`, `components/agency/waivers-manager.tsx`, `components/manager/{waiver-submissions,award-points-panel,manager-dashboard}.tsx`, `components/brand-editor/brand-editor.tsx`, `lib/campaign-storage.ts`, `lib/types/database.ts`.
