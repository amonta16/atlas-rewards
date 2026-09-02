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

# ═══ CP-126 · STREAK DEMO MODE — one file: streaks-client.tsx ═══════════
# A pure CLIENT-SIDE simulation, only on is_demo businesses (same gate as
# CP-68/69, so it ships with the instant demo build automatically). No RPC
# is ever called while it runs — real streak data cannot be touched.
p = "components/customer/streaks-client.tsx"
src = load(p)

# ── 1. lucide imports: Play + Square for the toggle pill ──────────────
src = rep(src,
'  Flame, Gift, Trophy, Lock, Check, CalendarDays, QrCode, Sparkles, ChevronUp, Star, Crown, Zap,\n} from "lucide-react";',
'  Flame, Gift, Trophy, Lock, Check, CalendarDays, QrCode, Sparkles, ChevronUp, Star, Crown, Zap,\n  Play, Square,\n} from "lucide-react";',
"imports")

# ── 2. demo state, after the claim states ─────────────────────────────
src = rep(src,
"  const [claimErr, setClaimErr] = useState<string | null>(null);",
"""  const [claimErr, setClaimErr] = useState<string | null>(null);

  // ── CP-126: STREAK DEMO MODE (is_demo businesses only) ──────────────
  // A pure client-side simulation for pitching: the flame auto-climbs the
  // whole road (camera follows, milestones pulse, gifts turn gold and are
  // tap-to-claimable with the full unwrap moment), then loops from START.
  // ZERO writes — no RPC fires while it runs, so toggling it on/off can
  // never touch real streak data; turning it off re-renders the member's
  // true state exactly as fetched.
  const demoEligible = !!business.is_demo;
  const [demoOn, setDemoOn] = useState(false);
  const [demoCur, setDemoCur] = useState(0);          // simulated streak count
  const [demoCycle, setDemoCycle] = useState(0);      // remount key per loop
  const [demoClaimed, setDemoClaimed] = useState<Set<number>>(() => new Set());""",
"demo state")

# ── 3. demo engine: stepper effect + toggle, after the milestones memo ─
src = rep(src,
"""  const milestones = useMemo<Milestone[]>(
    () => (s ? [...(s.milestones ?? [])].sort((a, b) => a.count - b.count) : []),
    [s],
  );""",
"""  const milestones = useMemo<Milestone[]>(
    () => (s ? [...(s.milestones ?? [])].sort((a, b) => a.count - b.count) : []),
    [s],
  );

  // CP-126: the demo clock. One unit every ~1.5s → each step rides the
  // existing LIVE ADVANCE burn (camera-follow in demo). At the summit it
  // holds so the finish glow lands, then loops: the road remounts fresh
  // (new demoCycle key) and the climb starts over from START. Paused while
  // the claim overlay is open so a pitch can linger on the unwrap moment.
  useEffect(() => {
    if (!demoOn || claimOpen) return;
    const top = milestones.at(-1)?.count ?? 0;
    if (top <= 0) return;
    const delay = demoCur === 0 ? 1400 : demoCur < top ? 1500 : 5500;
    const t = window.setTimeout(() => {
      if (demoCur < top) {
        setDemoCur(c => Math.min(top, c + 1));
      } else {
        // loop: fresh road, fresh crossings, gifts re-armed
        setDemoClaimed(new Set());
        setDemoCur(0);
        setDemoCycle(c => c + 1);
      }
    }, delay);
    return () => window.clearTimeout(t);
  }, [demoOn, demoCur, demoCycle, claimOpen, milestones]);

  function toggleDemo() {
    if (demoOn) {
      // back to reality — real fetched state renders untouched
      setDemoOn(false); setDemoCur(0); setDemoClaimed(new Set());
    } else {
      setDemoCur(0); setDemoClaimed(new Set()); setDemoCycle(c => c + 1);
      setDemoOn(true);
    }
  }""",
"demo engine")

# ── 4. claimGift: demo gifts unwrap locally — the RPC is never called ─
src = rep(src,
"""  async function claimGift(g: StreakGift) {
    if (claimBusy) return;""",
"""  async function claimGift(g: StreakGift) {
    if (claimBusy) return;
    // CP-126: demo gifts are simulated end-to-end — same overlay, same
    // unwrap beat, but NOTHING is written (no points, no redemption).
    if (demoOn && g.gift_id.startsWith("demo-")) {
      setClaimOpen(g); setClaimBusy(true); setClaimErr(null); setClaimDone(null);
      window.setTimeout(() => {
        setClaimBusy(false);
        setClaimDone({
          kind: g.gift_kind,
          points: g.points,
          code: g.gift_kind === "reward"
            ? "DEMO" + String(10 + Math.floor(Math.random() * 90))
            : null,
          name: g.reward_name,
          image: g.reward_image_url,
        });
        setDemoClaimed(prev => { const nx = new Set(prev); nx.add(g.milestone_count); return nx; });
      }, 900);
      return;
    }""",
"claim intercept")

# ── 5. current: the simulation overrides the displayed count ──────────
src = rep(src,
"""  const current = s.current_streak ?? 0;
  const zero = current <= 0;""",
"""  // CP-126: in demo mode the SIMULATED count drives the whole page (hero
  // number, road, next-reward panel); the real value renders the moment
  // demo mode is off.
  const realCurrent = s.current_streak ?? 0;
  const current = demoOn ? demoCur : realCurrent;
  const zero = current <= 0;""",
"current override")

