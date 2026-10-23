# App builder cleanup: light plan

**Scope:** the agency builder at `/agency/businesses/[id]` (`components/brand-editor/brand-editor.tsx`, 1,799 lines) and the editors it pulls from `components/agency/*` and `components/medspa-builder/medspa-studio.tsx` (620 lines). Also the manager-side copy, `components/manager/medspa-app-builder.tsx` (CP-209).

## What's there today

**Venue builder (11 tabs):** Setup · Design · Rewards · Offers (sub-tabs: One-time / Automated) · Events · Bookings · Membership · News (only shown when the News feature is on) · Waivers · Insights · Settings.

**Med spa builder (13 tabs):** Setup · Design · Treatments · Membership · Shop · Providers · Aftercare · Gallery · Bookings · Rewards · Offers · Insights · Settings.

**Manager App builder (med spa, 8 sub-tabs):** Treatments & booking · Shop · Rewards · Providers · Aftercare · Before & after · Member credits · Practice info.

The **Design tab** has 20 sections in one long scroll (lines 669–1,497): Theme presets, Brand colors, Background pattern, Header & background, Card style, Points card style, Button style, Offer banner style, Offer card style, Reward panel style, Rewards store layout, Home rewards layout, Saved gifts layout, Limited offers layout, Design elements, Streak theme, and more.

## What's wrong

1. **The med spa Design tab is mostly dead.** The med spa app (`components/medspa-app/*`) reads none of `streak_theme`, offer banner, card, button or layout styles. A grep there finds nothing. A med spa owner sees about 15 sections that change nothing.
2. **The preview is wrong for med spas.** The "Mockup" preview (`CustomerPreview`) draws the venue app. Only "Live app" (the iframe) shows the real med spa Dermis layout.
3. **The same settings are editable in several places:**
   - Treatments, Shop, Providers, Aftercare, Gallery and Credits are in both the agency builder and the manager App builder. They use the same components, which is good, but the agency side has them as 5 top-level tabs plus Credits tucked inside Membership. The manager side has them as 8 sub-tabs.
   - Rewards is in the agency Rewards tab and in the manager App builder → Rewards.
   - Announcements (`AnnouncementComposer`) are on the builder's Settings tab and on the manager desk.
   - Billing/plan fields (`business-settings-panel.tsx`, 179 lines) are on the Settings tab, separate from `billing-panel.tsx` and the `/agency/bookkeeping` page.
4. **Saving works three different ways in one screen.** Setup, Design, Rewards' point sliders and the med spa editors only save with the top "Save changes" button (line 385). Rewards list, Offers, Automated offers, News, Waivers, Events, Membership studio, Notifications and the Streak/Mystery editors each write straight to Supabase as you go. Nothing on screen tells you which is which, so it's easy to lose edits or double-save.
5. **Dead or legacy code:**
   - `raffle-manager.tsx` (813 lines) is no longer mounted in any screen. Only the `/api/raffles/sweep` cron imports it.
   - `webhook-settings.tsx` (263) and `automation-rules-editor.tsx` (197) were unmounted in CP-37.12.
   - The automated offers still carry `percent`/`flat_cents` discount types (`automated-offers-manager.tsx:52,100`) that the UI no longer offers.
6. **Hand-kept lists drift.** Lines 421 and 1,677 each hard-code a long `activeTab !== …` chain that decides where the preview shows. Every new tab needs both edited, and they have already drifted apart.
7. **Naming is inconsistent.** The tab id is `brand` but the label is "Setup". Settings is a grab-bag: billing, announcements, notifications. "Waivers" (venue) vs "Consents" (comment says med spa) — the med spa tab list has no Consents tab at all. "Gallery" (agency) vs "Before & after" (manager). "Membership" vs "Pass" (the comment at line 158).
8. **Giant files:** `brand-editor.tsx` 1,799 · `manager-dashboard.tsx` 1,183 · `award-points-panel.tsx` 1,097 · `raffle-manager.tsx` 813 · `automated-offers-manager.tsx` 738 · `analytics-client.tsx` 729.

## Target layout

Group the tabs into 5 groups with sub-tabs. Each tab should save one way, and say which.

| Group | Venue | Med spa |
|---|---|---|
| **Brand** | Info & location, Look (presets + colors + Advanced) | Info & location, Look (logo, colors, hero, font only) |
| **Catalog** | Rewards, Bookings, Membership/Pass, Events | Treatments & booking, Shop, Membership & credits, Rewards |
| **Engagement** | Offers (one-time + automated), Streak & wheel, News, Waivers | Offers (one-time + automated), Providers, Aftercare, Before & after, Consents |
| **Insights** | Insights | Insights |
| **Account** (agency only) | Features, notifications, billing/plan, demo mode | same |

- Describe each tab in one config list, `builder-tabs.ts`, with `{ id, label, group, layouts, preview: boolean, saveMode: "draft" | "instant" }`. The tab bar, the preview and the save bar all read from it. That gets rid of both `!==` chains.
- **Saving:** tabs that save with the button show a sticky "Unsaved changes · Save / Discard" bar. Tabs that save as you go show a small "Saves automatically" label.
- For med spas, the preview defaults to **Live app**, and Mockup is hidden.
- The manager App builder keeps its sub-tab list, built from the same config with `audience: "manager"`. Then both sides stay in step automatically.

## Phases

**Phase 1 — quick wins (about 1 day, low risk)**
- Hide the venue-only Design sections for med spas. Med spa Look = colors, logo, hero, font.
- Med spa preview: Live app only.
- Add the "Saves automatically" / "Unsaved changes" labels per tab.
- Rename "Gallery" to "Before & after" everywhere. Add the Consents tab to the med spa list, or remove the comment.
- Move `raffle-manager`, `webhook-settings` and `automation-rules-editor` to `_legacy/` (keep what the raffle cron imports).

**Phase 2 — restructure (2–3 days)**
- Add the `builder-tabs.ts` config and grouped navigation (5 groups, sub-tabs).
- Split `brand-editor.tsx` into one file per tab: `tabs/setup.tsx`, `tabs/design.tsx`, `tabs/rewards.tsx`, and so on. The shell should end up under 300 lines.
- Move Credits next to Membership as "Membership & credits", on both the agency and manager sides.
- Make Announcements and Notifications manager-desk-owned, with a link from the builder. Move billing/plan into Account beside the bookkeeping link.

**Phase 3 — cleanup (later)**
- Turn Design's 20 sections into "Theme presets" plus one "Fine-tune" drawer. Drop the sections no live customer app uses (check with a quick SQL count of businesses with non-default values first).
- Retire the `percent`/`flat_cents` automated discount types with a one-off SQL migration to `reward`/`points_bonus`.
- Break up `award-points-panel.tsx` and `manager-dashboard.tsx` along the same lines.

## Risks
- **Lost unsaved edits** when merging tabs. Add a guard on tab switch and on page close while there are unsaved changes.
- **Live businesses depend on the Design fields.** Hiding sections is safe, but deleting fields isn't. Phase 3 needs the data check.
- **Manager vs agency permissions** (RLS `biz_update_manager`). Shared config must not expose agency-only fields (layout, billing, design) to managers.
- **Dropping Mockup for med spas** means unsaved edits don't preview. Do a quick "save then refresh" on Live instead.
