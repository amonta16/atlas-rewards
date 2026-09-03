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

# ═══ CP-126.2a · DEMO CAMERA v3 — native smooth scroll ═════════════════
# v2's per-frame JS follower still stuttered on Andrew's phone: a scripted
# scrollTo every rAF runs on the main thread and repaints the blurred
# corridor each frame. Replace it with ONE browser-native smooth scroll
# per step — the compositor animates it off the main thread.
src = rep(src,
"""  // ── CP-126.1: SMOOTH DEMO CAMERA. One rAF loop for the whole demo pass:
  // each frame the viewport closes a time-based fraction of the distance
  // to the flame (exponential damping, ~260ms time constant), so it glides
  // continuously — through the burn, through the pause between steps, and
  // right through a claim. Demo mode only; the entry replay and real live
  // advances keep their existing behavior.
  useEffect(() => {
    if (!demo || reducedMotion()) return;
    let raf = 0;
    let last = performance.now();
    const tick = (nowTs: number) => {
      const el = containerRef.current;
      if (el) {
        const dt = Math.min(64, nowTs - last);
        const rect = el.getBoundingClientRect();
        const headViewportY = rect.top + PAD_TOP + (1 - fracRef.current) * (rect.height - PAD_TOP - PAD_BOTTOM);
        const target = Math.max(0, window.scrollY + headViewportY - window.innerHeight * 0.55);
        const k = 1 - Math.exp(-dt / 260);
        const next = window.scrollY + (target - window.scrollY) * k;
        if (Math.abs(next - window.scrollY) > 0.5) window.scrollTo({ top: next });
      }
      last = nowTs;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo]);""",
"""  // ── CP-126.2: DEMO CAMERA v3 — browser-NATIVE smooth scrolling. The v2
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
"camera v3")

# ═══ CP-126.2b · lift the Complete trophy off the progress bar ════════╙
src = rep(src,
"""          <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ top: PAD_TOP - 48 }}>""",
"""          <div
            // CP-126.2: lifted well clear of the flame head + summit node —
            // it used to sit right on the progress bar and was unreadable.
            className="absolute left-1/2 -translate-x-1/2 z-20 flex flex-col items-center" style={{ top: PAD_TOP - 112 }}>""",
"finish glow lift")

save(p, src)
print("streaks-client OK")
