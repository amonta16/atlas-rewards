# CP-95 — Rewards-tab sparkle, one-tap bell permission, front desk keeps the customer

**Verified:** `tsc --noEmit` = 0 errors, full `next build` green.
**Files:** 4 web components. Everything deploys via Vercel — **no Mac rebuild needed**.

## 1. Rewards tab: last sparkles gone, claimable rewards pop

CP-94 fixed Home; the Rewards tab store had its own copies. Both layouts fixed in
`rewards-client.tsx`:

- Grid/carousel/spotlight cards: "Tap to redeem ✨" → full-width gradient **REDEEM NOW**
  button (same treatment as Home), padlock → lightning bolt once affordable.
- List layout rows: "Redeem ✨" → gradient **REDEEM** chip.
- Locked cards unchanged (progress bar + "X to go").

## 2. Notification bell: one tap now opens the iPhone permission dialog

Found the real bug behind "I click it once, the animation stops, then I need to click it
again": the spotlight overlay swallowed **every** tap — including taps on the glowing
bell itself — and only dismissed. The permission dialog needed a second, separate tap on
the bell.

Now a tap **inside the spotlight** dismisses *and* forwards the click to the bell, so the
iOS permission prompt opens on that first tap. Taps anywhere else still just dismiss.
Also: auto-dismiss extended 9s → 14s so the moment breathes longer, and the hint text now
says "Tap the bell to enable · anywhere else to dismiss".

## 3. Front desk: the customer stays on screen

Two changes that kill the "please scan again" dance:

**a. Success screen returns to the customer.** After "Check in" (or any award), the
green success screen's primary button is now **"Back to \{first name\}"** — it reopens
their profile with a freshly fetched points balance, ready for "Award by purchase".
"Done — next customer" (secondary) exits to the dashboard like before. Bonus: after an
Undo, staff also land back on the member to re-grant the corrected amount.

**b. "Previous customer" quick action.** The desk tab now shows a one-tap
**Previous customer → Reopen** card (avatar + name) for the last member served — scan,
search, or code entry all remember. Reopening always re-fetches the live balance, so
it's safe even minutes later.

## Ship it

**Windows:**
```bash
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
git add checkpoint-95-desk-flow-polish checkpoint-02-brand-engine/atlas-rewards-app/components/customer/rewards-client.tsx checkpoint-02-brand-engine/atlas-rewards-app/components/customer/enable-push-nudge.tsx checkpoint-02-brand-engine/atlas-rewards-app/components/manager/award-points-panel.tsx checkpoint-02-brand-engine/atlas-rewards-app/components/manager/manager-dashboard.tsx
git commit -m "CP-95: rewards-tab redeem treatment, one-tap bell permission, front desk keeps customer open + previous-customer quick action"
git push
```

## Verify

1. Rewards tab: any affordable reward shows the gradient REDEEM NOW button; list layout
   shows the REDEEM chip. No ✨ anywhere.
2. Fresh signup on iPhone: bell spotlight appears → tap **the bell** once → OS
   notification dialog opens immediately.
3. Front desk: scan someone → Check in → success screen → "Back to \{name\}" → their
   profile with updated balance → Award by purchase. Then Done → desk tab shows the
   "Previous customer" card; tap Reopen → profile returns.
