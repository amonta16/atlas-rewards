# CP-134 — Instagram / Facebook follow rewards + fine print on every reward

Flippos feedback items 1 and 2.

## Run first (Supabase SQL editor)

`cp134_social_and_fine_print.sql` — idempotent, safe to re-run.

* `businesses.social_config jsonb` — per-platform config `{ instagram: { enabled, title, description, points, url, terms }, facebook: {...} }`.
* `businesses.reward_fine_print text` — the business's default fine print (seeded + column default, so new businesses get it too).
* `agency_settings.reward_disclaimer` / `vendor_terms_hint` — platform copy, editable in Agency → Settings, exposed to customers via `platform_reward_terms()` (anon + authenticated).
* `submit_review` is now platform-scoped; new `submit_social_follow(p_business_id, p_platform, p_handle)` writes to the existing `reviews` table with `platform = 'instagram' | 'facebook'`, so the follow lands in the same front-desk verification queue as Google reviews.
* `my_social_status(uuid)` for the customer app; `pending_reviews_for_business` gains a `platform` column; `approve_review` v3 pays the right amount per platform (`social_config.<platform>.points` → `point_rules.social_follow` → 25) under ledger rule `social_follow`.

## App

* **Customer** — Rewards tab shows "Follow us on Instagram / Facebook" rows next to the Google Review reward (same claim → verify → paid flow, `social-follow-modal.tsx`). Every reward detail, redeem confirm and review/follow modal now shows fine print (`components/customer/fine-print.tsx`): reward-specific terms → business default → platform disclaimer. Copy is fetched from `platform_reward_terms()`, never hard-coded (a fallback string only appears if the RPC is missing).
* **Builder → Rewards** — "Reward fine print (default)" and "Social follow rewards" sections (`social-rewards-editor.tsx`); each reward in the rewards manager gets its own fine-print box (saved to `rewards.terms`).
* **Agency → Settings** — "Reward terms — platform copy" section for the vendor hint + disclaimer.
* **Front desk** — review queue shows the platform pill, the customer's handle, and an "Open our page" link so staff can verify the follow before approving.

## Files

`lib/social-config.ts`, `components/customer/{fine-print,social-follow-modal,rewards-client,reward-detail-modal,redeem-flow,review-submit-modal,top-rewards-grid}.tsx`, `app/[business]/app/page.tsx`, `components/agency/{social-rewards-editor,rewards-manager,agency-settings-client}.tsx`, `components/brand-editor/brand-editor.tsx`, `components/manager/review-queue.tsx`, `lib/types/database.ts`.
