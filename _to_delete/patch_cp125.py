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

# ═══ 1. WHEEL MODAL — show the wheel while locked (preview) ══════════
p = "components/customer/daily-mystery-modal.tsx"
src = load(p)
src = rep(src,
'        {phase !== "locked" && phase !== "claimed" && (',
'''        {/* CP-125: the wheel now renders in the LOCKED phase too — the
            prize pool loads regardless, so customers browsing from home
            can see exactly what a visit could win. Spinning stays gated. */}
        {phase !== "claimed" && (''',
"modal wheel gate")

src = rep(src,
'''          {phase === "locked" && (
            <div className="flex flex-col items-center">
              <div
                className="h-28 w-28 rounded-full flex items-center justify-center mb-5"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "2px solid rgba(255,255,255,0.12)",
                }}
              >
                <Lock className="h-12 w-12 text-zinc-500" />
              </div>
              <h3 className="text-white text-xl font-bold mb-2">Locked</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Visit the shop and get checked in to unlock your daily spin!
              </p>
              <div
                className="mt-6 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full"
                style={{
                  color: primary,
                  border: `1px solid ${primary}44`,
                  background: `${primary}10`,
                }}
              >
                Come in to unlock
              </div>
            </div>
          )}''',
'''          {/* CP-125: compact lock panel — the wheel is visible above as a
              prize preview, so this is a nudge, not a wall. */}
          {phase === "locked" && (
            <div className="flex flex-col items-center">
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 mb-3"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}>
                <Lock className="h-4 w-4 text-zinc-400" />
                <span className="text-zinc-300 text-xs font-bold uppercase tracking-widest">Spin locked</span>
              </div>
              <p className="text-zinc-400 text-sm leading-relaxed">
                These prizes are up for grabs — visit the shop and get
                checked in to take your spin!
              </p>
              <div
                className="mt-4 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full"
                style={{
                  color: primary,
                  border: `1px solid ${primary}44`,
                  background: `${primary}10`,
                }}
              >
                Come in to unlock
              </div>
            </div>
          )}''',
"modal locked panel")
save(p, src)
print("modal OK")

# ═══ 2. SPIN CARDS — always tappable; locked = prize preview ═════════
p = "components/customer/daily-spin-button.tsx"
src = load(p)
src = rep(src,
'''        <button
          onClick={() => { if (ready) openGame(); }}
          disabled={!ready}''',
'''        <button
          // CP-125: every state opens the game modal now — locked shows the
          // wheel as a PRIZE PREVIEW (spin stays gated server-side), and
          // cooldown re-shows today's result. Window-shopping sells visits.
          onClick={openGame}''',
"compact open")

src = rep(src,
'            {variant === "cooldown" ? `Next play in ${countdown}` : "Check in at the counter to unlock"}',
'            {variant === "cooldown" ? `Next play in ${countdown}` : "Tap to see the prizes — check in to play"}',
"compact locked copy")

src = rep(src,
'''          onClick={() => {
            // Only the "ready" state actually opens the game.
            // Cooldown + locked are informational — tapping does nothing
            // so the customer isn't dropped into a modal that just says
            // "no spin available".
            if (variant === "ready") openGame();
          }}
          disabled={variant !== "ready"}''',
'''          // CP-125: locked + cooldown open the modal too — locked shows the
          // wheel as a prize preview (spin stays gated), cooldown re-shows
          // today's result. Peeking at the prizes is the point.
          onClick={openGame}''',
"full open")

src = rep(src,
'''                {variant === "ready"
                  ? winLine
                  : variant === "cooldown"
                    ? `Next play in ${countdown}`
                    : "Visit the shop to get your play"}''',
'''                {variant === "ready"
                  ? winLine
                  : variant === "cooldown"
                    ? `Next play in ${countdown}`
                    : "Tap to see the prizes — visit to play"}''',
"full locked copy")
save(p, src)
print("spin button OK")

# ═══ 3. DESK — check-in gates on the 12h ENGINE cooldown, not the
#     streak period (weekly streaks locked the desk button all week) ══
p = "components/manager/award-points-panel.tsx"
src = load(p)

src = rep(src,
"""type StreakSnapshot = {
  is_enabled: boolean;
  current_streak: number;
  longest_streak: number;
  checked_in_this_period: boolean;
  period_type: "daily" | "weekly" | "monthly";""",
"""type StreakSnapshot = {
  is_enabled: boolean;
  current_streak: number;
  longest_streak: number;
  checked_in_this_period: boolean;
  period_type: "daily" | "weekly" | "monthly";
  // CP-125: the engine's own clock — check-ins are allowed every 12h
  // REGARDLESS of the streak period; the button gates on this now.
  last_checkin_at?: string | null;""",
"snapshot type")

