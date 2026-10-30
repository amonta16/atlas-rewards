# CP-185 · Med spa builder + patient-app features

Andrew: "add med spa features that mimic Dermis, placeholders where more setup is needed, don't disrupt Flippo's, feel free to revamp the builder for med spas."

## The safety line (Flippo's untouched)
Everything keys off `layout_preset === "medspa"`:
- The builder (`/agency/businesses/[id]`) shows the **med spa tab set only on that layout**. Every other business sees the exact tabs it had.
- New Home modules (`next_treatment`, `providers`, `gallery`) are listed **only** in `LAYOUT_PRESETS.medspa.home`. Entertainment/custom/smoke/food never render them, and the med spa data lookup only runs for the medspa layout.
- The desk's "Treatment today" panel renders only for `layout_preset === "medspa"`.
- Database: one new column with a default (`businesses.medspa_config`) and one new table. No existing column or row changed.

## Builder (med spa layout)
Tabs: Setup · Design · **Treatments** · Membership · **Providers** · **Aftercare** · **Gallery** · Bookings · Rewards · Offers · **Consents** (waivers, renamed) · Insights · Settings.
Hidden for med spas: Events, News, and the Prize Wheel + Streak editors on the Rewards tab (venue tools).

| Tab | What it does | Status |
|---|---|---|
| Treatments | Menu with group, length, price, member price, **recall window**, aftercare, photo. "Load starter menu" fills 9 typical treatments with recall windows. | Live |
| Treatments → Recall reminders | Lead/follow-up days, channel, message templates with a phone preview. | **Stored only.** Nothing sends until the recall engine ships. Banner says so. |
| Membership | Banked-credit rules (monthly credit, rollover, note) above the existing Membership Studio. | Rules live; **balance is estimated** (months paid × credit − credit applied at the desk). No ledger yet. |
| Providers | Name, title, bio, photo, which treatments they perform; "let patients pick a provider" toggle. | Live in app (display); booking doesn't assign providers yet. |
| Aftercare | Per-treatment instructions; "My care" tab toggle + empty-state note. | Live |
| Gallery | Before/after pairs with a **consent gate** — no consent, never shown. | Live (practice gallery). Private per-patient photos: roadmap. |

All of it is one object (`medspa_config`) saved with the normal **Save changes** button.

## Patient app (medspa layout)
- Bottom tabs: Home · Book · **My care** · Member · Check in.
- Home leads with **"Your next treatment"**: due-date ring, "Due in 10 days · around Oct 14 with Jess", banked credit toward the visit. Before any treatment: "Start your plan — Book your first visit."
- **Your team** strip and **Real results** (tap to flip before/after).
- **/care**: what's due (tap → Book), banked credit, treatment history with aftercare per visit (auto-open for the last 14 days), and the menu with "every N months" rhythm and member prices.

## Front desk (medspa layout)
In the member screen, above history: **Treatment today** — tap the treatment, pick the provider, optional credit applied + note, "Log Neurotoxin". Writes `medspa_treatment_log`; the patient's card/aftercare update immediately. 15-minute undo.

## Database
- `businesses.medspa_config jsonb not null default '{}'`
- `medspa_treatment_log` (RLS: patient reads own rows; staff of the business read/write). SQL in `cp185_medspa.sql`. Already applied to the live project.

## What's still placeholder / next
1. Recall **sending** (cron: lead_days before due → push/SMS; follow-up after). Config and copy are ready.
2. Credit **ledger** (accrue monthly, debit at desk) to replace the estimate.
3. Provider assignment inside booking; per-patient private photos; intake forms (Consents tab covers signed documents today).

## Files
- `lib/medspa.ts` (new), `lib/data/medspa.ts` (new), `lib/layout-presets.ts`, `lib/types/database.ts`
- `components/medspa-builder/medspa-studio.tsx` (new), `components/brand-editor/brand-editor.tsx`
- `components/customer/medspa/*` (new), `components/customer/app-shell.tsx`, `app/[business]/app/page.tsx`, `app/[business]/app/care/page.tsx` (new)
- `components/manager/treatment-log-panel.tsx` (new), `components/manager/award-points-panel.tsx`

## Checks
`tsc --noEmit` clean. Builder tabs and patient modules rendered with sample data (screenshots in chat). Flippo's path: no file it renders gained a med spa branch that evaluates true for `entertainment`.
