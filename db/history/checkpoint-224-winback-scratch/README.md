# CP-224 · "We miss you" → straight onto a scratch-card gift

Goal (Andrew): see the win-back push → tap → instantly a gift to scratch → reward revealed → rewarded. No chooser, no Home, no extra taps.

- Push now links to `/<slug>/app/gift/<message id>` (was `/app/rewards`); body "🎁 You have a gift waiting — tap to unwrap it."
- New page `app/[business]/app/gift/[id]` loads the gift on the server, so the card is on screen at first paint. Full-screen, claims the popup coordinator at top priority (`PopupPriority.pushGift`) so onboarding/confetti/offer reveals wait.
- `components/customer/gift-scratch-screen.tsx`: same wrapped-parcel art + name tag as the med spa card (`giftFrontSvg`, `drawNameTag` now exported). At 45 % scratched it reveals AND claims (`claim_gift`): confetti, "+50 points added · Balance", the reward's desk code, My rewards / Done. Already-opened gifts reopen revealed; expired shows expired.
- Home win-back banner: "Unwrap your gift" button for unopened gifts.
- Cold start / several businesses: CP-223 routes the tap past the /join chooser to the right business.

SQL `01_winback_gift.sql` (migration `cp224_winback_gift`):
- `customer_messages.redemption_id / revealed_at / points_credited_at`; old rows backfilled as credited (no double points).
- `send_winback_v2`: reward still created at send (desk sees it, expiry reminders work); bonus points now credited when the member unwraps (matches the desk modal's "Awarded the moment they tap the notification"); new link + body.
- `my_gift(id)`, `claim_gift(id)` (owner-only, idempotent via ledger key `winback:<id>`).
