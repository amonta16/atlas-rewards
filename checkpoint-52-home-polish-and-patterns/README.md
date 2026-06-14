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

## 1. Apply the SQL (required)

Supabase → SQL editor → **`cp52_migration.sql`** → Run. Idempotent. It just adds `businesses.background_pattern` (default `none`).

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
