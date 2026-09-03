import subprocess, sys

R = "checkpoint-02-brand-engine/atlas-rewards-app/"
MODE = sys.argv[1] if len(sys.argv) > 1 else "device"

def load(p):
    if MODE == "mirror":
        return open(p, encoding="utf-8").read()
    return subprocess.run(["git", "show", "HEAD:" + R + p], capture_output=True, text=True, check=True).stdout

def save(p, src):
    path = p if MODE == "mirror" else R + p
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(src)

def rep(src, a, b, name):
    assert src.count(a) == 1, f"anchor fail: {name} ({src.count(a)})"
    return src.replace(a, b)

p = "components/customer/streaks-client.tsx"
src = load(p)

# ═══ CP-126.3 · ONE CONTINUOUS CLIMB ═══════════════════════════════════
# v3's native smooth scroll was smooth WITHIN a step but stop-start
# BETWEEN steps (jolty). Fix the motion itself: the demo flame now burns
# LINEARLY, each burn lasts slightly longer than the step interval so the
# next step re-targets it before it ever finishes, and the camera is
# locked to the flame inside the same rAF — flame and viewport move at
# constant velocity from START to summit, never stopping.

# ── 1. runAnim: linear-ease option + geometry measured ONCE per pass ──
src = rep(src,
"""  const runAnim = (from: number, to: number, T: number, camera: boolean) => {
    cancelAnimationFrame(rafRef.current);
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    const start = performance.now();""",
"""  const runAnim = (from: number, to: number, T: number, camera: boolean, linear = false) => {
    cancelAnimationFrame(rafRef.current);
    // CP-126.3: linear pacing for the demo climb — constant velocity is
    // what lets back-to-back steps chain into ONE continuous glide
    // (easeOutCubic decelerates, which read as a pulse per check-in).
    const ease = linear ? (t: number) => t : (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
    // CP-126.3: measure the road's geometry ONCE per animation. Calling
    // getBoundingClientRect inside the frame loop forced a synchronous
    // layout every frame — that, not the scroll itself, was the stutter.
    // The container's absolute position and height are constant mid-pass.
    const camRect = camera && containerRef.current ? containerRef.current.getBoundingClientRect() : null;
    const camAbsTop = camRect ? camRect.top + window.scrollY : 0;
    const camSpan = camRect ? camRect.height - PAD_TOP - PAD_BOTTOM : 0;
    const start = performance.now();""",
"runAnim signature")

# ── 2. camera frame: cheap math on cached geometry, no layout forced ──
src = rep(src,
"""      if (camera && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const headViewportY = rect.top + PAD_TOP + (1 - prog) * (rect.height - PAD_TOP - PAD_BOTTOM);
        window.scrollTo({ top: Math.max(0, window.scrollY + headViewportY - window.innerHeight * 0.55) });
      }""",
"""      if (camRect) {
        const headAbsY = camAbsTop + PAD_TOP + (1 - prog) * camSpan;
        window.scrollTo({ top: Math.max(0, headAbsY - window.innerHeight * 0.55) });
      }""",
"camera frame")

# ── 3. live advance: demo = long linear burn w/ locked camera ─────────
src = rep(src,
"""    // CP-126.1: the burn no longer drives the scroll in demo mode (that
    // restarted a fresh ease every step and read as rapid jumps) — the
    // dedicated smooth camera follower below owns the viewport instead.
    runAnim(fracRef.current, targetFrac, demo ? 1150 : 950, false);""",
"""    // CP-126.3: demo = LINEAR burn, slightly LONGER than the step
    // interval, camera locked to the flame. Each new step re-targets the
    // animation ~100ms before the previous one finishes, so flame and
    // viewport never stop moving — one continuous climb, no pulses.
    runAnim(fracRef.current, targetFrac, demo ? 1900 : 950, !!demo, !!demo);""",
"live advance")

# ── 4. drop the v3 per-step native smooth scroll (superseded) ─────────
src = rep(src,
"""
  // ── CP-126.2: DEMO CAMERA v3 — browser-NATIVE smooth scrolling. The v2
  // per-frame JS follower still stuttered on phones: a scripted scrollTo
  // every rAF runs on the main thread and repaints the blurred corridor
  // each frame. Now each demo step issues ONE `behavior: "smooth"` scroll
  // to where the flame is heading — the compositor animates it off the
  // main thread, as smooth as the device can render. Demo mode only; the
  // entry replay and real live advances keep their existing behavior.
  useEffect(() => {
    if (!demo || reducedMotion() || typeof window === "undefined") return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const absTop = rect.top + window.scrollY; // scroll-independent
    const headY = absTop + PAD_TOP + (1 - targetFrac) * (rect.height - PAD_TOP - PAD_BOTTOM);
    window.scrollTo({ top: Math.max(0, headY - window.innerHeight * 0.55), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, targetFrac]);""",
"",
"remove v3 camera")

# ── 5. calmer pace: steps at 1800ms (burn = 1900ms overlaps them) ─────
src = rep(src,
"    const delay = demoCur === 0 ? 1400 : demoCur < top ? 1500 : 5500;",
"""    // CP-126.3: 1800ms per unit (burn = 1900ms, so motion never stops).
    const delay = demoCur === 0 ? 1400 : demoCur < top ? 1800 : 5500;""",
"step pace")

save(p, src)
print("streaks-client OK")
