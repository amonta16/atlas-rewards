# Checkpoint 29 — Automated offers revamp

Image-first templates, voice messages, redesigned edit panel.

## What Andrew asked for

1. Make automated offers image-based (not flat icon thumbnails).
2. Redesign the edit modal to match the slide-in panel mock —
   image + Active toggle row, **Percentage / Set $ amount** tab
   toggle, value input, voice message uploader with the +158%
   conversion callout.
3. **Remove** the "Include products most similar…" product
   include/exclude block.
4. Add St. Patrick's Day to the holiday lineup.

User said they'll provide themed gift-box images. Until they
arrive, every row falls back to a brand-gradient + emoji card so
the feature ships looking presentable.

## What CP-29 ships

### 1. Image-first list view

`components/agency/automated-offers-manager.tsx`:

- Each row is now a 4-column grid: `Occasion | Content | Status | menu`
  exactly like the mock.
- Thumb resolution order:
  1. `business_automated_offers.custom_image_url` (per-business upload)
  2. `automated_offer_templates.default_image_url` (system default)
  3. `/automated-offers/{slug}.png` (this checkpoint's drop folder)
  4. brand-gradient card with the template emoji (auto-fallback if
     the image fails to load)
- Content cell renders one of: `No Discount`, `10% off`, `$5 off`,
  `+200 pts` — derived from `discount_type` + `discount_value`.
- Status pill: green dot **Active** / red ✕ **Inactive**.
- 3-dot menu: Edit + Turn off (Turn off is disabled when already
  inactive).

### 2. Redesigned slide-in edit panel

Sheet slides in from the right (`w-[480px]` on desktop, full-width
on mobile). Sections, top to bottom:

- **Back arrow + "Edit automated offer"** header.
- Template **name** + auto-generated subtitle. Subtitle reads
  naturally per trigger type:
  - Birthday: *"This offer will launch on every app user's birthday. Offer lasts 7 days"*
  - Date: *"This offer will launch around October 31. Offer lasts 7 days"*
  - Inactivity: *"This offer will launch when a member hasn't visited in 14+ days…"*
- **Image + Active toggle row** (image left, toggle card right).
- **Discount section**:
  - Pill tab toggle: `Percentage | Set $ amount`. Switching tabs
    reinterprets the existing saved value (10% ↔ $10) so the
    agency doesn't have to retype it.
  - Numeric input with a suffix label (`% off per purchase` /
    `$ off per purchase`).
  - `0` (or empty) saves as `discount_type = 'none'`.
- **Voice message section**:
  - Green callout: *"See a +158% boost in conversions using voice
    notes!"*
  - `AudioUploader` (MP3/WAV) — see below.
- Sticky footer: `Cancel` + `Update offer` button.

The product include/exclude block from the prior design is
intentionally not present.

### 3. AudioUploader component

`components/agency/audio-uploader.tsx`:

- Mirrors the `ImageUploader` API (`bucket`, `pathPrefix`, `value`,
  `onChange`).
- Empty state: brand-neutral dashed dropzone with
  *"Click to upload or drag and drop · Audio file (MP3 or WAV)"*.
- Filled state: collapses to a native `<audio controls>` player +
  Replace / Remove actions so the agency can preview their own
  voice note in place.
- Uploads to the `voice-messages` bucket. Public-read RLS so
  customers can play without auth.

### 4. Customer-facing playback

`components/customer/featured-offer-banner.tsx`:

When the featured offer carries a `voice_message_url`, the banner
renders a compact **▶ Voice** pill next to the title. Tap to play,
tap again to pause. `preload="none"` so the audio file isn't
fetched until the customer asks.

`app/[business]/app/layout.tsx` — the `bannerOffer` type now
includes `voice_message_url: string | null` so the server-side
fetch passes it through to the banner client component.

### 5. Default images folder

`public/automated-offers/` — empty folder + `README.md` listing the
12 expected filenames and aspect-ratio guidance. Andrew can drop
images at his own pace; missing ones gracefully fall back to the
brand-gradient + emoji card.

### 6. SQL migration

`cp29_migration.sql` — self-contained, idempotent. What it does:

1. `ALTER TABLE business_automated_offers ADD COLUMN IF NOT EXISTS voice_message_url text`
2. `INSERT … ON CONFLICT DO UPDATE` adds the `st_patricks` template
   (March 17 ± 3 days).
3. Drops + recreates `upsert_business_automated_offer` with the
   new 11-arg signature (adds `p_voice_message_url`).
4. Drops + recreates `list_automated_offers_for_business` to return
   `voice_message_url` and the template's `default_image_url`.
5. Creates the `voice-messages` storage bucket + RLS:
   - Staff (agency admin / business manager / business staff) can
     upload, replace, delete.
   - Public can read (so the `<audio>` tag works without auth).
6. Adds `voice_message_url` column to `public.offers` (the table
   the daily cron writes to) and rebuilds
   `trigger_automated_offers()` so the fired offer carries the
   voice URL alongside title / description / image.
7. Drops + recreates `featured_offer()` to surface
   `voice_message_url` to the customer side.

`NOTIFY pgrst, 'reload schema'` at the end so the new column shows
up in the JS client immediately.

## Files touched

```
checkpoint-29-automated-offers-revamp/cp29_migration.sql
checkpoint-29-automated-offers-revamp/README.md
components/agency/automated-offers-manager.tsx        (rewritten)
components/agency/audio-uploader.tsx                  (new)
components/customer/featured-offer-banner.tsx
app/[business]/app/layout.tsx
public/automated-offers/README.md                     (new)
public/automated-offers/                              (drop images here)
```

## SQL to run

1. Apply `cp29_migration.sql` in the Supabase SQL editor. Safe to
   re-run.
2. Verify:

   ```sql
   -- new column
   SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='business_automated_offers'
     AND column_name='voice_message_url';

   -- new template
   SELECT slug, name FROM public.automated_offer_templates WHERE slug='st_patricks';

   -- storage bucket
   SELECT id, public FROM storage.buckets WHERE id='voice-messages';

   -- upsert RPC accepts 11 args
   SELECT pronargs FROM pg_proc WHERE proname='upsert_business_automated_offer';

   -- featured_offer RPC returns voice_message_url
   SELECT proargnames FROM pg_proc WHERE proname='featured_offer';
   ```

## How to drop images

Drop each themed gift-box illustration in
`checkpoint-02-brand-engine/atlas-rewards-app/public/automated-offers/`
named exactly as the template slug (hyphenated):

```
birthday.png        christmas.png         new-years.png
black-friday.png    client-anniversary.png st-patricks.png
comeback.png        easter.png            summer-kickoff.png
halloween.png       valentines.png        welcome.png
```

PNG, 4:3 or 3:2, <300 KB. See the folder's own README for the
full table.

## CP-29.1 follow-up — Popup reveal + Limited offers section

Andrew's feedback on CP-29: the phone preview should actually show
the customer experience — the gift popping in, the unwrap moment,
the voice playback — and the discount should land in the rewards
list with a countdown. CP-29.1 ships that.

### What CP-29.1 adds

#### `OfferRevealPopup` (customer)

- Auto-pops the first time the customer opens the app and a new
  (unseen) offer is live. No trigger icon — it just appears.
- Wrapped gift box (pure SVG, brand-colored, zero asset) → tap to
  unwrap → reveal of image + headline + discount chip + optional
  voice play button + live countdown.
- Auto-dismisses after ~6s if the customer doesn't interact (offer
  still lands in their rewards list either way).
