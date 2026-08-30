import subprocess, sys

path = "checkpoint-02-brand-engine/atlas-rewards-app/components/customer/streaks-client.tsx"
src = subprocess.run(["git", "show", "HEAD:" + path], capture_output=True, text=True, check=True).stdout

def rep(anchor, replacement, name):
    global src
    assert src.count(anchor) == 1, f"anchor not unique/found: {name} ({src.count(anchor)})"
    src = src.replace(anchor, replacement)

# ── E1: StreakGift type ──────────────────────────────────────────────
rep(
"// CP-49: gift_kind is authoritative (same rule as StreakWidget).",
"""// CP-121: an EARNED milestone gift waiting to be claimed (tap on the road).
type StreakGift = {
  gift_id: string;
  milestone_count: number;
  label: string | null;
  gift_kind: "points" | "reward";
  points: number;
  reward_id: string | null;
  reward_name: string | null;
  reward_image_url: string | null;
  earned_at: string;
  expires_at: string;
  claimed_at: string | null;
  redemption_code: string | null;
  redemption_status: string | null;
};

// CP-49: gift_kind is authoritative (same rule as StreakWidget).""",
"E1 gift type")

# ── E2: state ────────────────────────────────────────────────────────
rep(
"  const [now, setNow] = useState(() => Date.now());",
"""  const [now, setNow] = useState(() => Date.now());
  // CP-121: earned gifts + the claim overlay state.
  const [gifts, setGifts] = useState<StreakGift[]>([]);
  const [claimOpen, setClaimOpen] = useState<StreakGift | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimDone, setClaimDone] = useState<{
    kind: string; points: number; code: string | null; name: string | null; image: string | null;
  } | null>(null);
  const [claimErr, setClaimErr] = useState<string | null>(null);""",
"E2 state")

# ── E3: gifts fetch inside load() ────────────────────────────────────
rep(
"""      const row = (Array.isArray(data) ? data[0] : data) as StreakStatus | null;
      if (!cancelled) { setS(row); setLoaded(true); }""",
"""      const row = (Array.isArray(data) ? data[0] : data) as StreakStatus | null;
      if (!cancelled) { setS(row); setLoaded(true); }
      // CP-121: earned gifts ride along with every status load.
      const { data: gData } = await supabase.rpc("list_streak_gifts", {
        p_business_id: business.id, p_membership_id: membershipId,
      });
      if (!cancelled) setGifts((gData ?? []) as StreakGift[]);""",
"E3 gifts fetch")

# ── E4: claim function ───────────────────────────────────────────────
rep(
"  const milestones = useMemo<Milestone[]>(",
"""  // CP-121: claim an earned gift — the unwrap moment. Points land on the
  // balance; reward gifts mint a zero-cost redemption with a desk code.
  async function claimGift(g: StreakGift) {
    if (claimBusy) return;
    setClaimOpen(g); setClaimBusy(true); setClaimErr(null); setClaimDone(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("claim_streak_gift", { p_gift_id: g.gift_id });
    setClaimBusy(false);
    if (error) { setClaimErr(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as {
      gift_kind: string; points: number; reward_name: string | null;
      reward_image_url: string | null; redemption_code: string | null;
    } | null;
    setClaimDone({
      kind: row?.gift_kind ?? g.gift_kind,
      points: row?.points ?? g.points,
      code: row?.redemption_code ?? null,
      name: row?.reward_name ?? g.reward_name,
      image: row?.reward_image_url ?? g.reward_image_url,
    });
    const { data: gData } = await supabase.rpc("list_streak_gifts", {
      p_business_id: business.id, p_membership_id: membershipId,
    });
    setGifts((gData ?? []) as StreakGift[]);
  }

  const milestones = useMemo<Milestone[]>(""",
"E4 claim fn")

# ── E5: RewardRoad props at call site ────────────────────────────────
rep(
"""          nextEligibleMs={nextEligibleMs}
          light={lightEnv}
        />""",
"""          nextEligibleMs={nextEligibleMs}
          light={lightEnv}
          gifts={gifts}
          onClaim={claimGift}
        />""",
"E5 call site")

# ── E6: claim overlay render before </Shell> of the main return ──────
rep(
"""          </div>
        </div>
      )}
    </Shell>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Shell""",
"""          </div>
        </div>
      )}

      {/* CP-121: the unwrap moment. */}
      {claimOpen && (
        <ClaimOverlay
          busy={claimBusy}
          done={claimDone}
          err={claimErr}
          deep={theme.cell[2]}
          mid={theme.cell[1]}
          onClose={() => { setClaimOpen(null); setClaimDone(null); setClaimErr(null); }}
        />
      )}
    </Shell>
  );
}

/* ════════════════════════════════════════════════════════════════════
   Shell""",
"E6 overlay render")

