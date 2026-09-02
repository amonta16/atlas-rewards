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

# ═══ CP-126.1 · SMOOTH DEMO CAMERA ══════════════════════════════════════
# The demo camera used to be driven inside each step's burn: every ~1.5s a
# fresh scroll ease started (quick lurch → decelerate → idle gap → lurch),
# which read as rapid little jumps. Now ONE continuous follower owns the
# camera for the whole demo: every frame it closes a time-based fraction of
# the distance to the flame (exponential damping), so it glides smoothly
# through the step gaps instead of restarting per check-in.
p = "components/customer/streaks-client.tsx"
src = load(p)

# ── 1. live advance no longer scrolls — the follower owns the camera ──
src = rep(src,
"""    // CP-126: in demo mode the camera rides every step of the climb.
    runAnim(fracRef.current, targetFrac, demo ? 1150 : 950, !!demo);""",
"""    // CP-126.1: the burn no longer drives the scroll in demo mode (that
    // restarted a fresh ease every step and read as rapid jumps) — the
    // dedicated smooth camera follower below owns the viewport instead.
    runAnim(fracRef.current, targetFrac, demo ? 1150 : 950, false);""",
"live advance camera off")

# ── 2. continuous damped follower, mounted for the demo's lifetime ────
src = rep(src,
"""    runAnim(fracRef.current, targetFrac, demo ? 1150 : 950, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetFrac, settled]);""",
"""    runAnim(fracRef.current, targetFrac, demo ? 1150 : 950, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetFrac, settled]);

  // ── CP-126.1: SMOOTH DEMO CAMERA. One rAF loop for the whole demo pass:
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
"camera follower")

save(p, src)
print("streaks-client OK")
