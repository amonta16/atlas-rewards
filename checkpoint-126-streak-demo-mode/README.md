# CP-126 · Streak Demo Mode (auto-playing, loopable, zero data writes)

**One file changed:** `components/customer/streaks-client.tsx` — no SQL, no deploy steps beyond `git push`.

## What it is

A **"Streak demo mode"** card on the Streaks page — **demo businesses only** (`businesses.is_demo`, the same gate CP-68/69 use, so it ships with the instant demo app build automatically and can NEVER appear for a real customer's shop).

Tap **▶ Play** and the page runs the full pitch, hands-free, on a loop:

1. The flame starts at START and **climbs one check-in every ~1.5s** — the camera follows the whole climb (the same live-advance burn a real check-in triggers).
2. The **hero counter counts up** and the next-reward panel updates in realtime.
3. Each milestone **pulses as the flame crosses it**, the card flips to earned, and the gift **turns gold — "🎁 Tap to claim"** exactly like a real CP-121 earned gift.
4. **Tap any gold gift** → the full unwrap overlay (points land big, reward gifts show a `DEMOxx` desk code). The climb **pauses while the overlay is open** so you can linger on the moment, and resumes when you close it.
5. At the summit the finish glow lands, it **holds ~5s, then loops** — fresh road, gifts re-armed, climb starts over. Runs forever until you hit ■ Stop.

## Why it can't touch real data

The whole thing is a **client-side simulation**: while demo mode runs, **no RPC is ever called** — not `member_checkin`, not `claim_streak_gift`, nothing. Simulated gifts carry synthetic ids (`demo-N`) that are intercepted before the claim RPC, and the demo claim writes nothing. Toggling **Stop** simply re-renders the member's true fetched streak (the road replays their real climb once, which is the normal page-open behavior). Real check-ins landing mid-demo still update the underlying state silently and show correctly the moment demo mode is off.

## Testing (on your demo app)

1. Open the Streaks tab on any **demo** business → the dashed "Streak demo mode" card sits under the hero.
2. Play → watch the climb + camera follow; tap a gold gift mid-climb → unwrap overlay; close → climb resumes.
3. Let it reach the summit → holds, then loops from START.
4. Stop → your real streak renders, untouched. Open a REAL business → no demo card anywhere.

## Push

```
cd "C:\Users\andre\OneDrive\Documents\Claude\Projects\Atlas Engine APP"
git add .
git commit -m "CP-126: streak demo mode - auto-playing looped climb with tap-to-claim gifts, client-side only (is_demo businesses)"
git push
```

---

## CP-126.1 — Smooth demo camera (follow-up)

The camera used to restart a fresh scroll ease inside every ~1.5s step — quick lurch, decelerate, idle, lurch again — which read as rapid little jumps. Now **one continuous camera follower** runs for the whole demo: every frame the viewport glides a time-based fraction of the way toward the flame (exponential damping, ~260ms), so it flows smoothly through the burns, through the pauses between steps, and right through a claim. The flame's own step animation is unchanged, claims still don't interrupt the climb, and the real-streak entry replay keeps its original camera. Same single file, no SQL.

## CP-126.2 — Native smooth camera + Complete badge fix

**Camera v3:** the per-frame JS follower still stuttered on phones — scripting the scroll every frame runs on the main thread and repaints the blurred corridor each frame. Now each demo step issues **one browser-native `behavior: "smooth"` scroll** toward where the flame is heading; the browser's compositor animates it off the main thread, which is as smooth as the device can render.

**Summit fix:** the "Complete" trophy + label sat directly on the progress bar / flame head at the top of the road. Lifted well above the track (and z-ordered over the corridor) so it reads cleanly.
