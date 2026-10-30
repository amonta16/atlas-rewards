# CP-179 · Staff who are also guests no longer get trapped in the front desk

No SQL.

## The bug
`/<slug>/login` sent every privileged account (owner, manager, staff, agency) to `/manage`
after sign-in, and the "already signed in" check on the login page did the same. So an owner
who downloaded the guest app and signed in with his manager account (Chris at Flippo's) only
ever saw the front desk.

## Now
- **Sign-in lands in the guest app by default**, for everyone.
- **The desk is reached on purpose:** the `/manage` guard still sends people to
  `login?next=/<slug>/manage`, and `?staff=1` still means "desk". Desk tablets, the desk
  PWA install, the PIN keypad and agency "Front desk" links all work as before.
- **Staff get a two-way switch:**
  - Guest app → Profile tab → "Open the front desk" card (only shown to staff of that
    business or agency staff).
  - Front desk → "My guest app" in the sidebar (desktop) and the header (phone).

## Files
- `app/[business]/login/page.tsx` — `destinationAfterAuth` no longer routes by role
- `app/[business]/app/profile/page.tsx` — role check + front-desk card
- `components/manager/manager-dashboard.tsx` — "My guest app" links
- `components/staff/app-switch.tsx` — new: both links, subdomain- and path-safe

## For Chris (after deploy)
In the front desk, tap **My guest app**. If he added a home-screen icon while on the desk, that
icon will keep opening the desk (that's the desk's own install). Delete it and add the icon
again from the guest app, or just use the AE Rewards app.
