"use client";
/**
 * ReferralProgressCard — CP-87 (referee side)
 *
 * Shows on the customer's Home when THEY were referred and the referral
 * is still pending: "Spend $12.50 more to unlock your +100 pt bonus"
 * with a progress bar. Realtime-subscribed so a front-desk purchase
 * moves the bar (and removes the card) live. Renders nothing when the
 * customer has no pending referral.
 */
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Progress = {
  referral_id: string;
  status: string;
  spend_cents: number;
  min_spend_cents: number;
  referee_points: number;
  referrer_name: string | null;
};

export function ReferralProgressCard({
  businessId, membershipId, primary, secondary,
}: {
  businessId: string;
  membershipId: string | null;
  primary: string;
  secondary?: string | null;
}) {
  const [p, setP] = useState<Progress | null>(null);

  useEffect(() => {
    if (!membershipId) return;
    const supabase = createClient();
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase.rpc("my_referral_progress", {
        p_business_id: businessId,
      });
      if (cancelled || error) return;
      const row = (Array.isArray(data) ? data[0] : data) as Progress | null;
      setP(row ?? null);
    };

    load();
    const ch = supabase
      .channel(`referral-progress-${membershipId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "referrals", filter: `referee_membership_id=eq.${membershipId}` },
        load)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [businessId, membershipId]);

  if (!p || p.status !== "pending" || p.min_spend_cents <= 0) return null;

  const remaining = Math.max(0, p.min_spend_cents - p.spend_cents);
  const pct = Math.min(100, Math.round((p.spend_cents / p.min_spend_cents) * 100));

  return (
    <div className="px-4 mt-3">
      <div
        className="rounded-2xl p-4 bg-white border shadow-sm"
        style={{ borderColor: `${primary}30` }}
      >
        <div className="flex items-start gap-3">
          <div
            className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${primary}15`, color: primary }}
          >
            <Users className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-extrabold text-zinc-900 leading-tight">
              {p.referee_points > 0
                ? <>Your +{p.referee_points} pt referral bonus is waiting</>
                : <>Your referral bonus is waiting</>}
            </div>
            <div className="text-[12px] text-zinc-500 mt-0.5 leading-snug">
              Spend <span className="font-bold" style={{ color: primary }}>${(remaining / 100).toFixed(2)}</span> more
              and you {p.referrer_name ? <>and {p.referrer_name} </> : <>both </>}
              get your points.
            </div>
          </div>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between text-[11px] font-bold text-zinc-500 mb-1">
            <span>${(p.spend_cents / 100).toFixed(2)} spent</span>
            <span>${(p.min_spend_cents / 100).toFixed(0)} goal</span>
          </div>
          <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: `linear-gradient(90deg, ${primary}, ${secondary ?? primary})`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
