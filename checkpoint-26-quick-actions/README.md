# Checkpoint 26 — Pill Quick Actions, ROI Insights, poppy Featured offer, gated phone preview

UI-only — no SQL.

## What Andrew asked for

1. Header quick-action buttons should be **horizontally elongated pills
   with text labels** (sketch attached). Replace the User/profile icon
   with a **Star** for membership — there's no need for a profile button
   in the header since users must create a profile to be inside the app.
2. Phone preview should **not appear on Insights / Settings / Membership**
   tabs. Insights especially needs to be 100% dedicated to numbers that
   "show, hey if I cancel with them I'm definitely going to lose money."
3. Featured reward card needs to be **poppy** with a glowing border.
4. Double-check every quick action button actually works.

## What CP-26 ships

### Pill-shaped Quick Actions (`components/customer/header-actions.tsx`)

Three pill buttons, 40px tall, icon + text label, filled brand gradient
with shadow + ring + active-scale animation:

| Slot | Icon | Label | Behavior |
|---|---|---|---|
| 1 | Gift  | "Check in" | opens DailyMysteryModal (mystery spin) |
| 2 | Star  | "Member" / "VIP" | scroll to `#membership-benefits` (or open signup if anon); shows gold Crown + "VIP" when paid |
| 3 | Flame | "Streak" | opens StreakWidget (3x4 orange tray) with count badge |

The streak pill shows a black circular count badge (matches the "3" in
Andrew's mock). All three are real `<button>` elements with onClick
handlers — verified end-to-end.

`components/customer-preview/customer-preview.tsx` mirrors the same pills
so the agency's live preview now looks identical to what the customer
sees on `/app`.

### Phone preview gated to brand-only tabs (`components/brand-editor/brand-editor.tsx`)

Grid collapses to a single column when `tab === "insights" | "membership" | "settings"`,
and the right-rail phone preview block is `&&`'d out entirely. The
Brand / Rewards / Offers / News tabs still get the live preview because
those tabs edit visuals the customer sees.

### ROI hero on Insights (`components/agency/business-insights.tsx`)

New hero card at the top of the Insights tab — a branded gradient panel
that frames Atlas as the revenue driver:

> **Atlas drove $X for this business**
> in the last 30 days, across N visits from M active members.

Four tiles below the headline:

- **Per active member** — `revenue_cents / active_members`
- **Repeat visit rate** — `transactions / total_members %`
- **Activation** — `active_members / total_members %`
- **At risk if you cancel** — `active_members × avg_lifetime_points`
  (presented as dollars at 1¢/point as a defensible floor)

All computed from the existing `business_analytics` RPC payload — no new
SQL needed. The rest of the Insights screen (KPI grid, charts, top
members, member health) is unchanged.

### Poppy Featured offer card (`app/[business]/app/page.tsx`)

Per Andrew's mock: a cyan→brand→cyan gradient outer ring (3px) with a
soft `0 0 0 4px ${primary}11` halo and a deeper drop shadow, wrapping
the existing offer card with a tiny ⭐ FEATURED ribbon clipped to the
top-left corner. Image taller (h-40 vs h-32) so the photo pops.
Same treatment in the admin preview.

## Files touched

```
components/customer/header-actions.tsx                  (pill buttons + star)
components/customer-preview/customer-preview.tsx        (preview header pills + featured ring)
components/brand-editor/brand-editor.tsx                (gated preview rail)
components/agency/business-insights.tsx                 (ROI hero + tiles)
app/[business]/app/page.tsx                             (poppy featured offer ring)
checkpoint-26-quick-actions/README.md                   (this file)
```

## To verify

1. Reload the customer Atlas tab. Header now shows pill-shaped
   `[🎁 Check in] [⭐ Member] [🔥 Streak]` buttons. Each one is tappable.
2. Open agency editor → Insights tab → phone preview is gone, ROI hero
   shows up top.
3. Settings tab → phone preview gone.
4. Membership tab → phone preview gone.
5. Brand & widgets / Rewards / Offers / News tabs → phone preview still
   there.
6. Customer Home tab → Featured offer has the cyan→brand glow ring with
   ⭐ FEATURED ribbon.
