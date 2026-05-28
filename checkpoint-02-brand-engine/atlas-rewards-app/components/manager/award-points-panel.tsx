"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, X, Star, Users, Calendar, MapPin, DollarSign, Sparkles, Flame, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { Business } from "@/lib/types/database";

type Member = {
  membership_id: string; user_id: string; full_name: string | null;
  email: string | null; phone: string | null;
  points_balance: number; tier: string; joined_at: string; visit_count: number;
};

type Mode = "menu" | "purchase";

const QUICK_RULES: { key: keyof Business["point_rules"]; label: string; icon: React.ReactNode; tone: string }[] = [
  { key: "review",            label: "Google Review",  icon: <Star className="h-4 w-4" />,     tone: "amber" },
  { key: "visit",             label: "Visit / Check-in", icon: <MapPin className="h-4 w-4" />,  tone: "emerald" },
  { key: "referral_referrer", label: "Referral",         icon: <Users className="h-4 w-4" />,   tone: "indigo" },
  { key: "birthday",          label: "Birthday Bonus",   icon: <Calendar className="h-4 w-4" />, tone: "rose" },
  { key: "social_follow",     label: "Social Follow",    icon: <Sparkles className="h-4 w-4" />, tone: "cyan" },
  { key: "profile_complete",  label: "Profile Complete", icon: <Check className="h-4 w-4" />,    tone: "violet" },
];

const TONE_BG: Record<string, string> = {
  amber:   "bg-amber-50 text-amber-700",
  emerald: "bg-emerald-50 text-emerald-700",
  indigo:  "bg-indigo-50 text-indigo-700",
  rose:    "bg-rose-50 text-rose-700",
  cyan:    "bg-cyan-50 text-cyan-700",
  violet:  "bg-violet-50 text-violet-700",
};

type StreakSnapshot = {
  is_enabled: boolean;
  current_streak: number;
  longest_streak: number;
  checked_in_this_period: boolean;
  period_type: "daily" | "weekly" | "monthly";
};

