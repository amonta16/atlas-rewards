# Atlas Rewards — Mobile Launch Readiness Checklist
*Apple App Store + Google Play · First-time launch · Updated July 2026*

**The app being shipped:** the CUSTOMER app only. Agency dashboard, manager tools, and front-desk keypad stay on the web (they already live at `/agency`, `/manage`, `/<slug>/frontdesk`). Nothing admin-related goes in the mobile binary.

---

## 0. The Big Decision First: Dynamic Name/Icon

**Can the app change its name and icon after a customer joins Flippos? Short answer: No.**

- **App name:** Impossible on both platforms. The display name is baked into the signed binary and the store listing. No API exists to change it at runtime. Apple and Google both treat this as a security boundary (users must always know what app they installed).
- **App icon (iOS):** `setAlternateIconName` exists, but every alternate icon must be **pre-bundled in the binary at submission time**. You'd need to ship every business's icon inside the app and resubmit for each new business. Not viable for a growing platform.
- **App icon (Android):** `activity-alias` tricks exist but are also pre-bundled only, cause launcher glitches, and Play flags them.

**Recommended strategy (industry standard — this is what Fivestars/SumUp, Toast, Punchh do):**

1. **One universal app: "Atlas Rewards"** — neutral name, neutral icon. Marketing line: "One app, all your favorite local spots."
2. **Everything INSIDE the app becomes the business** after join — you already built this (brand colors, header color, patterns, banner styles, logo). The home screen post-join should be 100% Flippos: their logo in the header, their name everywhere, Atlas reduced to a tiny "Powered by Atlas" footer.
3. **Branded standalone apps = paid upsell later (Phase 2+).** Important constraint: Apple guideline **4.2.6** requires white-label/template apps to be published under **the client business's own Apple Developer account** ($99/yr each, business enrolls itself, you build & submit on their behalf). This is exactly why it works as an upsell — real cost, real price tag ($99/mo+ tier). Don't attempt to publish 30 branded clones from your one account; that's an instant 4.3 spam / 4.2.6 rejection.

One universal app under your account is **safe** from 4.2.6 — that rule targets fleets of cloned binaries, not a single multi-tenant app.

---

## 1. Technical Approach for the Mobile App

**Recommendation: Capacitor wrapping your existing Next.js customer app.** You keep one codebase, all 57 checkpoints of work, and Supabase auth/realtime as-is. Alternatives (rewrite in React Native/Expo or Flutter) cost months and buy little for this app.

What Capacitor changes vs. the PWA today:

- [ ] **Bundle the customer web app into the binary** (not a remote URL). Apple rejects thin remote-webview wrappers under guideline 4.2 (minimum functionality). The client bundle ships in the app; your Next.js API routes + Supabase stay on the server. Audit customer routes for static-exportability, or serve the shell locally and data via API.
- [ ] **Add real native capabilities** — this is also your 4.2 defense:
  - Native camera QR scanning (`@capacitor/barcode-scanner`) for business QR + check-in
  - Native push notifications (see §6)
  - Haptics on reward unlock / spin
  - Native share sheet, splash screen, app badge
- [ ] **Strip admin/manager/front-desk routes from the mobile bundle** — customer routes only.
- [ ] **Platform detection:** the same code keeps running as PWA/web; gate native plugin calls behind `Capacitor.isNativePlatform()`.
- [ ] **Target SDK levels (Play requirement):** new apps must target **Android 15 (API 35)** or higher; current Capacitor does this out of the box, just don't pin an old Gradle target. Apple requires building with a recent Xcode/iOS SDK — always build with the latest stable Xcode.
- [ ] **Mac access for iOS builds.** Xcode requires macOS. Options: a Mac you own, GitHub Actions macOS runners, or Codemagic (CI services can build + upload to TestFlight without owning a Mac).

---

## 2. Accounts, Fees, IDs, Signing

### Apple
- [ ] **Apple Developer Program — $99/year.** Enroll as **Organization** if you have an LLC/corp (seller shows as your company; requires a **D-U-N-S number** — free, ~1–2 weeks — plus legal entity docs). Enroll as Individual if not (seller shows "Andrew Montano"). Decide now; switching later is painful.
- [ ] **Bundle ID:** reverse-DNS, permanent, unchangeable after first upload. Suggest `com.atlasengine.rewards`. Register in the developer portal.
- [ ] **Signing:** use Xcode "Automatically manage signing" — it handles certificates + provisioning profiles. Never manually manage certs as a first-timer.
- [ ] **App Store Connect:** create the app record, name "Atlas Rewards" (names are first-come-first-served — reserve early), primary category **Lifestyle** or **Shopping**.

