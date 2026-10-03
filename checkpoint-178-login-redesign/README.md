# CP-178 · Login pages redesign (split-screen, gradient panels)

No SQL. Sign-in logic is unchanged: password, magic link, role-aware redirect, front-desk PIN link,
?next / ?confirm / ?error handling all behave exactly as before. Only the look changed.

## Atlas login (`/login`, agency admins + VAs)
Dark Atlas theme: deep-ocean mesh gradient panel with the Atlas mark, a champagne rule and two
fine diagonal lines (left, desktop only); dark form with icon inputs, a password eye toggle, a
champagne Sign in button and an "or / Email me a sign-in link" divider (right). On phones it's a
single dark column with the Atlas mark on top.

## Business login (`/<slug>/login`, managers, staff and customers)
Split screen in **the business's own brand**: a mesh gradient built from its primary, secondary
and accent colors, its hero photo blended in, its logo + name. The form is on white with brand-colored
button and links. On phones the panel becomes a short branded band above the form. Every
business gets its own look automatically from the brand colors already set in the builder.

## Files
- `app/(agency)/login/page.tsx` — Atlas login (also normalizes the file back to LF line endings)
- `app/[business]/login/layout.tsx` — new: branded split-screen shell (server, reads brand via `resolve_business_by_slug`)
- `app/[business]/login/page.tsx` — form restyled to sit in the shell
- `components/auth/auth-grain.tsx` — shared film-grain overlay

## Not changed (next, if you like it)
`/forgot-password`, `/reset-password`, `/signup` and the front-desk PIN page still use the old card.
Wrapping them in the same layout is a small follow-up.
