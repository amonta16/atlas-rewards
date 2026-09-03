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

# ═══ CP-127 · desk removals correct recorded spend too ═════════════════
p = "components/manager/award-points-panel.tsx"
src = load(p)

# ── 1. removePoints: send the auto-derived spend correction ───────────
src = rep(src,
"""    const { data, error } = await supabase.rpc("manager_remove_points", {
      p_membership_id: member.membership_id,
      p_amount: pointsToRemove,
      p_notes: removeNote.trim() || null,
    });""",
"""    // CP-127: removing points also walks back the recorded SPEND the
    // mistaken award logged (points ÷ points-per-$ rate), so analytics
    // (revenue, avg ticket, member spend, "points awarded") correct
    // themselves instead of keeping the mistake forever. The server
    // clamps it — a member's recorded spend can never go below zero.
    const rate = business.point_rules.purchase_per_dollar || 0;
    const spendCents = rate > 0 ? Math.round((pointsToRemove / rate) * 100) : null;
    const { data, error } = await supabase.rpc("manager_remove_points", {
      p_membership_id: member.membership_id,
      p_amount: pointsToRemove,
      p_notes: removeNote.trim() || null,
      p_spend_correction_cents: spendCents,
    });""",
"remove rpc")

# ── 2. tell the staff what the correction will do ─────────────────────
src = rep(src,
"""              {parseInt(removeAmount || "0", 10) > member.points_balance && (
                <div className="mt-1 text-[11px] text-amber-600 font-semibold">
                  Capped at their balance — can't go below 0.
                </div>
              )}
            </div>""",
"""              {parseInt(removeAmount || "0", 10) > member.points_balance && (
                <div className="mt-1 text-[11px] text-amber-600 font-semibold">
                  Capped at their balance — can't go below 0.
                </div>
              )}
              {/* CP-127: the removal fixes the analytics too, and says so. */}
              {pointsToRemove > 0 && business.point_rules.purchase_per_dollar > 0 && (
                <div className="mt-1 text-[11px] text-zinc-500">
                  Analytics will also remove ≈ ${(pointsToRemove / business.point_rules.purchase_per_dollar).toFixed(2)} of recorded spending.
                </div>
              )}
            </div>""",
"spend note")

save(p, src)
print("award-points-panel OK")
