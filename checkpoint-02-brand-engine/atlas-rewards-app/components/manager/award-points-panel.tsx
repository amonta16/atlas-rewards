"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, X, Star, Users, Calendar, MapPin, DollarSign, Sparkles, Flame, Trophy, MinusCircle, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { MemberHistoryPanel } from "@/components/manager/member-history-panel";
import { MemberPasswordReset } from "@/components/manager/member-password-reset";
// CP-120: manager-only demo flag + account reset for test members.
import { MemberDemoTools } from "@/components/manager/member-demo-tools";
import type { Business } from "@/lib/types/database";

type Member = {
  membership_id: string; user_id: string; full_name: string | null;
  email: string | null; phone: string | null;
  points_balance: number; tier: string; joined_at: string; visit_count: number;
};

type Mode = "menu" | "purchase" | "remove";

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
  // CP-103: already returned by get_streak_status — the desk just never read
  // them, so staff could not answer "when should I come back?".
  period_start?: string | null;
  period_end?: string | null;
};

/* ── CP-103 front-desk check-in timing ──────────────────────────────────
   Two different clocks, exactly as the customer's streak page computes them
   (same engine fields, same math — no second source of truth):
     · NEXT qualifying check-in: already credited this period → the next one
       that counts opens when the next period starts (period_end).
     · Streak EXPIRES: not checked in → dies at the end of THIS period;
       checked in → safe through the NEXT period as well.
   ──────────────────────────────────────────────────────────────────────── */
function streakClocks(s: StreakSnapshot | null, nowMs: number) {
  if (!s) return { nextMs: null as number | null, expiresMs: null as number | null, nextAt: null as Date | null };
  const end = s.period_end ? new Date(s.period_end).getTime() : NaN;
  const start = s.period_start ? new Date(s.period_start).getTime() : NaN;
  const hasEnd = Number.isFinite(end);
  const len = hasEnd && Number.isFinite(start) ? end - start : null;
  const nextMs = !s.checked_in_this_period ? 0 : hasEnd ? Math.max(0, end - nowMs) : null;
  const expiresMs =
    (s.current_streak ?? 0) > 0 && hasEnd
      ? s.checked_in_this_period && len
        ? Math.max(0, end + len - nowMs)
        : Math.max(0, end - nowMs)
      : null;
  return { nextMs, expiresMs, nextAt: hasEnd ? new Date(end) : null };
}