# ── 6. demo gifts derived just before render ──────────────────────────
src = rep(src,
"""  const expiryTone: "calm" | "warm" | "risk" =
    expiresMs === null ? "calm" : expiresMs < 12 * 3600_000 ? "risk" : expiresMs < 24 * 3600_000 ? "warm" : "calm";

  return (""",
"""  const expiryTone: "calm" | "warm" | "risk" =
    expiresMs === null ? "calm" : expiresMs < 12 * 3600_000 ? "risk" : expiresMs < 24 * 3600_000 ? "warm" : "calm";

  // CP-126: simulated gifts — every milestone the demo flame has passed
  // and that hasn't been demo-claimed this loop glows gold, exactly like a
  // real CP-121 earned gift. Synthetic ids ("demo-N") keep them out of the
  // real claim path.
  const demoGifts: StreakGift[] = demoOn
    ? milestones
        .filter(m => m.count <= demoCur && !demoClaimed.has(m.count))
        .map(m => ({
          gift_id: `demo-${m.count}`,
          milestone_count: m.count,
          label: m.label ?? null,
          gift_kind: isReward(m) ? "reward" as const : "points" as const,
          points: m.points ?? 0,
          reward_id: m.reward_id ?? null,
          reward_name: m.reward_name ?? null,
          reward_image_url: m.reward_image_url ?? null,
          earned_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          claimed_at: null,
          redemption_code: null,
          redemption_status: null,
        }))
    : [];

  return (""",
"demo gifts")

# ── 7. the toggle pill, at the end of the hero block ──────────────────
src = rep(src,
"""          </>
        )}
      </div>

      {/* ═══════════ THE REWARD ROAD ═══════════ */}""",
"""          </>
        )}

        {/* CP-126: demo-mode toggle — is_demo businesses only. */}
        {demoEligible && (
          <div
            className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed px-3.5 py-2.5"
            style={{
              borderColor: heroLight ? "rgba(15,23,42,0.28)" : "rgba(255,255,255,0.38)",
              background: heroLight ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.08)",
            }}
          >
            <div className="min-w-0 flex-1">
              <div className={`text-[10px] font-black uppercase tracking-[0.16em] ${heroLight ? "text-slate-700" : "text-white/85"}`}>
                Streak demo mode
              </div>
              <div className={`text-[10px] font-semibold mt-0.5 ${heroLight ? "text-slate-500" : "text-white/55"}`}>
                {demoOn
                  ? "Simulation running on a loop — nothing is saved"
                  : "Auto-plays the whole climb, gifts included — real data untouched"}
              </div>
            </div>
            <button
              onClick={toggleDemo}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white shadow-md active:scale-95 transition"
              style={demoOn
                ? { background: "linear-gradient(135deg, #64748b, #334155)" }
                : { background: `linear-gradient(135deg, ${theme.cell[1]}, ${theme.cell[2]})`, boxShadow: `0 6px 16px -6px ${theme.glow}` }}
            >
              {demoOn ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {demoOn ? "Stop" : "Play"}
            </button>
          </div>
        )}
      </div>

      {/* ═══════════ THE REWARD ROAD ═══════════ */}""",
"toggle pill")

# ── 8. RewardRoad call: demo key (fresh replay per loop) + props ──────
src = rep(src,
"""        <RewardRoad
          milestones={milestones}""",
"""        <RewardRoad
          // CP-126: each demo loop remounts the road (fresh crossings, flame
          // back at START); "real" remounts once when demo mode turns off,
          // which re-runs the normal entry replay of the true streak.
          key={demoOn ? `demo-${demoCycle}` : "real"}
          milestones={milestones}""",
"road key")

src = rep(src,
"""          gifts={gifts}
          onClaim={claimGift}
        />""",
"""          gifts={demoOn ? demoGifts : gifts}
          onClaim={claimGift}
          demo={demoOn}
        />""",
"road props")

# ── 9. RewardRoad signature: destructure AND type (CP-67 rule) ────────
src = rep(src,
"""  milestones, current, claimed, nextCount, theme, logoUrl, unit, slug, canCheckIn, nextEligibleMs, light,
  gifts, onClaim,
}: {""",
"""  milestones, current, claimed, nextCount, theme, logoUrl, unit, slug, canCheckIn, nextEligibleMs, light,
  gifts, onClaim, demo,
}: {""",
"road destructure")

src = rep(src,
"""  /** CP-121: earned gifts — an unclaimed one makes its milestone tappable. */
  gifts: StreakGift[];
  onClaim: (g: StreakGift) => void;
}) {""",
"""  /** CP-121: earned gifts — an unclaimed one makes its milestone tappable. */
  gifts: StreakGift[];
  onClaim: (g: StreakGift) => void;
  /** CP-126: demo-mode climb — live advances follow the camera. */
  demo?: boolean;
}) {""",
"road type")

# ── 10. live advance: camera follows each demo step ───────────────────
src = rep(src,
"    runAnim(fracRef.current, targetFrac, 950, false);",
"""    // CP-126: in demo mode the camera rides every step of the climb.
    runAnim(fracRef.current, targetFrac, demo ? 1150 : 950, !!demo);""",
"live advance")

save(p, src)
print("streaks-client OK")
