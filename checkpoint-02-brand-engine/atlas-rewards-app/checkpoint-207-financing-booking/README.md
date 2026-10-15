# CP-207 · Pay over time (Klarna + Affirm) and Dermis-style booking

**Check after push:** `/<slug>/app/store` (Shop → a package → Checkout), `/<slug>/app/store?tab=treatments`, `/<slug>/app/book`, `/<slug>/app/care`. Builder: Brand editor → Treatments (new "Scheduling link" per treatment + "How patients book" card) and Shop ("Pay over time").

## Financing
- Affirm added next to Klarna at Shop checkout (Stripe Checkout on the practice's connected account, `payment_method_types: ["affirm"|"klarna"]`).
- Per-practice switches in Shop → Pay over time (`medspa_config.shop.financing`; defaults: Klarna on, Affirm off).
- US limits enforced on the server and in the UI: Klarna $35–$10,000, Affirm $50–$30,000. Out-of-range tiles show "From $X" and are disabled.
- Item sheet shows "Or 4 payments of $X with Klarna / Affirm" (pay in 4 shown up to $2,000).
- The practice is paid in full; the connect webhook already marks the order paid (BNPL methods confirm immediately).
- **Practice must also turn on Klarna / Affirm in its own Stripe dashboard → Settings → Payment methods.** If it isn't on, checkout says "X isn't available … Choose Card instead."

## Booking (the Dermis model)
- Each treatment can have a **Scheduling link** (its page on Boulevard, Vagaro, Mangomint, Zenoti, Square, Acuity, Calendly…). Book opens it directly.
- Practice-wide fallback: general booking link, booking phone (blank = Brand → Contact phone), "Text us" toggle, WhatsApp number, pre-filled message with {treatment} / {practice}.
- Order: treatment link → general link → Atlas booking (if on) → call / text / WhatsApp screen at `/book?t=<id>`.
- Book buttons on: Shop → Treatments, Your orders (packages with sessions left), "Book your first session" right after paying, My care (due rows, menu rows, first-visit card), Home card.
- No SQL: everything lives in `businesses.medspa_config` (jsonb, defaults merged on read).

## Verified
`tsc` 0 errors, `next build` green. Playwright 390 px: sheet financing line, Affirm checkout, $30 item (both disabled), treatment Book links (deep link vs /book), orders Book, book screens (link / contact / general + treatment list), tel/sms/wa.me hrefs with message, no overflow, no console errors.
