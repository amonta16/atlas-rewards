# CP-112 — Bookkeeping & Expense Management (+ Live-MRR manager)

Adds the third internal destination — **/agency/bookkeeping** — and fixes
the "can't add/edit/delete Live MRR" gap with a **Manage live clients**
modal on Revenue Analytics.

## Apply order

1. Run `cp112_bookkeeping.sql` in the Supabase SQL editor (AFTER
   cp111_founder_hq.sql). Idempotent — safe to re-run. It also creates the
   PRIVATE `expense-receipts` storage bucket + admin-only policies.
2. Deploy the app code (same commit).

## What's inside

- **Bookkeeping page** (admin-only, server-gated + RLS): monthly snapshot
  (live MRR, hosting paid, other recurring, one-time, total paid, upcoming
  bills, overdue bills, est. operating remainder, hosting % of MRR, est.
  gross margin — estimates labeled), with tabs:
  - *Hosting & Infra* — hosting bills + per-client hosting economics
    (shared costs stay agency-wide; unallocated amounts labeled)
  - *Recurring Bills* — templates with mark-paid, cancel, filters,
    renewal warnings
  - *Expenses* — one-time purchases + the full payment ledger, category
    splits (must sum exactly), tax-review workflow, archive-over-delete
  - *Mileage* — trips linkable to HQ field-sales events; ¢/mile rate is
    CONFIGURED per tax year (never hard-coded, never seeded)
  - *Tax Prep* — 10 filters, missing-receipt/missing-purpose checks,
    accountant CSV export + category summary export
- **Receipts**: photograph physical receipts (image upload) or link
  digital ones (URL); PDFs supported; sha256 dedupe; PRIVATE bucket,
  opened only via short-lived signed URLs.
- **Recurrence model**: bills are templates; `pay_recurring_bill()` writes
  one payment per occurrence (DB-unique — retries/two admins can't
  duplicate) and advances next_due_date. Editing a bill's amount NEVER
  rewrites past payments; cancelling stops future charges and keeps
  history.
- **Audit trail**: `bookkeeping_audit_log` — trigger-fed (created/updated/
  deleted with material old→new values + actor); read-only from the app.
- **Analytics integration**: "Operating Costs & Margin" section on Revenue
  Analytics (cards + Live MRR vs hosting vs total expenses vs est.
  remainder, monthly, from real paid records via `agency_expense_monthly`).
  Pipeline MRR is never mixed into revenue.
- **Live MRR manager**: list/edit/cancel/delete `agency_billing_subscriptions`
  rows + add plans; every change refreshes the analytics figures live.

## Guardrails

- Money = integer cents + explicit currency column. No floating-point math.
- No tax determinations — `tax_review_status` is a workflow for the
  accountant (Unreviewed → … → Accountant confirmed / Not deductible).
- Never store full card numbers/credentials — the payment-label field
  rejects anything that looks like a full PAN.
- All tables agency-admin-only via RLS; the page also gates server-side.