# ── E7: RewardRoad signature (destructure AND type — CP-67 rule) ─────
rep(
"""function RewardRoad({
  milestones, current, claimed, nextCount, theme, logoUrl, unit, slug, canCheckIn, nextEligibleMs, light,
}: {""",
"""function RewardRoad({
  milestones, current, claimed, nextCount, theme, logoUrl, unit, slug, canCheckIn, nextEligibleMs, light,
  gifts, onClaim,
}: {""",
"E7 destructure")

rep(
"""  /** Light environment → on-environment text flips to deep slate. */
  light: boolean;
}) {""",
"""  /** Light environment → on-environment text flips to deep slate. */
  light: boolean;
  /** CP-121: earned gifts — an unclaimed one makes its milestone tappable. */
  gifts: StreakGift[];
  onClaim: (g: StreakGift) => void;
}) {""",
"E7 type")

# ── E8: per-milestone gift state ─────────────────────────────────────
rep(
"""          const rewardGift = isReward(m);
          const pointsGift = !rewardGift && (m.points ?? 0) > 0;
          const away = m.count - current;""",
"""          const rewardGift = isReward(m);
          const pointsGift = !rewardGift && (m.points ?? 0) > 0;
          const away = m.count - current;
          // CP-121: an earned, unclaimed, unexpired gift here → tappable.
          const giftHere = gifts.find(g =>
            g.milestone_count === m.count && !g.claimed_at &&
            new Date(g.expires_at).getTime() > Date.now()) ?? null;
          const claimable = !!giftHere;""",
"E8 gift state")

# ── E9: node — claimable gets a pulsing gold gift ────────────────────
rep(
"""                {unlocked ? (
                  <div className="h-6 w-6 rounded-full ring-4 ring-white flex items-center justify-center"
                    style={{ background: earnedNodeBg, boxShadow: `0 0 12px 2px ${alpha(cMid, 0.6)}` }}>
                    <Check className="h-3.5 w-3.5 text-white" />
                  </div>
                ) : isNext ? (""",
"""                {claimable ? (
                  <div className="atlas-gift-node h-7 w-7 rounded-full ring-4 ring-white flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #fbbf24, #d97706)", boxShadow: "0 0 16px 4px rgba(245,158,11,0.6)" }}>
                    <Gift className="h-3.5 w-3.5 text-white" />
                  </div>
                ) : unlocked ? (
                  <div className="h-6 w-6 rounded-full ring-4 ring-white flex items-center justify-center"
                    style={{ background: earnedNodeBg, boxShadow: `0 0 12px 2px ${alpha(cMid, 0.6)}` }}>
                    <Check className="h-3.5 w-3.5 text-white" />
                  </div>
                ) : isNext ? (""",
"E9 node")

# ── E10a: card onClick + claimable style branch ──────────────────────
rep(
"""                <div
                  className={`relative rounded-2xl border bg-white shadow-sm ring-1 ring-black/5 overflow-hidden ${
                    !unlocked && !isNext ? "opacity-70" : ""
                  }`}
                  style={
                    isNext""",
"""                <div
                  onClick={claimable && giftHere ? () => onClaim(giftHere) : undefined}
                  role={claimable ? "button" : undefined}
                  className={`relative rounded-2xl border bg-white shadow-sm ring-1 ring-black/5 overflow-hidden ${
                    !unlocked && !isNext ? "opacity-70" : ""
                  } ${claimable ? "active:scale-[0.97] transition-transform" : ""}`}
                  style={
                    claimable
                      ? {
                          background: earnedCardBg,
                          borderColor: "rgba(251,191,36,0.8)",
                          boxShadow: "0 0 0 2px rgba(245,158,11,0.65), 0 0 22px -2px rgba(245,158,11,0.5), inset 0 1px 0 rgba(255,255,255,0.35)",
                          cursor: "pointer",
                        }
                      : isNext""",
"E10a card style")

# ── E10b: seal ✓ only when NOT claimable + gold TAP TO CLAIM ribbon ──
rep(
"""                  {/* white circle + green check — the completion seal */}
                  {unlocked && (""",
"""                  {/* CP-121: gold "tap to claim" ribbon on an earned gift */}
                  {claimable && (
                    <span className="atlas-gift-pulse absolute top-2 right-2 z-10 rounded-full bg-amber-400 text-amber-950 text-[8px] font-black uppercase tracking-wider px-2 py-1 shadow-md">
                      🎁 Tap to claim
                    </span>
                  )}
                  {/* white circle + green check — the completion seal */}
                  {unlocked && !claimable && (""",
"E10b seal/ribbon")