### Google
- [ ] **Google Play Console — $25 one-time.** Same Individual-vs-Organization choice. **Strong recommendation: Organization account** (requires D-U-N-S too, since 2023) because:
  - Personal accounts created after Nov 2023 must run a **closed test with 12 testers opted-in for 14 consecutive days** before they can even apply for production access. Organization accounts are exempt. This alone can save you 3–4 weeks.
- [ ] **Package name:** `com.atlasengine.rewards` — also permanent.
- [ ] **App signing:** enroll in **Play App Signing** (default, Google holds the release key; you keep an upload key). Accept the default.
- [ ] **Identity verification:** both platforms now verify legal identity, address, and (Play) a physical address that may be shown publicly for "trader" status (EU DSA). Have documents ready.

### Store assets (both)
- [ ] App icon: 1024×1024 (iOS, no transparency) + 512×512 (Play) — the neutral Atlas Rewards icon
- [ ] Screenshots: iPhone 6.9" and 6.5" sets (Apple), phone screenshots min 2 (Play), **feature graphic 1024×500 (Play, required)**
- [ ] Screenshots should show a demo business fully branded (use a fictional demo brand, not a real client without permission) — points, rewards wall, spin, streak trail
- [ ] Short description (80 chars, Play), full description, subtitle (30 chars, iOS), keywords (100 chars, iOS)
- [ ] Support URL + marketing URL (a simple atlas landing page is fine)

---

## 3. Privacy, Legal, Permissions

- [ ] **Privacy policy — required by both stores, hosted at a public URL.** Must cover: what you collect (name, email, birthday month/day, phone?, points activity, device push token), why, retention, sharing (Supabase, Stripe, GHL as processors), deletion rights, contact email.
- [ ] **Terms of service** — include loyalty program terms: points have no cash value, expiration rules, spin/mystery-reward odds are promotional not gambling, business can adjust programs. Protects you AND satisfies Play's loyalty-program disclosure expectations.
- [ ] **Apple privacy "nutrition label"** (App Store Connect questionnaire): declare Name, Email, Purchase/loyalty History, Identifiers — linked to identity, not used for tracking. **Do not enable any ad SDKs**; staying "no tracking" avoids ATT prompts entirely.
- [ ] **Google Play Data safety form:** same declarations, plus "data encrypted in transit" and "users can request deletion."
- [ ] **Account deletion — mandatory on BOTH stores** since your app has account creation:
  - In-app "Delete my account" flow (Apple 5.1.1(v) — must be in the app, not just a support email)
  - A web URL for deletion requests (Play requires this in the Data safety form)
  - Backend: RPC that anonymizes profile + cascades or nullifies ledger rows (keep aggregate stats, drop PII)
- [ ] **Permissions & purpose strings:**
  - Camera → `NSCameraUsageDescription`: "Scan your business's QR code to join and check in" (iOS rejects vague strings)
  - Push → runtime permission prompt on both (Android 13+ needs `POST_NOTIFICATIONS`); ask **after** the user joins a business, with context — not at first launch
  - Nothing else. No location, no contacts. Fewer permissions = smoother review.
- [ ] **Export compliance (Apple):** standard HTTPS only → set `ITSAppUsesNonExemptEncryption = false` in Info.plist, one-click answer at submission.
- [ ] **Age rating questionnaires:** both stores. The daily spin is a promotional loyalty mechanic, not gambling — answer "no real gambling / no simulated gambling with real prizes of monetary value"; rating should land 4+/Everyone. Have spin odds/terms published in case a reviewer asks.
- [ ] **Security you already did (CP-44):** RLS across 39 tables, security headers. Re-run the RLS audit on any new mobile-era RPCs (deletion, device tokens, join-by-code).

---

## 4. Authentication: What to Use

**Recommendation: keep exactly what you have — Supabase email + password (with the CP-47 forgot/reset flow) — and add nothing at launch.**