export function AwardPointsPanel({
  business, member, onClose,
}: { business: Business; member: Member; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("menu");
  const [amount, setAmount] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [streak, setStreak] = useState<StreakSnapshot | null>(null);
  const [checkInResult, setCheckInResult] = useState<{ streak: number; milestone: string | null; mystery: boolean } | null>(null);

  // Load the member's current streak state when the panel opens
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.rpc("get_streak_status", {
        p_business_id: business.id, p_membership_id: member.membership_id,
      });
      const row = (Array.isArray(data) ? data[0] : data) as StreakSnapshot | null;
      setStreak(row);
    })();
  }, [business.id, member.membership_id]);

  async function checkIn() {
    setSubmitting(true); setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("member_checkin", {
      p_business_id: business.id, p_membership_id: member.membership_id,
    });
    setSubmitting(false);
    if (error) { setErr(error.message); return; }
    const row = (Array.isArray(data) ? data[0] : data) as {
      streak_after: number;
      awarded_points: number;
      is_milestone: boolean;
      milestone_label: string | null;
      milestone_mystery_unlocked: boolean;
      already_checked_in: boolean;
    } | null;
    if (!row) return;
    if (row.already_checked_in) {
      setErr("Already checked in this period.");
      return;
    }
    setCheckInResult({
      streak: row.streak_after,
      milestone: row.is_milestone ? row.milestone_label : null,
      mystery: row.milestone_mystery_unlocked,
    });
    if (row.awarded_points > 0) setSuccess(row.awarded_points);
  }

  const dollars = parseFloat(amount || "0") || 0;
  const pointsToAward = Math.floor(dollars * business.point_rules.purchase_per_dollar);

  function press(digit: string) {
    if (digit === ".") {
      if (amount.includes(".")) return;
      setAmount((amount || "0") + ".");
      return;
    }
    if (digit === "back") { setAmount(amount.slice(0, -1)); return; }
    const next = amount + digit;
    if (next.includes(".") && next.split(".")[1]?.length > 2) return;
    setAmount(next);
  }

  async function quickAward(ruleKey: string) {
    setSubmitting(true);
    setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("quick_award", {
      p_membership_id: member.membership_id,
      p_rule_key: ruleKey,
      p_notes: null,
    });
    setSubmitting(false);
    if (error) { setErr(error.message); return; }
    const awarded = data?.[0]?.points_awarded ?? 0;
    setSuccess(awarded);
  }

  async function awardPurchase() {
    if (pointsToAward <= 0) { setErr("Enter an amount greater than $0."); return; }
    setSubmitting(true);
    setErr(null);
    const supabase = createClient();
    const idempotencyKey = `purchase_${member.membership_id}_${Date.now()}`;
    const { error } = await supabase.rpc("award_points", {
      p_membership_id: member.membership_id,
      p_delta: pointsToAward,
      p_rule_type: "purchase",
      p_reference_id: null,
      p_idempotency_key: idempotencyKey,
      p_notes: `$${dollars.toFixed(2)} purchase`,
    });
    setSubmitting(false);
    if (error) { setErr(error.message); return; }
    setSuccess(pointsToAward);

    await supabase.from("events").insert({
      business_id: business.id,
      membership_id: member.membership_id,
      event_type: "purchase",
      payload: { amount_cents: Math.round(dollars * 100), source: "manager" },
      source: "manual",
      amount_cents: Math.round(dollars * 100),
    });
  }

  if (success !== null) {
    return (
      <SuccessScreen
        amount={success}
        memberName={member.full_name ?? "the member"}
        businessId={business.id}
        membershipId={member.membership_id}
        primary={business.brand_colors.primary}
        onUndone={() => {
          // After undo, route the staff back to the dashboard so they can
          // re-grant a corrected amount.
          onClose();
        }}
        onDone={onClose}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={mode === "purchase" ? () => setMode("menu") : onClose}>
            <ArrowLeft className="h-4 w-4 mr-1"/>Back
          </Button>
          <div className="text-sm font-bold">{mode === "purchase" ? "Award by purchase" : "Award points"}</div>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 flex-1 flex flex-col w-full">
        {/* Member card */}
        <div className="rounded-2xl bg-white border p-4 flex items-center gap-3">
          <div className="h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
            style={{ background: business.brand_colors.primary }}>
            {(member.full_name ?? "?")[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold truncate">{member.full_name ?? "Unnamed member"}</div>
            <div className="text-xs text-muted-foreground truncate">{member.email ?? member.phone ?? "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold" style={{ color: business.brand_colors.primary }}>
              {member.points_balance.toLocaleString()}
            </div>
            <div className="text-[10px] text-muted-foreground">pts · {member.tier}</div>
          </div>
        </div>

        {/* MODE: menu — choose what to award */}
        {mode === "menu" && (
          <>
            {/* ============ STREAK CHECK-IN ============ */}
            {streak?.is_enabled && (
              <div className="mt-6">
                <h3 className="text-sm font-bold tracking-wide text-zinc-500 uppercase">Attendance</h3>
                <button
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
                  </div>
                  {streak.current_streak > 0 && (
                    <div className="text-2xl font-extrabold tabular-nums shrink-0">
                      {streak.current_streak}
                    </div>
                  )}
                </button>

                {checkInResult && (
                  <div className="mt-2 rounded-xl border bg-white p-3 flex items-start gap-2 text-xs">
                    <Trophy className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Checked in — streak now {checkInResult.streak}.</div>
                      {checkInResult.milestone && (
                        <div className="mt-0.5 text-emerald-700 font-semibold">
                          🎉 Milestone unlocked: {checkInResult.milestone}
                          {checkInResult.mystery && " + mystery spin"}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6">
              <h3 className="text-sm font-bold tracking-wide text-zinc-500 uppercase">By transaction</h3>
              <button onClick={() => setMode("purchase")}
                className="mt-2 w-full rounded-2xl border bg-white p-4 flex items-center gap-3 hover:bg-zinc-50 text-left">
                <div className="h-10 w-10 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">Purchase amount</div>
                  <div className="text-xs text-muted-foreground">
                    {business.point_rules.purchase_per_dollar} pt per $1 spent — enter the total on the keypad
                  </div>
                </div>
                <div className="text-xs text-zinc-400">→</div>
              </button>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-bold tracking-wide text-zinc-500 uppercase">Quick award</h3>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {QUICK_RULES.map(r => {
                  const value = business.point_rules[r.key];
                  if (!value || value <= 0) return null;
                  return (
                    <button key={r.key}
                      onClick={() => quickAward(r.key)}
                      disabled={submitting}
                      className="rounded-2xl border bg-white p-3 flex flex-col items-start gap-2 hover:bg-zinc-50 text-left disabled:opacity-50">
                      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", TONE_BG[r.tone])}>
                        {r.icon}
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{r.label}</div>
                        <div className="text-xs font-bold" style={{ color: business.brand_colors.primary }}>
                          +{value} pts
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
          </>
        )}

        {/* MODE: purchase — the keypad */}
        {mode === "purchase" && (
          <>
            <div className="mt-6 text-center">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Transaction amount</div>
              <div className="text-6xl font-bold tracking-tight mt-2">
                <span className="text-zinc-400">$</span>{amount || "0"}
              </div>
              <div className="mt-2 text-sm">
                <span className="font-semibold" style={{ color: business.brand_colors.primary }}>
                  +{pointsToAward} points
                </span>
                <span className="text-muted-foreground"> at {business.point_rules.purchase_per_dollar} pt / $1</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2 max-w-sm mx-auto w-full">
              {["1","2","3","4","5","6","7","8","9",".","0","back"].map(k => (
                <button key={k} onClick={() => press(k)}
                  className="h-16 rounded-2xl bg-white border text-2xl font-bold hover:bg-zinc-50 active:bg-zinc-100 transition flex items-center justify-center">
                  {k === "back" ? <X className="h-5 w-5"/> : k}
                </button>
              ))}
            </div>

            {err && <p className="text-sm text-red-600 mt-3 text-center">{err}</p>}

            <div className="mt-auto pt-4 pb-2">
              <Button onClick={awardPurchase} disabled={submitting || pointsToAward <= 0}
                className="w-full h-14 text-base"
                style={{ background: pointsToAward > 0 ? business.brand_colors.primary : undefined }}>
                {submitting ? "Awarding…" : `Award ${pointsToAward} points`}
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

/* ─────────────────── SuccessScreen (CP-30) ───────────────────
 *
 * Full-screen brand-color flash with check mark + big "+N" + Done.
 * Adds a 30-second Undo button wired to the new reverse_last_award
 * RPC for catching front-desk mistakes (typed wrong dollar amount,
 * picked wrong quick rule, etc.). After the window closes the Undo
 * button greys out and the only action is Done.
 *
 * The flash itself is an `animate-flash` scale-down on mount that
 * makes the screen feel celebratory without being noisy.
 */
function SuccessScreen({
  amount, memberName, businessId, membershipId, primary, onUndone, onDone,
}: {
  amount: number;
  memberName: string;
  businessId: string;
  membershipId: string;
  primary: string;
  onUndone: () => void;
  onDone: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [undoing, setUndoing] = useState(false);
  const [undoErr, setUndoErr] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);

  useEffect(() => {
    if (undone) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [undone]);

  async function undo() {
    setUndoing(true);
    setUndoErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("reverse_last_award", {
      p_business_id: businessId,
      p_membership_id: membershipId,
      p_within_seconds: 60,
    });
    setUndoing(false);
    if (error) {
      setUndoErr(error.message);
      return;
    }
    setUndone(true);
    setTimeout(() => onUndone(), 900);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 animate-flash"
      style={{ background: primary }}
    >
      <div className="bg-white rounded-full h-20 w-20 flex items-center justify-center mb-6 shadow-2xl">
        <Check className="h-10 w-10" style={{ color: primary }} />
      </div>
      <div className="text-white text-center">
        <div className="text-sm uppercase tracking-widest opacity-85">
          {undone ? "Reversed" : "Points awarded"}
        </div>
        <div className={cn("text-7xl font-bold mt-2 transition", undone && "line-through opacity-60")}>
          {undone ? "—" : `+${amount}`}
        </div>
        <div className="text-base mt-2 opacity-90">to {memberName}</div>
        {!undone && (
          <div className="text-xs mt-3 opacity-75">Their app just lit up with confetti.</div>
        )}
      </div>

      {/* Undo + Done CTA stack */}
      <div className="mt-10 w-full max-w-xs space-y-2">
        {!undone && (
          <Button
            onClick={undo}
            disabled={undoing || secondsLeft === 0}
            variant="outline"
            className="w-full h-12 text-sm font-bold border-white/40 text-white bg-transparent hover:bg-white/15 hover:text-white disabled:opacity-50"
          >
            {undoing
              ? "Reversing…"
              : secondsLeft > 0
                ? `Undo (${secondsLeft}s)`
                : "Undo window closed"}
          </Button>
        )}
        <Button
          onClick={onDone}
          className="w-full h-12 text-base font-bold bg-white text-zinc-900 hover:bg-zinc-100"
        >
          Done
        </Button>
        {undoErr && (
          <p className="text-xs text-rose-100 bg-rose-900/40 rounded-lg px-3 py-2 text-center">{undoErr}</p>
        )}
      </div>

      {/* Brand-color flash keyframe — fast scale-up then settle. */}
      <style jsx>{`
        @keyframes flash {
          0%   { transform: scale(1.04); filter: brightness(1.2); }
          60%  { transform: scale(0.995); filter: brightness(1); }
          100% { transform: scale(1);     filter: brightness(1); }
        }
        :global(.animate-flash) { animation: flash 380ms ease-out; }
      `}</style>
    </div>
  );
}
