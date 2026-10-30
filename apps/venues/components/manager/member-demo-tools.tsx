"use client";
/**
 * MemberDemoTools — CP-120
 *
 * Manager-only block at the bottom of the front-desk member panel:
 *
 *   · "Demo account" toggle — marks the membership is_demo, which pulls
 *     ALL of its activity out of Insights, Atlas Impact, revenue charts,
 *     the daily recap, leaderboards, and the review funnel (server-side,
 *     in the analytics RPCs). The account itself keeps working normally
 *     at the desk and in the customer app — perfect for testing flows
 *     without skewing a live business's numbers.
 *
 *   · "Reset account" — wipes the member's activity history (points
 *     ledger, check-ins, streak, redemptions, saved gifts, spend, spins,
 *     raffle entries, notifications) and zeroes the counters, so a
 *     played-with test account starts from day one. Two-step inline
 *     confirm; irreversible, hence manager-gated.
 *
 * Visibility: the whole block renders ONLY for business managers /
 * agency admin / agency VA (current_app_role). Front-desk PIN staff see
 * nothing here — the server RPCs enforce the same gate regardless.
 */
import { useEffect, useState } from "react";
import { FlaskConical, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function MemberDemoTools({
  businessId,
  membershipId,
  memberName,
  onReset,
}: {
  businessId: string;
  membershipId: string;
  memberName: string;
  /** Called after a successful reset so the parent refreshes balances. */
  onReset?: () => void;
}) {
  const [role, setRole] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.rpc("current_app_role", { p_business_id: businessId });
      if (!cancelled) setRole(typeof data === "string" ? data : null);
    })();
    (async () => {
      // Staff can read the row (RLS) — the demo FLAG is visible to all
      // desk roles; only changing it is manager-gated.
      const { data } = await supabase
        .from("business_memberships")
        .select("is_demo")
        .eq("id", membershipId)
        .single();
      if (!cancelled) setIsDemo(Boolean((data as { is_demo?: boolean } | null)?.is_demo));
    })();
    return () => { cancelled = true; };
  }, [businessId, membershipId]);

  const isManager = role === "business_manager" || role === "agency_admin" || role === "agency_va";
  if (!isManager) return null;

  async function toggleDemo() {
    if (isDemo === null) return;
    setBusy(true); setErr(null); setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("set_member_demo", {
      p_membership_id: membershipId, p_is_demo: !isDemo,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const now = Boolean(data);
    setIsDemo(now);
    setMsg(now
      ? "Marked as demo — this account no longer counts in analytics."
      : "Back to a real account — activity counts in analytics again.");
  }

  async function resetAccount() {
    setBusy(true); setErr(null); setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("reset_member_account", {
      p_membership_id: membershipId,
    });
    setBusy(false); setConfirming(false);
    if (error) { setErr(error.message); return; }
    const d = (data ?? {}) as Record<string, number>;
    const wiped = (d.ledger_rows ?? 0) + (d.check_ins ?? 0) + (d.redemptions ?? 0)
      + (d.saved_gifts ?? 0) + (d.spend_events ?? 0) + (d.notifications ?? 0);
    setMsg(`Account reset — ${wiped} activity record${wiped === 1 ? "" : "s"} cleared, points and streak back to zero.`);
    onReset?.();
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-bold tracking-wide text-zinc-500 uppercase">Demo &amp; reset</h3>

      {/* Demo toggle */}
      <div className="mt-2 rounded-2xl border bg-white p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${isDemo ? "bg-violet-100" : "bg-zinc-100"}`}>
          <FlaskConical className={`h-5 w-5 ${isDemo ? "text-violet-600" : "text-zinc-400"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm flex items-center gap-1.5">
            Demo account
            {isDemo && (
              <span className="text-[9px] font-black uppercase tracking-wider text-violet-700 bg-violet-100 border border-violet-200 rounded-full px-1.5 py-0.5">
                DEMO
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {isDemo
              ? "Excluded from analytics — check-ins and points here don't count."
              : "Counts in analytics like any real customer."}
          </div>
        </div>
        <button
          onClick={toggleDemo}
          disabled={busy || isDemo === null}
          aria-label="Toggle demo account"
          className={`relative h-7 w-12 rounded-full transition-colors shrink-0 disabled:opacity-50 ${isDemo ? "bg-violet-500" : "bg-zinc-300"}`}
        >
          <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${isDemo ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </div>

      {/* Reset */}
      <div className="mt-2 rounded-2xl border bg-white p-4">
        {!confirming ? (
          <button
            onClick={() => { setConfirming(true); setMsg(null); setErr(null); }}
            disabled={busy}
            className="w-full flex items-center gap-3 text-left disabled:opacity-50"
          >
            <div className="h-10 w-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
              <RotateCcw className="h-5 w-5 text-rose-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-rose-600">Reset account</div>
              <div className="text-[11px] text-muted-foreground">
                Wipe points, streak, visits, and history — start from day one.
              </div>
            </div>
          </button>
        ) : (
          <div>
            <div className="flex items-start gap-2 text-rose-700">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div className="text-[12px] font-semibold">
                Permanently erase all of <strong>{memberName}</strong>&rsquo;s points, check-ins,
                streak, redemptions, and history? This can&rsquo;t be undone.
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={resetAccount}
                disabled={busy}
                className="flex-1 h-10 rounded-xl bg-rose-600 text-white text-sm font-bold active:scale-[0.98] transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                Yes, reset
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="flex-1 h-10 rounded-xl border text-sm font-bold text-zinc-600 active:scale-[0.98] transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {msg && <div className="mt-2 text-[12px] font-semibold text-emerald-700">{msg}</div>}
      {err && <div className="mt-2 text-[12px] font-semibold text-rose-600">{err}</div>}
    </div>
  );
}
