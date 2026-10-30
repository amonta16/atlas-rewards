# Checkpoint 7 — Review reward flow

Closes the gap between "I clicked the Google review link" and "I got the points." Customer submits a review claim → manager approves → award fires automatically via Realtime.

## What got built

**Backend — `01_review_rpcs.sql`:**
- `submit_review(business_id, review_link?, screenshot_url?)` — customer creates a pending review. Anti-abuse: max one pending per member at a time.
- `approve_review(review_id)` — manager approves, awards points via `award_points()` (which fires the customer's Realtime confetti).
- `reject_review(review_id, reason?)` — manager rejects, customer sees "Try again" subtitle.
- `my_review_status(business_id)` — customer's most recent review status.
- `pending_reviews_for_business(business_id)` — manager queue.
- Realtime broadcasts on `reviews` so the customer's status badge updates live.

**Customer side:**
- "Review on Google" earn row → now opens a **3-stage modal**:
  1. *Intro* — "Earn +X points." Two steps: "Open Google Reviews" → "I left my review →"
  2. *Submit* — optional review link input + Submit button
  3. *Submitted* — pending state with status pill and "+X points pending" badge
- Earn row now shows live badge: **Pending** (amber) or **Verified** (green) once acted on
- Subtitle text changes based on status

**Manager side:**
- New **Pending reviews queue** on the manager dashboard (only visible when there's at least 1 pending)
- Each row: member avatar + name + email + submitted time + link to their review (if provided) or fallback link to Google Reviews
- Two-button row: **Reject** (rose) / **Approve & award** (brand color)
- On Approve: `award_points` fires, customer sees confetti instantly, queue auto-refreshes via Realtime

## How to install (1 min)

1. Supabase SQL Editor → run [`01_review_rpcs.sql`](01_review_rpcs.sql). Idempotent — safe to re-run.
2. Restart `npm run dev`.

## How to test

Need two windows side by side — customer + manager.

1. **Customer** (`demo.lvh.me:3000/app/rewards`) → "Need more points?" → tap **"Review on Google"**
2. Step 1: tap **"Open Google Reviews"** — opens the URL you set in the brand editor (or shows a note if you haven't set one)
3. Step 2: tap **"I left my review →"**, optionally paste a review link, submit
4. You see the **Pending verification** screen. The earn row back on the Rewards tab now shows an amber "Pending" badge and the subtitle changes to "Pending verification…"

5. **Manager** (`demo.lvh.me:3000/manage`) → **a "Pending reviews" card has appeared** above the Recent activity feed, with the customer's name and a "View their review" link.
6. Tap **Approve & award** → button shows "Approving…" → row disappears from the queue
7. **Switch to the customer window** — the customer sees a full-screen confetti burst with "You just earned 200 points" (or whatever the review rule is set to), and the earn row badge flips from "Pending" to green "Verified."

Total cycle: under 10 seconds. All Realtime, no refreshes.

## What's NOT in CP 7 (deferred)

- **Screenshot upload** — the schema and RPC support `screenshot_url` already, but the upload UI isn't wired. Customer can paste a review link instead. Screenshot upload via Supabase Storage is a 30-minute add-on later if you want it.
- **Auto-approval rules** — every review currently requires manual manager approval. Some businesses might want "auto-approve if link starts with g.co/kgs/" — we can add a rule engine later.
- **Bulk approval** — manager approves one at a time. If you end up with a backlog from a busy day, we can add "Approve all" later.

## Approval gate

Once you've seen the customer submit → manager approve → confetti loop work end-to-end, CP 7 is done. Next up: **CP 8 — birthday + milestone + reactivation rewards** (scheduled jobs that auto-fire on member birthdays, Nth visit, and 30/60/90 day dormancy — the only checkpoint that needs server-side cron rather than UI).
