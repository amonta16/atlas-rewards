# CP-184 · /medspa: motion, richer surfaces, video testimonial slots

Follow-up to CP-183 ("could look better, add animations, leave space for testimonial videos").

## What changed
- **Hero**: transparent header that turns frosted on scroll; headline lines rise in on load; practice photo unmasks behind the cycle dial (dial sits on a frosted disc); two slow-breathing glows; soft shine on the main CTA; pulsing dot on the audience chip.
- **Treatment marquee** under the hero (pauses on hover, screen-reader text provided).
- **Patient-year strip** draws itself when scrolled into view; dots and reminder diamonds pop in as the line reaches them.
- **What Atlas runs**: quartz accent bar on the open item, floating demo phone with a glow.
- **Parallax photo band** (new): "The best time to rebook her is before she starts wondering where to go."
- **Calculator**: grain + glow on the dark band; the big estimate number glides to new values.
- **Owners, in their own words** (new): three 9:16 video cards.
- Included grid lines draw in; setup steps connect with a line that draws across; FAQ answers ease in; closing band gets a parallax photo + grain.
- All motion is CSS transform/opacity and is disabled under `prefers-reduced-motion`.

## Testimonial videos: how to fill them
Edit `lib/landing/medspa-offer.ts` → `MEDSPA_TESTIMONIALS`:
- `embed`: a YouTube/Vimeo embed URL (e.g. `https://www.youtube.com/embed/VIDEO_ID`) or a direct `.mp4/.webm` URL (e.g. Supabase storage).
- `poster`: thumbnail image; `name`, `role`, `practice`, `city`; optional `quote` shown under the card.
- **Before ads run:** set `SHOW_MEDSPA_TESTIMONIAL_SLOTS = false` unless every slot has a real video. With it off, empty slots disappear and the section hides entirely if none have video. Never put placeholder or invented testimonials in front of paid traffic.

## Files
- `checkpoint-02-brand-engine/atlas-rewards-app/components/medspa/medspa-page.tsx` (rewritten)
- `checkpoint-02-brand-engine/atlas-rewards-app/components/medspa/cycle-dial.tsx` (mobile card position)
- `checkpoint-02-brand-engine/atlas-rewards-app/components/medspa/recall-calculator.tsx` (number tween)
- `checkpoint-02-brand-engine/atlas-rewards-app/app/medspa/medspa.css` (motion system)
- `checkpoint-02-brand-engine/atlas-rewards-app/lib/landing/medspa-offer.ts` (testimonial type + slots)

## Checks
- `tsc --noEmit` clean. Rendered at 1440 and 390 wide: no horizontal overflow, no runtime errors.
- Photos were mocked in the preview (image hosts are blocked from the build sandbox); check real photos on the Vercel preview.