/** "2d 5h" / "5h 32m" / "42m" — compact time-left label. */
function timeLeftLabel(ms: number): string {
  if (ms <= 0) return "now";
  const mins = Math.floor(ms / 60_000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const rem = mins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${rem}m`;
  return `${rem}m`;
}

/** "Mon, Aug 24 · 9:00 AM" — the concrete moment staff can say out loud. */
function whenLabel(d: Date): string {
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// CP-86: VIP membership status for the scanned member — so the front desk
// instantly sees "this person is a member" and when the membership expires.
type VipStatus = {
  is_member: boolean;
  plan_label: string | null;
  member_since: string | null;
  expires_at: string | null;
  just_expired: boolean;
  payment_status: string | null;
};

export function AwardPointsPanel({
  business, member, onClose,
}: { business: Business; member: Member; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("menu");
  const [amount, setAmount] = useState<string>("");
  // CP-43: whole-number points to remove (corrections / refunds / abuse).
  const [removeAmount, setRemoveAmount] = useState<string>("");
  const [removeNote, setRemoveNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [streak, setStreak] = useState<StreakSnapshot | null>(null);
  const [checkInResult, setCheckInResult] = useState<{ streak: number; milestone: string | null; mystery: boolean } | null>(null);
  // CP-44: total $ this member has spent (front desk + manager + admin see it).
  const [spentCents, setSpentCents] = useState<number | null>(null);
  // CP-86: membership badge (plan + expiry) for the scanned member.
  const [vip, setVip] = useState<VipStatus | null>(null);
  // CP-95: LIVE points balance. The member prop is a snapshot from the scan
  // — after a check-in / award the staff now returns to this panel instead
  // of being kicked to the dashboard, so the balance must refresh itself.
  const [balance, setBalance] = useState(member.points_balance);
  const [reloadKey, setReloadKey] = useState(0);

  // Load the member's current streak state + total spend when the panel opens
  // (and again whenever staff come back from a success screen — reloadKey).
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      // CP-116: was ".from('memberships')" — no such table (it's
      // business_memberships), so this errored silently and the on-screen
      // balance stayed on the stale scan snapshot after every award/remove.
      const { data } = await supabase
        .from("business_memberships")
        .select("points_balance")
        .eq("id", member.membership_id)
        .single();
      const b = (data as { points_balance?: number } | null)?.points_balance;
      if (typeof b === "number") setBalance(b);
    })();
    (async () => {
      const { data } = await supabase.rpc("get_streak_status", {
        p_business_id: business.id, p_membership_id: member.membership_id,
      });
      const row = (Array.isArray(data) ? data[0] : data) as StreakSnapshot | null;
      setStreak(row);
    })();
    (async () => {
      const { data } = await supabase.rpc("member_total_spent", { p_membership_id: member.membership_id });
      setSpentCents(typeof data === "number" ? data : Number((data as any)?.[0] ?? 0));
    })();
    // CP-86: is this person a VIP member? Silent no-op if the cp86 SQL
    // isn't applied yet (RPC missing → error → badge simply doesn't render).
    (async () => {
      const { data, error } = await supabase.rpc("member_vip_status", {
        p_membership_id: member.membership_id,
      });
      if (error) return;
      const row = (Array.isArray(data) ? data[0] : data) as VipStatus | null;
      setVip(row ?? null);
    })();
  }, [business.id, member.membership_id, reloadKey]);

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

    // CP-81: a check-in IS a visit. If the business configured a per-visit
    // "Check-in reward" (point_rules.visit), award it here alongside any
    // streak milestone points — so staff only ever need this one button.
    // Previously the per-visit reward ONLY paid out via the separate
    // "Visit / Check-in" quick-award tile, which read as "check-in gives
    // no points" the first time someone tested it. The streak cooldown
    // above (already_checked_in) is the double-award guard: this only
    // fires on a genuinely new check-in for the period.
    let visitPoints = 0;
    const perVisit = Number(business.point_rules?.visit ?? 0);
    if (perVisit > 0) {
      const oldBalance = balance;
      const { data: qData, error: qErr } = await supabase.rpc("quick_award", {
        p_membership_id: member.membership_id,
        p_rule_key: "visit",
        p_notes: "Check-in",
      });
      if (!qErr) {
        visitPoints = qData?.[0]?.points_awarded ?? perVisit;
        // Same award-event fanout as the quick-award tile (CP-37.20).
        fetch("/api/notifications/award-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            business_id: business.id,
            membership_id: member.membership_id,
            old_balance: oldBalance,
            new_balance: oldBalance + visitPoints,
          }),
        }).catch(() => { /* silent */ });
      }
    }

    setCheckInResult({
      streak: row.streak_after,
      milestone: row.is_milestone ? row.milestone_label : null,
      mystery: row.milestone_mystery_unlocked,
    });
    const totalAwarded = row.awarded_points + visitPoints;
    if (totalAwarded > 0) setSuccess(totalAwarded);
  }

  const dollars = parseFloat(amount || "0") || 0;
  const pointsToAward = Math.floor(dollars * business.point_rules.purchase_per_dollar);

  // CP-43: points the staff wants to remove, capped at the member's balance.
  const pointsToRemove = Math.min(
    parseInt(removeAmount || "0", 10) || 0,
    balance,
  );

  function pressRemove(digit: string) {
    if (digit === "back") { setRemoveAmount(removeAmount.slice(0, -1)); return; }
    const next = (removeAmount + digit).replace(/^0+(?=\d)/, "");
    if (next.length > 7) return; // sane cap
    setRemoveAmount(next);
  }

  async function removePoints() {
    if (pointsToRemove <= 0) { setErr("Enter a number of points greater than 0."); return; }
    setSubmitting(true);
    setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("manager_remove_points", {
      p_membership_id: member.membership_id,
      p_amount: pointsToRemove,
      p_notes: removeNote.trim() || null,
    });
    setSubmitting(false);
    if (error) { setErr(error.message); return; }
    const removed = data?.[0]?.removed ?? pointsToRemove;
    // SuccessScreen renders a "+N" — show the removal as a negative.
    setSuccess(-removed);
  }

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
    const oldBalance = balance;
    const { data, error } = await supabase.rpc("quick_award", {
      p_membership_id: member.membership_id,
      p_rule_key: ruleKey,
      p_notes: null,
    });
    setSubmitting(false);
    if (error) { setErr(error.message); return; }
    const awarded = data?.[0]?.points_awarded ?? 0;
    setSuccess(awarded);

    // CP-37.20 — same award-event fanout as the purchase flow.
    if (awarded > 0) {
      fetch("/api/notifications/award-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: business.id,
          membership_id: member.membership_id,
          old_balance: oldBalance,
          new_balance: oldBalance + awarded,
        }),
      }).catch(() => { /* silent */ });
    }
  }

  async function awardPurchase() {
    if (pointsToAward <= 0) { setErr("Enter an amount greater than $0."); return; }
    setSubmitting(true);
    setErr(null);
    const supabase = createClient();
    const idempotencyKey = `purchase_${member.membership_id}_${Date.now()}`;
    const oldBalance = balance;
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

    // CP-37.20 — fire reward_unlocked push directly via the broadcast-
    // pattern route. Sidesteps the SQL trigger + webhook chain entirely
    // for the most-important auto-notification. Fire-and-forget; if the
    // route 500s we don't roll back the points award.
    fetch("/api/notifications/award-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        business_id: business.id,
        membership_id: member.membership_id,
        old_balance: oldBalance,
        new_balance: oldBalance + pointsToAward,
      }),
    }).catch(() => { /* silent — in-app row is the safety net */ });
  }

  // CP-95: staff kept losing the customer after "Check in" — the success
  // screen's only exit closed the whole panel, so awarding the visit spend
  // meant asking the customer to scan AGAIN. Now the primary action returns
  // to this member (with a freshly fetched balance); "Done" still exits.
  function backToMember() {
    setSuccess(null);
    setMode("menu");
    setAmount("");
    setRemoveAmount("");
    setRemoveNote("");
    setErr(null);
    setReloadKey((k) => k + 1);
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
          // After undo, stay on the member so staff can re-grant the
          // corrected amount without a re-scan.
          backToMember();
        }}
        onBack={backToMember}
        onDone={onClose}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={mode === "menu" ? onClose : () => setMode("menu")}>
            <ArrowLeft className="h-4 w-4 mr-1"/>Back
          </Button>
          <div className="text-sm font-bold">
            {mode === "purchase" ? "Award by purchase" : mode === "remove" ? "Remove points" : "Award points"}
          </div>
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
            {/* CP-44: lifetime spend + visits at a glance. */}
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {member.visit_count} visit{member.visit_count === 1 ? "" : "s"}
              {spentCents != null && spentCents > 0 && (
                <> · <span className="font-semibold text-zinc-700">${(spentCents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> spent</>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold" style={{ color: business.brand_colors.primary }}>
              {balance.toLocaleString()}
            </div>
            {/* CP-86: tier label (Bronze/Silver/Gold) removed per Andrew —
                tiers no longer exist in the customer app either (CP-73). */}
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">pts</div>
          </div>
        </div>

        {/* CP-86: unmistakable membership strip — gold when they're an
            active member (with plan + expiry), amber warning when their
            pass just lapsed so staff can offer a renewal on the spot. */}
        {vip?.is_member && (
          <div
            className="mt-2 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-sm"
            style={{
              background: "linear-gradient(135deg, #fef3c7 0%, #fde68a 55%, #fcd34d 100%)",
              border: "1px solid #f59e0b66",
            }}
          >
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 shadow-inner"
              style={{ background: "linear-gradient(135deg, #fff 0%, #fbbf24 60%, #b45309 100%)" }}
            >
              <Crown className="h-4 w-4 text-amber-900 fill-amber-200" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black text-amber-900 tracking-tight truncate">
                MEMBER{vip.plan_label ? ` · ${vip.plan_label}` : ""}
              </div>
              <div className="text-[11px] font-semibold text-amber-800/90">
                {vip.expires_at
                  ? <>Expires <strong>{new Date(vip.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</strong></>
                  : "Active — renews monthly"}
                {vip.member_since && (
                  <> · since {new Date(vip.member_since).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</>
                )}
              </div>
            </div>
          </div>
        )}
        {vip?.just_expired && (
          <div className="mt-2 rounded-2xl px-4 py-3 flex items-center gap-3 bg-amber-50 border border-amber-300">
            <Crown className="h-4 w-4 text-amber-500 shrink-0" />
            <div className="text-[12px] font-semibold text-amber-800">
              Membership <strong>expired</strong>
              {vip.expires_at && <> {new Date(vip.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</>}
              {" — offer them a renewal."}
            </div>
          </div>
        )}

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

                {/* CP-103: NEXT CHECK-IN — front desk can now answer "when
                    should I come back?" without opening the customer app. */}
                {(() => {
                  const { nextMs, expiresMs, nextAt } = streakClocks(streak, Date.now());
                  if (nextMs === null && expiresMs === null) return null;
                  const urgent = expiresMs !== null && expiresMs < 24 * 3600_000;
                  return (
                    <div className="mt-2 rounded-xl border bg-white p-3 flex items-center gap-3 text-xs">
                      <Calendar className="h-4 w-4 text-zinc-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-zinc-800">
                          {nextMs === 0
                            ? "Can check in right now"
                            : nextMs !== null
                              ? <>Next check-in counts in <strong>{timeLeftLabel(nextMs)}</strong></>
                              : "Next check-in: any visit"}
                        </div>
                        {nextMs !== null && nextMs > 0 && nextAt && (
                          <div className="text-[11px] text-zinc-500 mt-0.5">{whenLabel(nextAt)}</div>
                        )}
                      </div>
                      {expiresMs !== null && (
                        <div className="shrink-0 text-right">
                          <div className={cn("text-[9px] font-black uppercase tracking-wider", urgent ? "text-red-600" : "text-zinc-400")}>
                            Streak expires
                          </div>
                          <div className={cn("text-[12px] font-extrabold tabular-nums", urgent ? "text-red-600" : "text-zinc-700")}>
                            {timeLeftLabel(expiresMs)}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

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

            {/* CP-37.2: "By transaction" is now the dominant CTA on the
                screen. Filled with the brand color, white text, larger
                target, ring-2 emphasis. Andrew called out the prior
                version: white-on-white, no contrast, didn't read as the
                primary action front desk runs hundreds of times a day. */}
            <div className="mt-6">
              <h3 className="text-sm font-bold tracking-wide text-zinc-500 uppercase">By transaction</h3>
              <button onClick={() => setMode("purchase")}
                className="mt-2 w-full rounded-2xl p-5 flex items-center gap-3 text-left text-white shadow-lg active:scale-[0.98] transition-transform ring-2 ring-white"
                style={{
                  background: `linear-gradient(135deg, ${business.brand_colors.primary} 0%, ${business.brand_colors.secondary} 100%)`,
                  boxShadow: `0 10px 22px ${business.brand_colors.primary}33`,
                }}
              >
                <div className="h-12 w-12 rounded-xl bg-white/25 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/40 shrink-0">
                  <DollarSign className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="font-extrabold text-base leading-tight">Purchase amount</div>
                  <div className="text-xs text-white/90 mt-0.5 leading-snug">
                    {business.point_rules.purchase_per_dollar} pt per $1 spent — tap to open keypad
                  </div>
                </div>
                <div className="text-white/80 text-xl font-bold shrink-0">→</div>
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

            {/* CP-43 — remove points. Corrections, refunds, or clawing back
                points awarded in error / for abuse. Subtle, destructive-
                styled entry so it doesn't compete with the earn actions. */}
            <div className="mt-6">
              <h3 className="text-sm font-bold tracking-wide text-zinc-500 uppercase">Corrections</h3>
              <button
                onClick={() => { setRemoveAmount(""); setRemoveNote(""); setErr(null); setMode("remove"); }}
                className="mt-2 w-full rounded-2xl border border-rose-200 bg-rose-50 p-4 flex items-center gap-3 text-left hover:bg-rose-100 transition active:scale-[0.99]"
              >
                <div className="h-11 w-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <MinusCircle className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-base leading-tight text-rose-900">Remove points</div>
                  <div className="text-xs text-rose-700/80 mt-0.5 leading-snug">
                    Deduct points from this member — fixes mistakes or reverses abuse.
                  </div>
                </div>
                <div className="text-rose-400 text-xl font-bold shrink-0">→</div>
              </button>
            </div>

            {err && <p className="text-sm text-red-600 mt-3">{err}</p>}

            {/* CP-37.2 — member history. Lives BELOW the action buttons
                so the staff's primary path (check in → award points) is
                always at the top of the screen, with context below. */}
            <MemberHistoryPanel
              businessId={business.id}
              membershipId={member.membership_id}
              primary={business.brand_colors.primary}
            />

            {/* CP-48: front-desk account recovery — set a new password for
                this member (current one can't be shown; it's hashed). */}
            <MemberPasswordReset
              userId={member.user_id}
              email={member.email}
              primary={business.brand_colors.primary}
            />

            {/* CP-120: demo flag + reset — renders ONLY for managers /
                agency (current_app_role); the RPCs enforce the same gate
                server-side. Reset bumps reloadKey so the live balance,
                streak, and spend refresh immediately. */}
            <MemberDemoTools
              businessId={business.id}
              membershipId={member.membership_id}
              memberName={member.full_name ?? "this member"}
              onReset={() => { setReloadKey(k => k + 1); }}
            />
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

        {/* MODE: remove — integer keypad that deducts points */}
        {mode === "remove" && (
          <>
            <div className="mt-6 text-center">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Points to remove</div>
              <div className="text-6xl font-bold tracking-tight mt-2 text-rose-600">
                −{removeAmount || "0"}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Balance {member.points_balance.toLocaleString()} →{" "}
                <span className="font-semibold text-zinc-900">
                  {(member.points_balance - pointsToRemove).toLocaleString()}
                </span>
              </div>
              {parseInt(removeAmount || "0", 10) > member.points_balance && (
                <div className="mt-1 text-[11px] text-amber-600 font-semibold">
                  Capped at their balance — can't go below 0.
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2 max-w-sm mx-auto w-full">
              {["1","2","3","4","5","6","7","8","9","","0","back"].map((k, i) => (
                k === "" ? <div key={`sp-${i}`} /> : (
                  <button key={k} onClick={() => pressRemove(k)}
                    className="h-16 rounded-2xl bg-white border text-2xl font-bold hover:bg-zinc-50 active:bg-zinc-100 transition flex items-center justify-center">
                    {k === "back" ? <X className="h-5 w-5"/> : k}
                  </button>
                )
              ))}
            </div>

            <div className="mt-5 max-w-sm mx-auto w-full">
              <input
                value={removeNote}
                onChange={e => setRemoveNote(e.target.value)}
                placeholder="Reason (optional) — e.g. refund, mistake"
                maxLength={120}
                className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm"
              />
            </div>

            {err && <p className="text-sm text-red-600 mt-3 text-center">{err}</p>}

            <div className="mt-auto pt-4 pb-2">
              <Button onClick={removePoints} disabled={submitting || pointsToRemove <= 0}
                className="w-full h-14 text-base bg-rose-600 hover:bg-rose-700 text-white">
                {submitting ? "Removing…" : `Remove ${pointsToRemove} points`}
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
  amount, memberName, businessId, membershipId, primary, onUndone, onBack, onDone,
}: {
  amount: number;
  memberName: string;
  businessId: string;
  membershipId: string;
  primary: string;
  onUndone: () => void;
  /** CP-95: return to the member's panel (keep serving this customer). */
  onBack: () => void;
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
          {/* CP-43: a negative amount means points were removed. */}
          {undone ? "Reversed" : amount < 0 ? "Points removed" : "Points awarded"}
        </div>
        <div className={cn("text-7xl font-bold mt-2 transition", undone && "line-through opacity-60")}>
          {undone ? "—" : amount < 0 ? `−${Math.abs(amount)}` : `+${amount}`}
        </div>
        <div className="text-base mt-2 opacity-90">
          {amount < 0 ? "from " : "to "}{memberName}
        </div>
        {!undone && amount >= 0 && (
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
        {/* CP-95: primary = keep serving this customer (e.g. check-in →
            now enter what they spent). Secondary = fully done. */}
        <Button
          onClick={onBack}
          className="w-full h-12 text-base font-bold bg-white text-zinc-900 hover:bg-zinc-100"
        >
          Back to {memberName.split(" ")[0]}
        </Button>
        <Button
          onClick={onDone}
          variant="outline"
          className="w-full h-11 text-sm font-bold border-white/40 text-white bg-transparent hover:bg-white/15 hover:text-white"
        >
          Done — next customer
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
