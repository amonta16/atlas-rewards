# CP-220 · gifts, tiers, points expiry (all SQL already applied to production, Oct 24 2026)

Applied as migrations cp220_part1a … part5. The .sql files here are the record.

1. **Security**: `_grant_automated_offer` is no longer callable by customers (was open to anon/authenticated — re-arm used gifts / mint points). This is the fix staged in checkpoint-219 (now applied).
2. **Per-member gift expiry**: `customer_saved_offers.expires_at`, set by trigger from the config's `expires_after_days` on every grant; every reader (`my_saved_offers`, `my_unrevealed_welcome_gift`, `desk_member_store`, `resolve_saved_offer_by_code`, `fulfill_saved_offer`, `notify_expiring_gifts`) uses `saved_offer_expires_at()`. Existing gifts kept the date they showed before.
3. **Welcome gift after the required waiver**: enrollment grants only if the waiver is signed (or none is required); signing / guardian coverage grants it (idempotent). The desk can't hand over a signup gift before the waiver.
4. **One push registration per device**: newest sign-in owns the endpoint; old duplicates removed.
5. **Tiers removed**: `recalc_tier` → everyone "Member"; all tier ladders cleared; tier UI/automation nodes removed. Paid VIP membership (membership billing) untouched.
6. **Points expiry (entertainment only)**: 180 days without a visit / earn / redemption (Domino's model). `businesses.points_expiry_days` = 180 for layout_preset 'entertainment' (auto for new ones, cleared if a business leaves entertainment). 30-day launch grace. Hourly job `process_points_expiry` (cron `atlas-points-expiry`, :41): reminders at 30/14/7/3/1 days (10:00–20:00 local, kind reward_expiration, family points_expiry), then a `points_expired` ledger line. Customer Home shows the date under the points card; the desk shows it under the balance; the Automation Hub lists it.

At launch no Flippo's member is within 30 days of expiry (earliest: Mar 30 2027), so nobody is messaged tonight.
