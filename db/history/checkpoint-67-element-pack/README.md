# Checkpoint 67 — Design Element Pack (+ featured-offer styling)

The finishing touches: badges, section titles, dividers, and button glow —
plus the Home page's featured offer now wears the offer-card style too.

## Featured offer fix (Andrew's report)

The big highlighted offer on the customer Home page kept its fixed white
inner card no matter what offer-card style was picked. Now the inner card
adopts the same skin as the Limited-offers cards (Gradient, Midnight, Luxe
noir, …) while keeping its signature glow ring — in the live app AND the
phone preview.

## The element pack (`cp67_elements.sql` — 4 new columns)

New **Design elements** section in the brand editor, four levers:

- **Badge chips** (`badge_style`) — the little "Just for you" / "20% off" /
  "Earn" chips: Gradient (default), Solid, Outline, Dark, Glow.
- **Section titles** (`heading_style`) — Plain (default), Accent bar (brand
  bar to the left), Underline (short brand underline), Sticker (title inside
  a gradient pill).
- **Section dividers** (`divider_style`) — None (default), Line (fading
  brand line), Dots, Sparkle (✦ between fading lines). Rendered between the
  big sections on Home and the Rewards tab.
- **Button glow** (`cta_glow`) — None (default), Soft, Bold. A brand-tinted
  glow behind primary CTAs, delivered via a new `--atlas-cta-glow` CSS var:
  every `ui/button` on the customer surface picks it up automatically, plus
  the "Claim this gift" pill.

Where they render (first pass): customer Home ("Top rewards" title,
divider under the featured offer), Rewards tab ("Rewards store", "Limited
offers", "Need more points?" titles, both badge chips, section divider,
claim CTA), and the live phone preview mirrors all of it instantly. More
surfaces can adopt `SectionHeading` / `SectionDivider` / `badgeCss()` over
time — they're shared components now.

## Apply it

Run **`cp67_elements.sql`** in the Supabase SQL editor (idempotent).
Reminder: the live customer app reads these from the database — the phone
preview reflects unsaved picks instantly, but the real app changes only
after the SQL is applied AND you hit **Save** in the builder.

## Files

New:
- `checkpoint-67-element-pack/cp67_elements.sql`
- `atlas-rewards-app/lib/element-styles.ts`
- `atlas-rewards-app/components/customer/section-elements.tsx` —
  `SectionHeading`, `HeadingByStyle`, `SectionDivider` (server + client safe).

Changed:
- `app/[business]/app/page.tsx` — featured offer wears offer_card_style;
  Top-rewards heading + divider use the element pack.
- `app/[business]/app/layout.tsx` + `lib/design-styles.ts` +
  `components/ui/button.tsx` — `--atlas-cta-glow` CSS var plumbing.
- `components/customer/rewards-client.tsx` — themed headings, divider,
  Earn badge; passes element styles to offers.
- `components/customer/limited-offers-section.tsx` — themed heading +
  chips, CTA glow on Claim.
- `components/customer-preview/customer-preview.tsx` — featured-offer skin +
  all element styles mirrored live in the mock.
- `components/brand-editor/brand-editor.tsx` — Design elements picker
  section; 4 new fields saved.
- `lib/types/database.ts` — 4 new Business fields.

## Ship it

```bash
cd "C:/Users/andre/OneDrive/Documents/Claude/Projects/Atlas Engine APP"
git add checkpoint-67-element-pack checkpoint-66-section-layouts checkpoint-65-design-themes "checkpoint-02-brand-engine/atlas-rewards-app"
git commit -m "CP-67: design element pack (badges, headings, dividers, CTA glow) + featured offer wears offer-card style"
git push
```

Then run `cp67_elements.sql` (step above).