- Seen-state stored in `localStorage` per-device per-offer-id so
  the popup only fires once per device. Capped at 50 ids.
- Inline keyframes — pop, reveal, confetti — no Tailwind plugin
  dependencies.

#### `OfferRevealWatcher` (customer app shell)

- Subscribes to `public.offers` postgres_changes for the current
  business. Re-pulls `featured_offer()` on INSERT or UPDATE-to-
  featured and pops the popup if the id isn't in seen-set.
- Also runs once on mount via `featured_offer()` so refresh paths
  still see the popup if they missed the realtime event.
- Wired into `app/[business]/app/layout.tsx` next to the existing
  `FeaturedOfferBanner` and `CelebrateWatcher`.

#### `LimitedOffersSection` on the Rewards tab

- New section above Rewards Store. Reads `list_active_offers()`
  (new RPC) for the business and renders every active offer as
  a card with image, headline, discount chip, voice marker,
  live countdown.
- Each card has a "Replay reveal" link that removes that offer
  from seen-set and re-fires the popup.
- Hidden when nothing's active so the page doesn't show an empty
  state stub.

#### `AutomatedOfferPopupPreview` (agency edit panel)

- Mini phone frame at the top of the slide-in edit panel showing
  the real `OfferRevealPopup` component auto-looping through
  wrap → reveal → dismiss every ~8s.
- Reads the in-flight draft so every edit (image, discount, voice)
  updates the preview live.
- Falls back to friendly per-slug default copy ("NAME, happy
  birthday!" instead of "🎁 Birthday Special") so the agency sees
  what a personalized version looks like before they customize.
- Uses CSS selectors to demote the popup's `fixed inset-0`
  positioning to `absolute` so it stays inside the phone frame.

#### "Personalize message" collapsible

- Added a `<details>` block in the edit panel — collapsed by
  default to keep the panel clean — with Headline + Description
  inputs that write to `custom_title` / `custom_description`.
- Uses `NAME` placeholder convention so the agency can write
  personalized copy.

### CP-29.1 SQL (`cp29_1_popup_and_discount.sql`)

Run AFTER `cp29_migration.sql`. Self-contained, idempotent.

1. `ALTER TABLE public.offers ADD COLUMN IF NOT EXISTS discount_type
   text, discount_value int` — so fired automated offers carry
   their discount data into the customer-side reveal.
2. Rebuilds `trigger_automated_offers()` to propagate
   discount_type + discount_value (and now sets
   `is_automated = true` on the fired offer).
3. Rebuilds `featured_offer()` to return the discount columns.
4. Adds `list_active_offers(business_id)` RPC — used by the new
   `LimitedOffersSection`. Returns all currently-active offers
   for the business, ordered featured-first then by soonest
   expiry.
5. `NOTIFY pgrst, 'reload schema'`.

### Files touched (CP-29.1)

```
checkpoint-29-automated-offers-revamp/cp29_1_popup_and_discount.sql  (new)
components/customer/offer-reveal-popup.tsx                            (new)
components/customer/offer-reveal-watcher.tsx                          (new)
components/customer/limited-offers-section.tsx                        (new)
components/agency/automated-offer-popup-preview.tsx                   (new)
components/customer/rewards-client.tsx                                (slot in LimitedOffersSection)
components/agency/automated-offers-manager.tsx                        (preview + personalize collapsible)
app/[business]/app/layout.tsx                                         (wire OfferRevealWatcher)
```

## What's next

CP-30 — Manager tab day-to-day ops + small front-desk polish
(QR scanner support lands inside CP-30 since it's a manager-facing
ship). CP-31 — Backend launch hardening.