- **Sign in with Apple is NOT required** for you. Guideline 4.8 only kicks in if you offer a third-party social login (Google, Facebook, etc.). Your own email/password system is explicitly exempt.
- **Adding Google Sign-In forces you to also add Sign in with Apple.** Two extra integrations, two extra failure modes, for a rewards app where users sign up once in-store. Skip both for v1; add the pair later if signup friction data says so.
- Keep signup on the business-branded page (post-join), collecting: name, email, password, birthday month/day (set-once lock from CP-28 already handles this).
- **Session length:** configure Supabase refresh tokens for long-lived sessions. A rewards app that logs you out monthly gets deleted.
- Consider **phone OTP later** (customers give phones at desks readily) — but SMS costs money and adds a Twilio dependency; not for v1.

---

## 5. Business Codes, QR Codes, Deep Links — the Join Flow

**Answer to "code, QR, deep link, or all three?": all three, because they're layers of the same system, and it's cheap:**

- [ ] **Every business gets a short join code** — e.g. `FLIPPOS` or 6-char alphanumeric. New column/table: `businesses.join_code` (unique, human-typeable, case-insensitive). This is the universal fallback that always works.
- [ ] **Every business QR encodes a URL, not raw data:** `https://<yourdomain>/j/FLIPPOS`. One QR serves every scenario:
  - **App not installed, phone camera scan** → URL opens a smart landing page → detects platform → App Store / Play Store badges **and shows the join code prominently**: "After installing, enter code FLIPPOS." This is your deferred-deep-link fallback (see below).
  - **App installed** → Universal Links (iOS, via `apple-app-site-association` file) / App Links (Android, via `assetlinks.json`) open the app directly into that business's join screen. Both files are just static JSON on your domain.
  - **In-app scanner** → customer taps "Scan business QR" inside Atlas Rewards → native camera → parses the same URL → join screen.
