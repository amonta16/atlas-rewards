# packages/

- `core/`: code both apps share. Today: Supabase clients (browser, server, middleware with the CP-84 refresh fixes, service role), the shared session cookie (`.atlas-engine.app`), membership reading, Supabase image URLs, Stripe Connect helpers (`payments/`).
  `apps/medspa` uses it now. `apps/venues` still has its own copies under `lib/` and moves onto `core` in Phase 4.

Rules: nothing niche-specific in here, and anything you change here must keep both apps building.