src = rep(src,
'      setErr("Already checked in this period.");',
'      setErr("Checked in less than 12 hours ago — this visit is already counted.");',
"error copy")

src = rep(src,
"""  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">""",
"""  // CP-125: the ENGINE allows a check-in every 12 hours no matter what the
  // streak period is (weekly/monthly streaks just don't advance again until
  // their period rolls). The desk button used to gate on
  // checked_in_this_period, which froze it for the whole week on weekly
  // programs — blocking visits AND the customer's daily wheel spin. Now it
  // gates on the real 12h clock; the streak engine sorts out the rest.
  const cooldownEndsMs = streak?.last_checkin_at
    ? new Date(streak.last_checkin_at).getTime() + 12 * 3600_000
    : 0;
  const inCheckinCooldown = cooldownEndsMs > Date.now();

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">""",
"cooldown calc")

src = rep(src,
"""                <button
                  onClick={checkIn}
                  disabled={submitting || streak.checked_in_this_period}
                  className="mt-2 w-full rounded-2xl p-4 flex items-center gap-3 text-left transition shadow-md active:scale-[0.98] disabled:active:scale-100 disabled:opacity-70"
                  style={{
                    background: streak.checked_in_this_period
                      ? "linear-gradient(135deg, #d1fae5, #a7f3d0)"
                      : `linear-gradient(135deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})`,
                    color: streak.checked_in_this_period ? "#065f46" : "white",
                  }}
                >
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(255,255,255,0.25)" }}>
                    {streak.checked_in_this_period ? <Check className="h-6 w-6" /> : <Flame className="h-6 w-6" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-base leading-tight">
                      {streak.checked_in_this_period ? "Already checked in" : "Check in"}
                    </div>
                    <div className="text-xs opacity-90 mt-0.5">
                      {streak.current_streak > 0
                        ? <>Streak: <strong>{streak.current_streak}</strong> {streak.period_type === "daily" ? "day" : streak.period_type}{streak.current_streak === 1 ? "" : "s"} in a row</>
                        : "Start their streak today"}
                      {streak.longest_streak > streak.current_streak && (
                        <> · longest {streak.longest_streak}</>
                      )}
                    </div>
                  </div>""",
"""                <button
                  onClick={checkIn}
                  disabled={submitting || inCheckinCooldown}
                  className="mt-2 w-full rounded-2xl p-4 flex items-center gap-3 text-left transition shadow-md active:scale-[0.98] disabled:active:scale-100 disabled:opacity-70"
                  style={{
                    background: inCheckinCooldown
                      ? "linear-gradient(135deg, #d1fae5, #a7f3d0)"
                      : `linear-gradient(135deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})`,
                    color: inCheckinCooldown ? "#065f46" : "white",
                  }}
                >
                  <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(255,255,255,0.25)" }}>
                    {inCheckinCooldown ? <Check className="h-6 w-6" /> : <Flame className="h-6 w-6" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-base leading-tight">
                      {inCheckinCooldown ? "Checked in — come back later" : "Check in"}
                    </div>
                    <div className="text-xs opacity-90 mt-0.5">
                      {inCheckinCooldown ? (
                        <>Next check-in in <strong>{timeLeftLabel(cooldownEndsMs - Date.now())}</strong> (12h between visits)</>
                      ) : streak.checked_in_this_period ? (
                        // CP-125: streak already advanced this period, but the
                        // visit + wheel spin STILL count — say so, don't block.
                        <>Streak already counted this {streak.period_type === "daily" ? "day" : streak.period_type.replace("ly", "")} — this check-in still counts the visit &amp; unlocks the wheel</>
                      ) : streak.current_streak > 0 ? (
                        <>Streak: <strong>{streak.current_streak}</strong> {streak.period_type === "daily" ? "day" : streak.period_type}{streak.current_streak === 1 ? "" : "s"} in a row</>
                      ) : (
                        "Start their streak today"
                      )}
                      {!inCheckinCooldown && streak.longest_streak > streak.current_streak && (
                        <> · longest {streak.longest_streak}</>
                      )}
                    </div>
                  </div>""",
"desk button")
save(p, src)
print("desk panel OK")
