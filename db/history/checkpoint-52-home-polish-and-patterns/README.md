# CP-52 — Customer home polish + background patterns

Six changes to the customer app, plus a new design feature.

## What changed

1. **Spin & Streak moved below rewards, side by side.** The Daily Spin and Streak cards used to stack full-width *above* the rewards. They're now compact half-width cards sitting **below** the rewards grid, next to each other.
2. **At least 4 rewards on Home + a clear "View more rewards" button.** Home now pulls 4 top rewards (2×2) and adds a high-contrast brand-gradient **View more rewards** button beneath them.
3. **Bolder offer banner.** The sticky featured-offer banner title is now black-weight, larger, and uppercase so it reads like a real promo, not a quiet label.
4. **VIP quick-action hidden when membership isn't live.** If the business hasn't turned on a paid membership (`membership_billing_public.is_enabled = false`), the VIP pill no longer appears in the header — no teasing a product that isn't on.
5. **Background patterns (new Design feature).** A faint, tiled texture behind the customer app for a warmer feel. Pick one per business in the brand editor → **Design → Background pattern**:
   - **No pattern** (default)
   - **Soft geometric** — neutral dots, fits anything
   - **Medspa** — botanical leaves
   - **Restaurant** — cups & cutlery
   - **Arcade** — retro pixels
   - **Logo tile** — your own logo, faintly repeated
   Patterns are tinted with your brand color and kept very low-opacity so content stays the focus.
6. **Preview stays in sync.** The agency phone preview defaults to a **live frame of the real app**, so all of the above show up there after you save. The instant (mock) preview also picks up the chosen pattern and the bolder banner.

7. **Frosted-glass header over the hero (CP-52.1).** The logo + quick-action pills now sit on a subtle white frosted-glass bar floating over the hero image (a touch of blur + white veil, kept light so the logo and icons stay crisp), instead of a separate solid white strip above it.

## CP-52.4 additions

- **Widgets no longer bleed into the pattern.** Reward cards, the Spin & Streak cards, and the "Need more points" rows now have a defined ring + soft shadow on a solid background (the earn rows were a faint tint that let the pattern show through). Applied on **both** Home and the Rewards tab.
- **Header is global.** The logo + quick-action bar now lives in the app shell, so it shows on **every** tab (Home, Check-in, Rewards, Profile) — not just Home.
- **More background patterns.** Added **Brand glow** (a soft full-bleed gradient in your brand colors), **Swirls**, **Rings**, **Waves**, **Confetti**, and **Honeycomb**, alongside the originals (Dots, Medspa, Restaurant, Arcade, Logo, None). All tint to your brand colors.

> Run **`cp52_more_patterns.sql`** too (widens the allowed-pattern check for the new ids).

## CP-52.5 — crash fix + bigger designs

- **Fixed the Rewards (and Scan/Profile) crash.** Those tabs already drew their own logo+quick-action header, so the new *global* header mounted `HeaderActions` twice with the same membership → two realtime subscriptions collided on the same channel name and threw a client-side exception. Removed the per-tab copies; the global header (in the app shell) is now the single instance and persists across tabs.
- **"Larger bodies" designs added:** **Aurora** (big bold bands of brand color), **Color blobs** (large flowing shapes), and **Low-poly** (faceted gradient) — all tailored to the business's brand colors, in the same Design picker. Re-run `cp52_more_patterns.sql` (it now allows these ids).

## CP-52.6 — bleed fix, spin icon, more designs, location card

- **Fixed the Rewards card bleed.** Locked reward cards used `opacity-60`, which made the whole card translucent so the background pattern showed through. Removed it — cards stay opaque (locked is still clear from the lock icon + progress bar).
- **Daily Spin icon** is now a real **dice** icon (lucide `Dices`) instead of the 🎰 emoji, tinted to the brand color.
- **More designs:** **Diagonal**, **Topography** (contour lines), **Bubbles**, and **Terrazzo** — all brand-colored.
- **Location card (new builder feature).** A map + address + hours + **Call now** button at the bottom of the customer Home. Toggle it on and paste a Google Maps link + phone in the brand editor under **Design → Location & map** (address draws the map with no API key needed). No SQL — it's stored in the existing `contact_info` / `widget_config`.

## 1. Apply the SQL (required)

Supabase → SQL editor → **`cp52_migration.sql`** → Run, then **`cp52_more_patterns.sql`**. Both idempotent. They add `businesses.background_pattern` (default `none`) and allow the new pattern ids.

### ⚠️ If the pattern isn't showing on the live app

Almost always one of these:

1. **The SQL hasn't been applied.** Without the `background_pattern` column, saving a pattern in the editor silently has nothing to write to (and the app reads it as `none`). Run `cp52_migration.sql` first, then re-pick the pattern and **Save** in the brand editor.
2. **You're looking at the installed PWA.** The home-screen app caches the shell — fully close it and reopen, or test in a normal browser tab first. A redeploy + reopen picks up the new CSS.
3. **It was too faint.** CP-52.1 bumps the pattern opacity so it's clearly (but still gently) visible in the page margins and the gaps between cards. Patterns intentionally don't show *through* the white content cards — they frame them.

## 2. Deploy

Push (block below) → Vercel redeploys.

## Notes

- The Spin/Streak row is a 2-up grid. If a business has **streaks turned off** (or the member has already passed their first streak reward), the Streak card hides itself and the Spin card sits in the left half — expected.
- Patterns show through the page's margins and the gaps between cards (content cards stay white), which is what keeps them subtle.

## Files

**SQL**
- `cp52_migration.sql` — `background_pattern` column

**New**
- `lib/patterns.ts` — pattern library (SVG tiles + `patternStyle()`)

**Changed**
- `app/[business]/app/page.tsx` — reorder, 4 rewards, View-more, VIP gating, side-by-side row
- `app/[business]/app/layout.tsx` — applies the background pattern
- `components/customer/daily-spin-button.tsx` — `compact` variant
- `components/customer/streak-mini.tsx` — `compact` variant
- `components/customer/header-actions.tsx` — VIP pill gated on `vipEnabled`
- `components/customer/featured-offer-banner.tsx` — bolder title
- `components/brand-editor/brand-editor.tsx` — Background-pattern picker + save
- `components/customer-preview/customer-preview.tsx` — pattern + bolder banner in the mock preview
- `lib/types/database.ts` — `background_pattern` on `Business`

---

## Ship it

Run from the repo root (the **Atlas Engine APP** folder):

```bash
git add -A
git commit -m "CP-52: home reorder + side-by-side spin/streak, 4 rewards + view-more, bold offer banner, VIP gating, background patterns"
git push
```
