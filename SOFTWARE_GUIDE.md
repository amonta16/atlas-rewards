# Atlas Rewards — Software Guide (Admin · Manager · Front Desk · User)

All routes below are taken directly from the app's routing and auth code. **Base domain:** the app is served from **`app.atlas-engine.app`** (confirmed in the native shell); the marketing site domain should be confirmed separately. In the examples, replace `{slug}` with a business's URL slug. Businesses are also reachable at `{slug}.atlas-engine.app` (middleware rewrites the subdomain to the same `/{slug}/…` routes), and the native iOS/Android app loads `app.atlas-engine.app/{slug}/app`.

**Never shared in this guide:** passwords, API keys, tokens. Front-desk PINs are set by managers in the app.

---

## Platform basics

- **Main application URL:** `https://app.atlas-engine.app`
- **How data is separated:** every business ("sub-account") is isolated by `business_id`. Database Row-Level Security plus per-request authorization checks (`staffs_business()`, `is_agency_admin()`) ensure one business's staff and customers can never read or write another's data. A user can belong to several businesses; each is entered by its own slug/URL.
- **Account creation:** customers self-register per business at `/{slug}/signup`. Staff/manager/agency accounts are created by **invitation** only.
- **Invitations:** an agency admin (or a manager, for their own business's staff) sends an invite from the Team page; the invitee gets a link `/accept-invitation/{token}` and sets a password. The role and business come from the invitation, not the link holder.
- **Password reset:** `/{slug}/forgot-password` → email link → `/{slug}/reset-password`. Agency users reset from the root `/login` "forgot password" flow.
- **Role assignment:** roles live in the `business_users` table (agency roles have `business_id = null`; business roles are tied to one business). Agency admins assign roles via invitations and the Team page; front-desk PINs are managed in the manager Team tab.

---

## 1. Admin (agency_admin) — the platform owner

- **Sign-in URL:** `https://app.atlas-engine.app/login`
- **Landing page after sign-in:** `https://app.atlas-engine.app/agency` (the Apps deck)
- **Account requirement:** an `agency_admin` role (agency-wide). This is Andrew's account; new admins are provisioned from the Supabase SQL editor (the old self-bootstrap page has been retired for security).
- **Sign-in process:** email + password at `/login`. If a `?next=` is present it is honored (same-site only); otherwise you land on `/agency`.

**Pages & purpose:**

| URL | Purpose |
|---|---|
| `/agency` | Apps deck — all businesses, folders, create/open a business |
| `/agency/businesses/{id}` | Brand editor / app builder for one business (branding, rewards, offers, streaks, GHL, membership) |
| `/agency/analytics` | Agency-wide analytics |
| `/agency/pipeline` | Prospect/sales pipeline (CRM board) |
| `/agency/team` | Invite & manage agency staff (admins, VAs) and see business managers |
| `/agency/settings` | Agency settings |
| `/agency/admin-app` | Field-app configuration (commissions, reps, nudges) |
| `/field` | "Atlas Command" phone-first field app for door-sales reps |

**Main actions:** create/configure businesses; edit any business's branding, rewards, offers, streaks, membership, and GHL booking; invite agency VAs and business managers; view agency revenue/analytics; manage the sales pipeline and the field app.

**Cannot do / boundaries:** nothing is restricted for an agency admin at the app level — this is the top role, so protect the account accordingly (strong password; it can read every business's data and integration keys).

**Settings that matter:** each business's GHL and Stripe configuration lives in its brand editor / membership setup; the field-app commission and nudge schedule live in `/agency/admin-app`.

**Notifications/status:** the field app shows a motivational-nudge bell; businesses show their own live activity.

**Common errors:** "Not an agency user" on `/agency` → the account lacks an `agency_admin`/`agency_va` row (provision it via SQL). If `/agency` still rejects right after promotion, hard-refresh (the server response is cached until the auth cookie cycles).

**Logout:** the sign-out control returns you to the login page and clears the session.

**Mobile:** the field app (`/field`) is designed phone-first; the agency deck is desktop-oriented.

**Setup before use:** be provisioned as `agency_admin`; then create at least one business to work with.

---

## 2. Manager (business_manager) — runs one business

- **Sign-in URL:** `https://app.atlas-engine.app/{slug}/login`
- **Landing page after sign-in:** `https://app.atlas-engine.app/{slug}/manage`
- **Account requirement:** a `business_manager` (or `business_staff`) role for that business, created by invitation. Managers also get their own front-desk PIN.
- **Sign-in process:** email + password at `/{slug}/login`. After sign-in, any privileged role (agency or manager/staff) is routed to `/{slug}/manage`; a pure customer is routed to `/{slug}/app`.

**Pages & purpose:**

| URL | Purpose |
|---|---|
| `/{slug}/manage` | Manager dashboard — award/redeem points, scan members, daily recap, activity log, insights, team, memberships, announcements |

The manager dashboard is a single tabbed surface. Within it a manager can: award and remove points (with a 30-second Undo), scan a member QR or search members, run day/recap stats and revenue insights, invite front-desk staff and set their PINs, configure the membership/passes, post a business announcement, and run win-back/inactive outreach.

**Main workflow (award points):** open `/{slug}/manage` → scan the member's QR or search by name/phone/code → the member card opens → enter points → confirm. Undo is available for 30 seconds.

**Permissions:** full control of **their own** business only.

**Cannot do:** reach another business's data; agency-level analytics, pipeline, team-of-agency, or settings; delete the business. Direct-URL attempts to another business's `/manage` are blocked server-side.

**Settings that matter:** membership/passes setup (Stripe or in-person/external), front-desk PINs, announcements, brand/design (if also granted agency access).

**Notifications/status:** a bell shows this business's notifications; a red "!" nudges review prompts.

**Common errors:** "Manager access required" card → the account isn't a manager/staff for this business. Login loop → ensure you're using `/{slug}/login` for the right slug.

**Logout:** sign-out returns to `/{slug}/login`.

**Mobile:** the manager dashboard and scanner work on a phone; a USB QR scanner is also supported at the desk.

**Setup before use:** be invited as a manager; set your PIN; configure rewards/offers/membership (or have the agency do it).

---

## 3. Front desk (business_staff) — day-to-day counter

- **Sign-in URL:** `https://app.atlas-engine.app/{slug}/frontdesk` (PIN keypad — no email needed)
- **Landing page after sign-in:** `https://app.atlas-engine.app/{slug}/manage`
- **Account requirement:** a front-desk PIN for that business, created by the manager in the Team tab. (Managers also have a PIN.)
- **Sign-in process:** on `/{slug}/frontdesk`, pick your name and enter your 4-digit PIN. The PIN is verified against that business only; after 8 wrong tries the keypad locks for 5 minutes.

**Pages & purpose:** front desk lands on `/{slug}/manage` and uses the same dashboard as a manager, minus the restricted areas.

**Main workflow (check-in / award):** open `/{slug}/frontdesk` → enter PIN → scan the member's QR or search → award points / complete the visit. The next-check-in time and streak are shown.

**Permissions:** award/remove points, scan/search members, see the members directory and each member's card, reset a member's password (accepted design), see the customer's next check-in.

**Cannot do:** see **Billing** and **Insights** (RLS-enforced, not just hidden); reach another business; agency areas. Direct-URL attempts to restricted areas or other businesses are blocked server-side.

**Notifications/status:** VIP badge on a member's scan; red "!" review nudges.

**Common errors:** "PIN locked" → wait 5 minutes (a successful login by any staff clears it). Wrong business → make sure the URL slug matches the location.

**Logout:** sign-out returns to the keypad.

**Mobile:** the keypad and scanner are phone-friendly.

**Setup before use:** the manager creates your PIN in the Team tab.

---

## 4. User (customer / member)

- **Sign-up URL:** `https://app.atlas-engine.app/{slug}/signup`
- **Sign-in URL:** `https://app.atlas-engine.app/{slug}/login`
- **Landing page after sign-in:** `https://app.atlas-engine.app/{slug}/app` (Home)
- **Account requirement:** self-registration per business (name, email, password, birthday month/day). Scanning a business QR or opening `/qr/{slug}` / `/j/{code}` also routes here.
- **Sign-in process:** email + password at `/{slug}/login`; a returning customer is auto-forwarded to `/{slug}/app`. First app load auto-enrolls the customer into that business.

**Pages & purpose:**

| URL | Purpose |
|---|---|
| `/{slug}/app` | Home — points card, featured offer, top rewards, streak & spin |
| `/{slug}/app/rewards` | Rewards store — browse, view details, redeem |
| `/{slug}/app/shop` | Full rewards catalog |
| `/{slug}/app/streaks` | Streak roadmap / check-in progress |
| `/{slug}/app/scan` | The member's QR code for the front desk to scan |
| `/{slug}/app/book` | Book an appointment (if the business has booking on) |
| `/{slug}/app/profile` | Profile & settings |
| `/join`, `/j/{code}`, `/qr/{slug}` | Entry points / business chooser for multi-shop members |
| `/account/delete` | Account deletion |
| `/legal/privacy`, `/legal/terms`, `/support` | Legal & support |

**Main workflow (earn & redeem):** open `/{slug}/app` → show your QR at `/{slug}/app/scan` for the desk to award points → watch points/streak update → open a reward → redeem when affordable.

**Permissions:** manage own profile; check in; earn/redeem points; view streaks, offers, rewards, notifications; book (if enabled); join membership/passes; delete own account.

**Cannot do:** anything staff/manager/agency; see or change other members' data; reach `/manage`, `/frontdesk`, or `/agency` (server-blocked). *(As of CP-110, customers also can no longer alter their own points/tier/membership status directly — that was a fixed defect.)*

**Notifications/status:** in-app bell (offers, rewards unlocked, raffles, announcements) + optional push (web/native); a red "!" nudges Google reviews; streak and next-check-in indicators on Home.

**Common errors:** "Business not found" → check the slug. Can't redeem → not enough points (the card shows how many more are needed). Booking says "not enabled" → the business hasn't turned booking on.

**Logout:** sign-out returns to `/{slug}/login`.

**Mobile:** the customer app is a mobile-first PWA and the native app target; it locks to portrait and respects the notch/home-indicator safe areas.

**Setup before use:** none beyond signing up for the business.

---

## Route directory by role

**Public / entry:** `/` (marketing), `/login` (agency), `/book-demo`, `/join`, `/j/{code}`, `/qr/{slug}`, `/legal/privacy`, `/legal/terms`, `/support`, `/accept-invitation/{token}`.

**Customer (`/{slug}/…`):** `login`, `signup`, `forgot-password`, `reset-password`, `app`, `app/rewards`, `app/shop`, `app/streaks`, `app/scan`, `app/book`, `app/profile`; `/account/delete`.

**Front desk:** `/{slug}/frontdesk` → `/{slug}/manage`.

**Manager:** `/{slug}/login` → `/{slug}/manage`.

**Agency admin / VA:** `/login` → `/agency`, `/agency/businesses/{id}`, `/agency/analytics`, `/agency/pipeline`, `/agency/team`, `/agency/settings`, `/agency/admin-app`, `/field`. *(VA: no analytics/pipeline/team/settings; no delete.)*

---

## Quick-start checklists

**Admin:** be provisioned `agency_admin` (SQL) → sign in at `/login` → create a business on `/agency` → configure it at `/agency/businesses/{id}` → invite a manager from `/agency/team`.

**Manager:** accept your invite → sign in at `/{slug}/login` → set your PIN and add front-desk staff in the Team tab → configure rewards/offers/membership → award your first points from `/{slug}/manage`.

**Front desk:** get your PIN from the manager → sign in at `/{slug}/frontdesk` → scan a member's QR → award points.

**User:** sign up at `/{slug}/signup` → open `/{slug}/app` → show your QR at `/{slug}/app/scan` to earn → redeem a reward when you have enough points.
