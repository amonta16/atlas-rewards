"use client";
/**
 * MemberHistoryPanel — CP-37.2
 *
 * Surfaces a member's history on the front-desk award screen.
 * Andrew's spec: after scanning a QR or typing a code, the staff
 * should see a quick read of WHO this person is — not just "10 pts,
 * Bronze tier". Specifically:
 *
 *   • Membership state (active / pending / canceled)
 *   • Current points + tier
 *   • Pending membership-activation (if any)
 *   • Referral count (members they've brought in)
 *   • Visit consistency: total visits + last visit date
 *   • Recent activity ledger (last 10 entries)
 *
 * Backed by member_history_for_staff(business_id, membership_id)
 * RPC in cp37_2_migration.sql. Staff-only — RLS gated.
 */

import { useEffect, useState } from "react";
import {
  History, Users, Clock, AlertCircle, Crown, TrendingUp, Loader2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type LedgerEntry = {
  id: string;
  delta: number;
  rule_type: string;
  notes: string | null;
  created_at: string;
};

type History = {
  membership_state: string;
  points_balance: number;
  tier: string | null;
  lifetime_points_earned: number;
  joined_at: string;
  last_visit_at: string | null;
  visit_count: number;
  referrals_brought: number;
  pending_membership_active: boolean;
  pending_membership_kind: string | null;
  ledger: LedgerEntry[];
};

export function MemberHistoryPanel({
  businessId,
  membershipId,
  primary,
}: {
  businessId: string;
  membershipId: string;
  primary: string;
}) {
  const [h, setH] = useState<History | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("member_history_for_staff", {
        p_business_id: businessId,
        p_membership_id: membershipId,
      });
      if (cancelled) return;
      if (error) { setErr(error.message); return; }
      const row = (Array.isArray(data) ? data[0] : data) as History | null;
      setH(row);
    })();
    return () => { cancelled = true; };
  }, [businessId, membershipId]);

  if (err) {
    return (
      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Couldn't load member history: {err}
      </div>
    );
  }
  if (!h) {
    return (
      <div className="mt-6 rounded-2xl border bg-white p-4 flex items-center gap-2 text-xs text-zinc-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history…
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <h3 className="text-sm font-bold tracking-wide text-zinc-500 uppercase flex items-center gap-1.5">
        <History className="h-3.5 w-3.5" /> Member history
      </h3>

      {/* CP-37.2 — pending membership notice (top, alarm-tone). */}
      {h.pending_membership_active && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-xs text-amber-900">
            <div className="font-bold">Membership pending activation</div>
            <div className="opacity-90 mt-0.5">
              {h.pending_membership_kind === "in_person"
                ? "Customer chose to pay in person. Confirm payment and tap Activate on the Pending Memberships card above."
                : "Awaiting payment confirmation. See the Pending Memberships card above."}
            </div>
          </div>
        </div>
      )}

      {/* CP-37.2 — quick stats row. */}
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="Visits"
          value={h.visit_count.toLocaleString()}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          primary={primary}
        />
        <Stat
          label="Referrals"
          value={h.referrals_brought.toLocaleString()}
          icon={<Users className="h-3.5 w-3.5" />}
          primary={primary}
        />
        <Stat
          label="Lifetime"
          value={h.lifetime_points_earned.toLocaleString()}
          icon={<Crown className="h-3.5 w-3.5" />}
          primary={primary}
        />
      </div>

      {/* CP-37.2 — last visit + member-since copy. */}
      <div className="rounded-2xl border bg-white p-3 text-xs text-zinc-600 flex items-center gap-2">
        <Clock className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
        <div className="flex-1">
          <div>
            <span className="text-zinc-400">Last visit:</span>{" "}
            <strong className="text-zinc-900">
              {h.last_visit_at
                ? new Date(h.last_visit_at).toLocaleDateString(undefined, {
                    month: "short", day: "numeric", year: "numeric",
                  })
                : "—"}
            </strong>
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">
            Member since {new Date(h.joined_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
          </div>
        </div>
      </div>

      {/* CP-37.2 — recent activity ledger (compact). */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-3 py-2 border-b bg-zinc-50/60 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
          Recent activity
        </div>
        {h.ledger.length === 0 ? (
          <div className="p-4 text-xs text-zinc-500 text-center">No activity yet.</div>
        ) : (
          <div className="divide-y">
            {h.ledger.map(e => (
              <div key={e.id} className="px-3 py-2 flex items-center gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="capitalize font-semibold text-zinc-800 truncate">
                    {e.rule_type.replace(/_/g, " ")}
                  </div>
                  <div className="text-[10px] text-zinc-500 truncate">
                    {new Date(e.created_at).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    })}
                    {e.notes && ` · ${e.notes}`}
                  </div>
                </div>
                <div className={e.delta >= 0 ? "text-emerald-600 font-bold" : "text-rose-600 font-bold"}>
                  {e.delta >= 0 ? "+" : ""}{e.delta}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label, value, icon, primary,
}: { label: string; value: string; icon: React.ReactNode; primary: string }) {
  return (
    <div
      className="rounded-2xl border bg-white p-3 text-center"
      style={{ borderColor: `${primary}22` }}
    >
      <div className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
        {icon} {label}
      </div>
      <div
        className="text-xl font-extrabold mt-1 tabular-nums"
        style={{ color: primary }}
      >
        {value}
      </div>
    </div>
  );
}
