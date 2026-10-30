# CP-96 — Support page + in-app Help & Legal links (App Store prep)

**Verified:** `tsc --noEmit` = 0 errors, full `next build` green (`/support` renders static).
**Files:** 2 new + 1 edited. All web — deploys via Vercel, no rebuild.

## What's new

1. **`/support`** — public customer-support page at `https://www.atlas-engine.app/support`,
   matching the legal pages' look. Sections: points/rewards questions → ask the business
   at the counter; app issues → email; account & data → points at in-app delete + privacy
   policy; Terms/Privacy links. This is your **Support URL for App Store Connect**.

2. **Profile tab → "Help & legal" card** (`profile-help-links.tsx`) — three rows:
   Help & Support (/support), Terms of Service (/legal/terms), Privacy Policy
   (/legal/privacy). Relative links, so they work on every business subdomain and inside
   the native app. This satisfies Apple's "privacy policy reachable in-app" expectation
   (Guideline 5.1.1). Sits between Notifications and Delete account.

## One thing YOU must do (2 minutes)

The pages use **support@atlas-engine.app**. That's a free **alias**, not a paid seat:
Google Admin console → Directory → Users → your user → **Add alternate emails** →
`support`. Mail to it lands in your normal inbox. (If the domain's email is on a
different setup, a Workspace group named support@ works too.)

## App Store Connect fields (copy-paste)

- Privacy Policy URL: `https://www.atlas-engine.app/legal/privacy` (already live)
- Support URL: `https://www.atlas-engine.app/support` (live after this deploy)

## Ship it

**Windows:**
```bash
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
git add checkpoint-96-support-page "checkpoint-02-brand-engine/atlas-rewards-app/app/support" "checkpoint-02-brand-engine/atlas-rewards-app/app/[business]/app/profile/page.tsx" checkpoint-02-brand-engine/atlas-rewards-app/components/customer/profile-help-links.tsx
git commit -m "CP-96: /support page + Profile-tab Help & legal links (App Store privacy/support requirements)"
git push
```

## Verify

1. After Vercel deploys: open `https://www.atlas-engine.app/support` — support page loads.
2. In the app: Profile tab → new "Help & legal" card → all three links open.
3. Set up the `support@` alias, send yourself a test email to it.
