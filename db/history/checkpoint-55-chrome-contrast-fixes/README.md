# CP-55 — Chrome contrast fixes (no SQL)

Follow-ups to the custom header/background colors so nothing blends.

1. **Header quick-action pills adapt to the header color.** The pills (Check-in / Streak / VIP) now get a contrast ring that flips light on dark headers, and the translucent "Check in" pill switches to a white treatment on a dark/custom header instead of fading into it.
2. **Bottom nav stops blending on dark.** The Home / Check-in / Rewards / Profile buttons now switch to light text on a dark header/nav color (active = white, inactive = soft white), instead of staying grey and disappearing.
3. **Location / Call-now sits on solid white.** The map + address + Call-now block is now a solid white band at the bottom of Home, so the background pattern doesn't show through behind it.

(Also from the prior change: the "Membership — coming soon" card is hidden entirely when membership isn't enabled.)

## Deploy

No SQL. Push and redeploy:

```bash
git add -A
git commit -m "CP-55: header pills + bottom nav adapt to chrome color, location card on solid white"
git push
```

## Files changed
- `components/customer/header-actions.tsx` — `headerColor` prop, adaptive ring + check-in pill
- `components/customer/customer-header.tsx` — pass header color down
- `components/customer/app-shell.tsx` — nav icon/label colors adapt to nav color
- `components/customer/location-card.tsx` — solid white full-width band
- `components/customer/membership-section.tsx` — hide entirely when not enabled (prior change)
