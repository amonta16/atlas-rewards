# CP-94 — Full-bleed app icon + de-emoji polish (past prize, redeem pop)

**Verified:** `tsc --noEmit` = 0 errors, full `next build` green.
**Files:** 4 components + `lib/native.ts` (web, deploys via Vercel — no rebuild) + iOS/Android app icons (need a Mac/Android rebuild to show up).

## 1. App icon now fills the template

Your circle logo was sitting inside the square icon canvas with margins — that's the
"cropped" look. The new icon is built FROM your uploaded `Atlas_circle_logo.png`:

- The blue gradient now bleeds edge-to-edge (corners filled with the same gradient the
  circle uses, so the seam is invisible), and the white hexagon mark is large and centered.
- **iOS:** replaced `mobile-shell/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
  (the single 1024×1024 universal icon).
- **Android:** replaced the full `mipmap-*` launcher set — legacy square, round, and the
  adaptive-icon foreground at all 5 densities. The adaptive foreground keeps the hexagon
  inside Android's safe zone, so circle/squircle/teardrop masks all crop cleanly.

The icon lives in the app binary, so it changes **only after you rebuild**:
Mac → `npx cap sync ios` → Run (and same for Android when you next build it).

## 2. "Already spun" — the prize IS the screen now

The green ✅ emoji in the wheel modal is gone. When someone reopens the wheel after
spinning, they now see **what they won today**: the prize's own photo (or your business
logo) in the branded glowing frame, "You won", and the prize name as the headline —
same visual language as the reveal moment. If nothing is stored locally (spun on another
device), it falls back to a brand-ringed gift icon, never an emoji.

Also swept while in there: the 🎆/🎉/✨ reveal fallbacks → a tier-colored PartyPopper
icon tile, the "…claim. 🎉" copy, the "Ready to check in ✨" chip, and "something rare ✨"
on the Mystery Reward card. Zero emojis left in the customer reward surfaces.

## 3. Claimable rewards pop now

On the Home "Top rewards" grid, a reward you can afford stops whispering:

- the whole card breathes with a brand-colored glow (CSS-only pulse)
- a gradient **READY** ribbon sits on the photo
- the 9px "Tap to redeem ✨" line is replaced by a full-width gradient
  **REDEEM NOW** button (gift icon, brand colors)
- the padlock next to the point cost becomes a lightning bolt once it's affordable

Locked cards are unchanged — progress bar + "X to go".

## 4. Bonus: the promised push-listener cleanup

`registerNativePush` no longer stacks a new `registration` listener on every boot /
business switch — the old handle is removed first. Your `[subscribe] saved native token ×8`
log noise drops to one line per session.

## Ship it

**Windows:**
```bash
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
git add checkpoint-94-icon-and-polish checkpoint-02-brand-engine/atlas-rewards-app/components/customer checkpoint-02-brand-engine/atlas-rewards-app/lib/native.ts "mobile-shell/ios/App/App/Assets.xcassets" "mobile-shell/android/app/src/main/res"
git commit -m "CP-94: full-bleed app icons (iOS+Android), past-prize spun state, pop-out redeem treatment, de-emoji sweep, push listener cleanup"
git push
```

**Mac (icon only):**
```bash
cd ~/atlas-rewards && git pull && cd mobile-shell
npx cap sync ios && npx cap open ios     # then ▶ Run — new icon appears after install
```
Everything else (spun state, redeem pop, emoji sweep) reaches phones via the Vercel
deploy with no rebuild.

## Verify

1. After Vercel deploys: spin the wheel, close it, tap the spin card again → you should
   see the prize you won (photo/logo + name), no green check.
2. Home → Top rewards: any reward you can afford should glow, show READY on the photo,
   and have the gradient REDEEM NOW button.
3. After the Mac rebuild: delete the old app from your phone first (iOS caches icons
   aggressively), then install — the icon should fill the whole rounded square.
4. Xcode log: `[subscribe] saved native token` should appear once, not ~8 times.