# ── E11: animations ──────────────────────────────────────────────────
rep(
"""        @media (prefers-reduced-motion: reduce) {
          .atlas-flame-head, .atlas-node-pop, .atlas-card-flash { animation: none !important; }
        }""",
"""        @keyframes atlasGiftPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.1); }
        }
        .atlas-gift-node  { animation: atlasGiftPulse 1.6s ease-in-out infinite; }
        .atlas-gift-pulse { animation: atlasGiftPulse 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .atlas-flame-head, .atlas-node-pop, .atlas-card-flash,
          .atlas-gift-node, .atlas-gift-pulse { animation: none !important; }
        }""",
"E11 keyframes")

# ── E12: ClaimOverlay component at end of file ───────────────────────
src = src.rstrip("\n") + """

/* ════════════════════════════════════════════════════════════════════
   ClaimOverlay — CP-121: full-screen unwrap moment when a streak gift
   is claimed. Points: big +N landing. Reward: prize photo + the desk
   code to show at the counter (also lives in the desk code box via the
   normal redemption resolver).
   ════════════════════════════════════════════════════════════════════ */
function ClaimOverlay({
  busy, done, err, deep, mid, onClose,
}: {
  busy: boolean;
  done: { kind: string; points: number; code: string | null; name: string | null; image: string | null } | null;
  err: string | null;
  deep: string;
  mid: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-6"
      style={{ background: "rgba(9,12,22,0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>
      <div className="w-full max-w-xs rounded-3xl bg-white shadow-2xl overflow-hidden text-center">
        {busy && (
          <div className="p-10">
            <div className="atlas-gift-node mx-auto h-16 w-16 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #fbbf24, #d97706)" }}>
              <Gift className="h-8 w-8 text-white" />
            </div>
            <div className="mt-4 text-sm font-bold text-zinc-700">Unwrapping…</div>
          </div>
        )}

        {!busy && err && (
          <div className="p-8">
            <div className="text-3xl">😕</div>
            <div className="mt-2 text-sm font-bold text-zinc-800">Couldn&rsquo;t claim that</div>
            <p className="mt-1 text-xs text-zinc-500">{err}</p>
            <button onClick={onClose}
              className="mt-5 w-full h-11 rounded-xl border text-sm font-bold text-zinc-700 active:scale-[0.98] transition">
              Close
            </button>
          </div>
        )}

        {!busy && !err && done && (
          <div>
            <div className="px-8 pt-8 pb-5"
              style={{ background: `linear-gradient(160deg, ${mid} 0%, ${deep} 100%)` }}>
              {done.kind === "reward" && done.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={done.image} alt="" className="mx-auto h-24 object-contain drop-shadow-lg" />
              ) : (
                <div className="mx-auto h-16 w-16 rounded-2xl bg-white/20 flex items-center justify-center">
                  <Gift className="h-8 w-8 text-white" />
                </div>
              )}
              <div className="mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/80">
                Streak gift claimed
              </div>
              <div className="mt-1 text-2xl font-black text-white drop-shadow">
                {done.kind === "reward"
                  ? (done.name ?? "Your reward")
                  : `+${done.points.toLocaleString()} pts`}
              </div>
            </div>
            <div className="p-6">
              {done.kind === "reward" && done.code ? (
                <>
                  <div className="text-[11px] font-bold text-zinc-500">
                    Show this code at the counter to pick it up
                  </div>
                  <div className="mt-2 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 py-3 text-2xl font-black tracking-[0.25em] text-amber-800">
                    {done.code}
                  </div>
                  <div className="mt-2 text-[10px] text-zinc-400">Valid for 30 days</div>
                </>
              ) : (
                <div className="text-[12px] font-semibold text-zinc-600">
                  Points are on your balance — spend them in the rewards store.
                </div>
              )}
              <button onClick={onClose}
                className="mt-5 w-full h-11 rounded-xl text-sm font-black text-white active:scale-[0.98] transition"
                style={{ background: `linear-gradient(135deg, ${mid}, ${deep})` }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
"""

with open(path, "w", encoding="utf-8", newline="") as f:
    f.write(src)
print("streaks-client patched OK, lines:", src.count("\\n"))
