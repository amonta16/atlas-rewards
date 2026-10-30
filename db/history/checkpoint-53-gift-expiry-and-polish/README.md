# CP-53 — Gift lifecycle, brand-colored offer ring, urgency + branded loading

Six fixes:

1. **Featured offer ring uses your brand colors.** The home featured-offer card had a fixed cyan ring/ribbon that clashed with some brands — it now uses the business's secondary/primary/accent.
2. **Locked rewards pop up details on Home.** Tapping a locked top-reward used to silently bounce to the Rewards tab. It now opens a detail popup (image, point cost, progress bar, "X points to go", and ways to earn). Unlocked rewards still deep-link straight to the redeem flow.
3. **Used / expired gifts disappear from Saved gifts.** Once the front desk marks a gift delivered (or it expires), it no longer shows in the customer's saved gifts. (Was showing grayed-out "Redeemed"/"Expired" rows.)
4. **Every expiration countdown is bright red.** Across the featured card, the sticky offer banner, active rewards, saved gifts, and limited offers — countdowns are now bright red with a pulsing dot for urgency.
5. **30-day default expiry on redeemed gifts.** Saved gifts now expire 30 days from when they're saved if the offer has no custom expiry (custom offers keep their own). Reward redemptions already expire in 30 days.
6. **Branded loading screen everywhere.** Switching tabs on the installed app showed the generic Atlas loading screen because the slug couldn't be read from the subdomain path. It now falls back to a "last business" brand cache, so the business's color + logo show on every loading screen.

## 1. Apply the SQL (required)

Supabase → SQL editor → **`cp53_migration.sql`** → Run. Idempotent. It rewrites `my_saved_offers` to hide used/expired gifts and apply the 30-day default expiry.

## 2. Deploy

Push (block below) → Vercel redeploys. Hard-refresh / reopen the installed app to clear the cached shell.

## Files

**SQL**
- `cp53_migration.sql` — `my_saved_offers` (hide fulfilled, 30-day default expiry)

**New**
- `components/customer/top-rewards-grid.tsx` — Home rewards grid + locked-reward detail popup

**Changed**
- `app/[business]/app/page.tsx` — brand-colored offer ring, red countdown, uses TopRewardsGrid
- `components/customer/featured-offer-banner.tsx` — red countdown
- `components/customer/active-redemptions.tsx` — countdown always bright red
- `components/customer/saved-gifts-section.tsx` — hide used/expired (client safety) + red countdown
- `components/customer/limited-offers-section.tsx` — red countdown
- `components/ui/brand-cache-writer.tsx` — also writes `atlas-brand-last`
- `components/ui/branded-loading.tsx` — falls back to `atlas-brand-last` (fixes subdomain/PWA)

---

## Ship it

Run from the repo root (the **Atlas Engine APP** folder):

```bash
git add -A
git commit -m "CP-53: brand-colored offer ring, locked-reward popup, hide used/expired gifts, 30-day gift expiry, red countdowns, branded loading on PWA"
git push
```