- [ ] **The deferred deep-link problem (important to understand):** when someone installs from the store, iOS gives you **no** first-party way to know which QR sent them — install context is lost. Android has the free **Play Install Referrer API** (append `&referrer=FLIPPOS` to the Play link; app reads it on first launch and auto-joins). For iOS either accept "type the code after install" (recommended for v1 — it's one short code) or add Branch.io later for true deferred deep linking.
- [ ] **Customer identity QR** (for the front desk to scan with the CP-30 USB scanner): keep the existing per-member QR. In the native app, render it big + bump screen brightness. It should encode the member token your `ScannerListener` already parses — no change needed server-side.
- [ ] **In-store printed QR** = the join URL QR. **Table tents/window clings**: "Scan to earn rewards" → one QR handles install AND join. Your CP-44 brochure work slots in here.

Flow summary: scan → landing page → store → install → open → "Enter business code or scan QR" screen (Android often auto-fills via referrer) → business-branded signup → home screen fully Flippos.

---

## 6. Push Notifications (native)

Your CP-32 web push (VAPID) doesn't carry into native binaries.

- [ ] Android native push = **FCM** (Firebase project, `google-services.json`)
- [ ] iOS native push = **APNs** (key from developer portal) — simplest: send both through FCM
- [ ] Extend `push_subscriptions` with `platform` (`web`/`ios`/`android`) + FCM/APNs token; keep the CP-51 business_id scoping — same cross-tenant rules apply
- [ ] Update `push-server.ts` to fan out per platform
- [ ] **Bonus:** native push fixes the CP-51 limitation (one web-push sub per origin/device) — native tokens are per-app, so one device can receive pushes for multiple joined businesses if you ever allow multi-membership

---

## 7. How Updates Work After Launch

- **Apple:** every binary change = new build → upload → **review again** (usually 24–48h now, can be longer). Phased rollout available (7-day gradual). Expedited review exists for critical bugs (limited use).
- **Google:** upload AAB → review (few hours to a few days for new devs) → staged rollout by percentage (do 10% → 50% → 100% for anything risky).
- **Your secret weapon: most of your app is web content and server logic.** UI copy, offers, rewards, branding, RPC changes, new SQL — all ship instantly like today, no store review. Store review only applies when the **native shell** changes (new plugin, new permission, Capacitor upgrade). Expect binary updates every 4–8 weeks, web-layer updates daily.
- Caveat: don't abuse it. Remotely adding whole new native-feeling features that dodge review violates Apple 2.3.1 if egregious; normal content/web updates are fine and expected for this architecture.
- [ ] Add a minimum-version gate: `app_config` table with `min_supported_build`; app checks on launch and shows "Please update" → store link.

---

## 8. Pre-Submission Testing Checklist

- [ ] **Join flows:** code entry (wrong code, valid code, already-joined), in-app QR scan, Universal Link/App Link cold-start and warm-start, Android install referrer
- [ ] **Full customer loop on real devices:** signup → welcome gift reveal (CP-46 3.5s delay) → check-in (12h cooldown pill) → points award → streak trail advance → spin (check-in gate from CP-43) → reward unlock popup → save gift → redeem at desk → member QR scanned by USB scanner at front desk
- [ ] **Push:** permission prompt timing, receipt on locked device, tap-through to correct business content, no cross-tenant leaks (CP-51 regression)
- [ ] **Account deletion** end-to-end (it WILL be tested by reviewers)
- [ ] **Offline/flaky network:** airplane mode → app shows something sane, not a white screen (webview apps fail review for this); retry states on all fetches
- [ ] **OS matrix:** oldest iOS you support (set minimum iOS 16+), Android 10 → 16; small phone (SE) and large; dark mode doesn't break brand colors
- [ ] **Interruptions:** backgrounding mid-spin, token refresh after 30 days idle, timezone change vs. 12h cooldown
- [ ] **Performance:** cold start < 3s on mid-tier Android; Lighthouse the bundled web app
- [ ] **Distribution testing:** **TestFlight** (up to 10k external testers, mini-review required for external) + **Play closed track**. Run 1–2 weeks with real front-desk usage at a pilot business.
- [ ] **Review-readiness:** create a **demo business + demo customer account**, put the join code and login credentials in App Review notes on both stores. *Apps that gate all content behind a code get rejected as "unable to review" without this — this is your single most likely avoidable rejection.*

---

## 9. Likely Rejection Risks (ranked for THIS app)

1. **Reviewer can't get past the join gate** → demo code + credentials in review notes (see above). Also make the code-entry screen self-explanatory with a "What is Atlas Rewards?" blurb so the app doesn't look empty pre-join.
2. **Apple 4.2 minimum functionality ("just a website")** → native QR camera, push, haptics, offline handling; don't ship a remote-URL webview.
3. **Account deletion missing** (Apple 5.1.1(v), Play policy) → build before first submission, not after rejection.
4. **Vague camera permission string** → specific purpose text.
5. **Spin/mystery rewards read as gambling** → no real-money stakes, publish terms, correct age-rating answers. Low risk but have terms live.
6. **Privacy label / Data safety inconsistencies** (declaring nothing while transmitting email) → declare honestly.
7. **Play 12-tester rule stalls launch** (personal account) → register as Organization.
8. **4.2.6/4.3 white-label spam** → not a risk for the single universal app; becomes relevant only for the Phase-2 branded-app upsell (publish those under each client's own account).
9. **Membership payments:** memberships for real-world services (med spa visits, arcade perks) are **physical services → exempt from Apple IAP** (3.1.3(e)/3.1.5). Your CP-34 in-person/external-link/Stripe modes are all fine. Never sell digital-only content (e.g., app-only virtual currency for real money) or IAP rules activate.

---

## 10. Architecture: One Universal App, Many Businesses

You've already built most of this. What launch requires:

**Already correct (keep):**
- Single Supabase project, `businesses` as the tenant root, RLS isolation on 39 tables (CP-44 audit), `staffs_business` gating, per-business brand system (colors, header, patterns, banners — CP-52–57), business-scoped notifications and push (CP-44/51).

**Needed for mobile:**
- [ ] `businesses.join_code` (unique, short, human-typeable) + `join_business_by_code(code)` RPC (rate-limited; returns branded signup payload)
- [ ] "Active business" concept in the app shell: post-join, persist `business_id` locally; app boots straight into that business's branded experience (your `atlas-brand-last` fallback from CP-53 is the same idea — reuse it)
- [ ] **Decide: one membership per customer, or many?** Schema supports many (profiles ↔ businesses via memberships/points). Recommend: support multiple joined businesses with a simple business switcher hidden in settings — but market it as single-business. Costs little now, avoids a migration later, and makes "scan a second business's QR" not a bug.
- [ ] Pre-join state: minimal neutral Atlas screen (logo, "Enter code / Scan QR", nothing else) — no marketplace, no browse, exactly as you specified
- [ ] `app_config` (min version, kill switch), `device_tokens` per §6
- [ ] Subdomain-per-business is NOT needed for the native app (that was the web-push workaround; native tokens solve it)

**Data model for the record (existing, mobile-ready):** `businesses` (tenant + branding), `profiles` (customers; birthday month/day), `points_ledger` (earn/redeem events; no rule_type CHECK — CP-44.1), `offers` + `automated offers` + `my_saved_offers`, rewards + `gift_kind` (CP-49 authoritative), streak_config/check-ins (12h cooldown), memberships + `business_membership_billing` (3 payment modes), `pending_invitations`/`front_desk_pins` (staff — web only), `notifications`/`push_subscriptions`. No structural rework needed.

---

## 11. Customer App vs. Admin/Front-Desk Separation

- **Mobile binary:** customer routes only. Physically exclude `/agency`, `/manage`, `/<slug>/frontdesk` and admin components from the Capacitor bundle (separate build entry or route allowlist at build time). Not just hidden — absent.
- **Web (unchanged):** agency command center, manager dashboard, front-desk PIN keypad (CP-49), installable front-desk PWA (CP-44). Front desk on an iPad = the installable PWA, not the App Store app.
- **Why this is right (and you already chose right):** admin-in-app would drag Apple into reviewing your business tooling, complicate the privacy label, and slow every admin iteration to store-review cadence. Web dashboards iterate daily.
- RLS already enforces the boundary server-side (CP-44), so even a customer poking at APIs hits walls. Keep it that way — the app is UI separation, RLS is the security.

---

## 12. Suggested Build Order (from today)

*(Numbering continues from the existing checkpoint series — CP-73.1 was the last shipped.)*

**Paperwork track (runs in parallel with everything)**
DECIDED Jul 2026: launch Google Play as a **personal account now** ($25, no LLC/D-U-N-S needed) — accepts the 12-testers-for-14-days closed-test rule, which folds into the CP-78 pilot anyway. Form the LLC when revenue justifies (~$800/yr CA franchise tax), then: enroll **Apple as Organization from the start** (iOS ships later in CP-79 — no conversion needed) and transfer the Play app to a new org account (Play supports app transfers; account *type* can't be converted in place). Reserve "Atlas Rewards" + `com.atlasengine.rewards` at signup. Privacy policy + loyalty terms still needed before submission.

**CP-74 — Join-by-code backbone ✅ SHIPPED**
`join_code` column + `join_business_by_code` RPC, `/join` pre-join screen (enter code), `/j/<code>` smart landing page (platform-aware store badges via env, browser fallback today, Play install-referrer), agency QR card now encodes `/j/<code>` + shows the join code.

**CP-75 — Account-deletion hardening + app_config ✅ SHIPPED**
CP-40's in-app deletion was broken for referred customers (six NO ACTION FKs blocked `delete from auth.users`) — retargeted to SET NULL; staff self-delete guard; `/account/delete` public info page for the Play Data safety form; `app_config` min-version/kill-switch table. Remaining manual step: custom SMTP (Resend/Postmark) per checkpoint-75 README so reset emails deliver reliably.

**CP-76 — Capacitor shell (Android first) ✅ CODE SHIPPED — runbook pending on Andrew's machine**
Remote-URL shell in `mobile-shell/` (webview loads live deployment; admin routes untouched — they're simply never navigated to and stay behind RLS). `lib/native.ts` bridge (no web-bundle deps), NativeShell (last-business memory via native Preferences, CP-75 update/kill wall, deep-link routing), `/join` native boot (last business → install referrer → scan button). Remaining: run the checkpoint-76 README runbook locally (`npx cap add android`, icon/splash, first device run).

**CP-77 — Native push ✅ CODE SHIPPED — Firebase setup pending**
FCM v1 sender (dep-free), native tokens in `push_subscriptions` (`fcm:` endpoints, CP-51 scoping untouched), registration after sign-in inside a business app, tap-to-open routing, `@capacitor/push-notifications` in the shell. Remaining: Firebase project + `google-services.json` + `FIREBASE_SERVICE_ACCOUNT` env + `cp77_migration.sql` (checkpoint-77 README).

**CP-78 — Play Store readiness**
Assets (icon 512, screenshots, feature graphic 1024×500), Data safety form, age rating, demo business + demo account + review notes. Closed-track beta at a pilot business 1–2 weeks → staged production rollout. `assetlinks.json` for App Links.

**CP-79 — iOS pass**
Xcode build (Mac or CI), APNs, `apple-app-site-association` Universal Links, privacy nutrition label, export compliance flag, TestFlight → App Store submission.

**Phase 2 (post-launch):** Branch.io deferred deep links, Sign in with Apple + Google pair (if data justifies), branded standalone apps as upsell (per-client dev accounts), Square integration per POS strategy.

Items to start **this week**: D-U-N-S application (slowest item on the list), then CP-75.
