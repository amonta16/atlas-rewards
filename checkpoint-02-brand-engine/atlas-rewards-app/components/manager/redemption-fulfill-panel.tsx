"use client";
import { useState } from "react";
import { ArrowLeft, Check, Gift, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

export type RedemptionLookup = {
  redemption_id: string; reward_id: string; membership_id: string;
  reward_name: string; reward_description: string | null; reward_type: string;
  point_cost: number; status: string; code: string;
  member_name: string | null; member_email: string | null;
  created_at: string; expires_at: string | null; fulfilled_at: string | null;
};

export function RedemptionFulfillPanel({
  business, redemption, onClose,
}: { business: Business; redemption: RedemptionLookup; onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isPending = redemption.status === "pending";

  async function fulfill() {
    setSubmitting(true);
    setErr(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("fulfill_redemption", { p_redemption_id: redemption.redemption_id });
    setSubmitting(false);
    if (error) { setErr(error.message); return; }
    setSuccess(true);
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6"
        style={{ background: business.brand_colors.primary }}>
        <div className="bg-white rounded-full h-20 w-20 flex items-center justify-center mb-6">
          <Check className="h-10 w-10" style={{ color: business.brand_colors.primary }} />
        </div>
        <div className="text-white text-center">
          <div className="text-sm uppercase tracking-widest opacity-85">Reward delivered</div>
          <div className="text-3xl font-bold mt-2">{redemption.reward_name}</div>
          <div className="text-base mt-2 opacity-90">for {redemption.member_name ?? "the member"}</div>
        </div>
        <Button onClick={onClose} className="mt-10 bg-white text-zinc-900 hover:bg-zinc-100 w-full max-w-xs h-12 text-base">
          Done
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="h-4 w-4 mr-1"/>Back</Button>
          <div className="text-sm font-bold">Redemption</div>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 flex-1 w-full">
        {/* Status banner */}
        {!isPending && (
          <div className={`rounded-2xl p-4 mb-4 flex items-center gap-3 ${
            redemption.status === "fulfilled" ? "bg-emerald-50 text-emerald-800"
            : redemption.status === "expired" ? "bg-zinc-100 text-zinc-700"
            : "bg-amber-50 text-amber-800"
          }`}>
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <div className="font-semibold capitalize">{redemption.status}</div>
              <div className="text-xs">
                {redemption.status === "fulfilled" && redemption.fulfilled_at &&
                  `Fulfilled ${new Date(redemption.fulfilled_at).toLocaleString()}`}
                {redemption.status === "expired" && "This code has expired and cannot be used."}
                {redemption.status === "cancelled" && "This redemption was cancelled."}
              </div>
            </div>
          </div>
        )}

        {/* Reward card */}
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="h-32 flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary}20 0%, ${business.brand_colors.primary}40 100%)` }}>
            <Gift className="h-12 w-12" style={{ color: business.brand_colors.primary }} />
          </div>
          <div className="p-5">
            <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: business.brand_colors.primary }}>
              {redemption.reward_type.replace(/_/g, " ")}
            </div>
            <h2 className="text-xl font-bold mt-1">{redemption.reward_name}</h2>
            {redemption.reward_description && (
              <p className="text-sm text-muted-foreground mt-1">{redemption.reward_description}</p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Member</div>
                <div className="font-medium mt-0.5 truncate">{redemption.member_name ?? "Unnamed"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Cost</div>
                <div className="font-medium mt-0.5">{redemption.point_cost.toLocaleString()} pts</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Code</div>
                <div className="font-mono font-bold tracking-wider mt-0.5">{redemption.code}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Claimed</div>
                <div className="font-medium mt-0.5">{new Date(redemption.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          </div>
        </div>

        {err && <p className="text-sm text-red-600 mt-3">{err}</p>}

        {/* Fulfill CTA */}
        {isPending && (
          <div className="mt-6 space-y-2">
            <p className="text-center text-sm text-muted-foreground">
              <Clock className="h-3.5 w-3.5 inline mr-1" />
              Verify the member is here. Tap to deliver the reward.
            </p>
            <Button onClick={fulfill} disabled={submitting}
              className="w-full h-14 text-base text-white"
              style={{ background: business.brand_colors.primary }}>
              {submitting ? "Marking fulfilled…" : `Deliver ${redemption.reward_name}`}
            </Button>
            <Button variant="outline" className="w-full" onClick={onClose}>Cancel</Button>
          </div>
        )}

        {!isPending && (
          <div className="mt-6">
            <Button variant="outline" className="w-full" onClick={onClose}>Back to dashboard</Button>
          </div>
        )}
      </main>
    </div>
  );
}
