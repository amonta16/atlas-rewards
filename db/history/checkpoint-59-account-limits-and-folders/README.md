# CP-59 — One account per phone + admin-portal folders

Two things in this checkpoint, plus a design tweak to CP-58.

## 1. Stop welcome-gift farming (one account per phone)

Businesses give welcome gifts for downloading the app, and people farm them by
making a fresh account with a **new email but the same phone**. Email is already
unique (Supabase won't let two accounts share an email), so the gap was the
phone. Now a phone number can belong to only one Atlas account.

- **At signup** (`app/[business]/signup/page.tsx`): before creating anything, we
  call `signup_identity_available(email, phone)`. If that phone is already tied
  to an account on a **different email**, we block with a clear message. This is
  privacy-safe — the check returns booleans only, never anyone's email.
- **Backstop** (`enforce_unique_customer_phone` trigger on `profiles`): the
  database itself refuses to let two profiles share a normalized phone, so even
  a bypassed client can't duplicate a phone.
- **Returning customers are unaffected.** One human = one Atlas account shared
  across every business, so someone who already has an account (same phone +
  same email) joining a second business keeps their account — the existing
  "sign in & enroll" flow handles them. Only a *new email* on an existing phone
  is treated as farming.

Phones are normalized to their last 10 digits (`normalize_phone`), so
`(555) 123-4567` and `5551234567` count as the same number.

## 2. Admin-portal folders

The agency dashboard was a flat list. Now
(`components/agency/agency-dashboard-client.tsx`):

- A **Folders / By industry / All** toggle at the top of the business list.
  - **Folders** — your manual named folders (below).
  - **By industry** — auto-groups by each business's industry, no setup.
  - **All** — the old flat list.
- **Collapsible sections** with a count on each header.
- Each business row has a **Folder** button → a dropdown to move it into an
  existing folder, make a **new folder** (just type a name), or set it back to
  **Unfiled**. Assignment saves to `businesses.folder` instantly (optimistic).
- The catch-all group (Unfiled / Uncategorized) always sinks to the bottom.

New column: `businesses.folder` (nullable text). See `cp59_migration.sql`.

## 3. CP-58 design tweak (per your feedback)

Removed the fixed-color gradient palettes (they didn't do much) and added five
**flowing, brand-tinted full-bleed backgrounds** to the Background pattern
picker instead — they use *your* brand colors, so they actually fit each app:

- **Mesh** — a rich flowing mesh of your colors.
- **Silk** — overlapping flowing ribbons.
- **Glow orbs** — soft glowing orbs scattered around.
- **Ocean waves** — layered waves along the bottom.
- **Rolling hills** — soft layered hills at the bottom.

All live in `lib/patterns.ts` and work on top of the surface color / dark mode
just like the other designs.

## To ship

1. Apply `cp59_migration.sql` in Supabase (phone lock + `folder` column).
2. Commit + push (block below); Vercel redeploys.
3. Test:
   - Sign up a customer, then try a **new email with the same phone** → blocked.
   - Same email + phone at another business → still works.
   - On the agency dashboard, switch the **Folders / By industry / All** toggle,
     make a folder, and move a couple businesses into it.

## Files touched

- `cp59_migration.sql` (new) — `normalize_phone`, phone-uniqueness trigger,
  `signup_identity_available` RPC, `businesses.folder` column.
- `app/[business]/signup/page.tsx` — pre-signup phone check.
- `components/agency/agency-dashboard-client.tsx` — folder grouping UI.
- `lib/types/database.ts` — `businesses.folder`.
- `lib/patterns.ts` — flowy backgrounds (replaces CP-58 gradient palettes).

## Verification note

Same as CP-58: the sandbox `tsc` is unusable for this project — the Linux mount
serves bash **truncated** copies of recently edited files (confirmed here: bash
read `types/database.ts` cut off mid-string, and a stale pre-fix `design-styles.ts`).
Edits were verified against true file state via the editor, not bash `tsc`.
