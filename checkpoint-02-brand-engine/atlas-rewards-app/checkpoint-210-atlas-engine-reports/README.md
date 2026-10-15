# CP-210 · "Atlas Engine" tab, Reports inside Insights, editorial report design

**Check after push** (manager login, med spa): sidebar shows **Atlas Engine** (new Atlas-mark icon) instead of Marketing; no Tutorial button; **Insights** has two views: *Live insights* | *Monthly reports*.

## Changes
- **Marketing → "Atlas Engine"**: new line icon drawn from the Atlas mark (`components/manager/atlas-engine-icon.tsx`). The page opens with a deep-navy Atlas banner ("Your marketing engine") instead of a plain heading. Overview's links now say "Open Atlas Engine".
- **Tutorial button removed** from the sidebar and the phone header (more room for nav). The tutorial overlay code stays, just unlinked.
- **Reports moved into Insights** as a second view. The email's `?tab=reports&month=…` link still works (opens Insights → Monthly reports). Overview's "Monthly report" button does the same.
- **Report redesign (dashboard + email)**, written to read like a letter rather than a dashboard:
  - Header = the app's **hero photo** under a brand-color wash (same treatment as the membership card), logo chip, month set large in a serif.
  - A **written summary** of the month ("Reveal Med. logged 142 treatments, up 17% on August. 38 new patients joined…").
  - One plain **figures table** with "up 17% on August" phrasing (no arrows/badges).
  - **Worth your attention**: a numbered list (no Win/Watch/Do-next tags).
  - **Most-booked treatments / Top patients** as thin brand-color bars.
  - Email mirrors it with a table layout (hero image on top, brand band with logo, same sections).

## SQL
`cp210_report_hero` (APPLIED Oct 14 2026): `_build_monthly_report`'s business object now includes `hero_url` (businesses.hero_image_url) for the email header.

## Verified
`tsc` 0 errors, `next build` green. Playwright with fixture data (Reveal Med. colors): dashboard report at 1200 px and 390 px (no overflow), email HTML. Placeholder photo/logo in the preview; real reports use each business's own.
