# packages/

Empty until Phase 2. The plan:

- `core/`: Supabase clients (browser, server, service role), sign-in helpers, push sending, points ledger, shared types. Used by both `apps/venues` and `apps/medspa`.
- `ui/`: only the truly generic pieces (buttons, sheets, toasts). Each app keeps its own look.

Anything niche-specific stays inside its app.
