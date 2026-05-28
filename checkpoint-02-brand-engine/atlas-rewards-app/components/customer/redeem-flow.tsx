"use client";
import { useState } from "react";
import { X, Gift, Check, Copy } from "lucide-react";
import QRCode from "react-qr-code";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import type { Business } from "@/lib/types/database";

type Reward = {
  id: string; name: string; description: string | null;
  reward_type: string; point_cost: number; image_url: string | null;
};

type Stage = "confirm" | "loading" | "success" | null;

export function RedeemFlow({
  business, reward, currentPoints, onClose,
}: {
  business: Business;
  reward: Reward | null;
  currentPoints: number;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>(reward ? "confirm" : null);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ code: string; newBalance: number } | null>(null);

  if (!reward || stage === null) return null;

  async function confirm() {
    if (!reward) return;
    setStage("loading");
    setErr(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("redeem_reward", { p_reward_id: reward.id });
    if (error) { setErr(error.message); setStage("confirm"); return; }
    const row = data?.[0];
    if (!row) { setErr("Could not create redemption."); setStage("confirm"); return; }
    setResult({ code: row.code, newBalance: row.new_balance });
    setStage("success");
  }

  function copyCode() {
    if (result?.code) navigator.clipboard.writeText(result.code);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* CONFIRM */}
        {stage === "confirm" && (
          <>
            <div className="p-5 flex items-center justify-between border-b">
              <h2 className="text-lg font-bold">Redeem reward?</h2>
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6">
              <div className="h-32 rounded-2xl flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary}20 0%, ${business.brand_colors.primary}40 100%)` }}>
                <Gift className="h-12 w-12" style={{ color: business.brand_colors.primary }} />
              </div>

              <h3 className="text-xl font-bold text-center mt-5">{reward.name}</h3>
              {reward.description && <p className="text-sm text-muted-foreground text-center mt-1">{reward.description}</p>}

              <div className="mt-6 rounded-xl border bg-zinc-50 p-4 space-y-2">
                <Row label="Cost" value={`${reward.point_cost.toLocaleString()} pts`} />
                <Row label="Your balance now" value={`${currentPoints.toLocaleString()} pts`} />
                <div className="border-t pt-2">
                  <Row label="After redemption" value={`${(currentPoints - reward.point_cost).toLocaleString()} pts`} bold color={business.brand_colors.primary} />
                </div>
              </div>

              {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
            </div>

            <div className="p-5 border-t flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button className="flex-1 text-white" style={{ background: business.brand_colors.primary }} onClick={confirm}>
                Confirm redemption
              </Button>
            </div>
          </>
        )}

        {/* LOADING */}
        {stage === "loading" && (
          <div className="p-10 text-center">
            <div className="animate-spin h-10 w-10 rounded-full border-4 border-zinc-200 border-t-zinc-600 mx-auto" />
            <p className="text-sm text-muted-foreground mt-4">Creating your reward…</p>
          </div>
        )}

        {/* SUCCESS — show the code + QR */}
        {stage === "success" && result && (
          <>
            <div className="p-5 flex items-center justify-between border-b">
              <h2 className="text-lg font-bold">Reward unlocked</h2>
              <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <div className="text-center mb-4">
                <div className="h-14 w-14 rounded-full mx-auto flex items-center justify-center"
                  style={{ background: `${business.brand_colors.primary}15`, color: business.brand_colors.primary }}>
                  <Check className="h-7 w-7" />
                </div>
                <h3 className="text-xl font-bold mt-3">{reward.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">Show this to staff to claim</p>
              </div>

              <div
                className="rounded-2xl p-5 text-white"
                style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary} 0%, ${business.brand_colors.secondary} 100%)` }}
              >
                <div className="bg-white rounded-xl p-4 flex items-center justify-center">
                  <QRCode value={result.code} size={160} fgColor="#0a0a0a" bgColor="#ffffff" />
                </div>
                <div className="mt-4 text-center">
                  <div className="text-[10px] uppercase tracking-widest opacity-85">Redemption code</div>
                  <div className="font-mono font-bold text-2xl tracking-[0.25em] mt-1">{result.code}</div>
                </div>
              </div>

              <button
                onClick={copyCode}
                className="mt-3 w-full rounded-xl border bg-white py-2.5 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-zinc-50"
              >
                <Copy className="h-4 w-4" /> Copy code
              </button>

              <p className="text-xs text-center text-muted-foreground mt-4">
                Expires in 30 days · Find it later in your active rewards.
              </p>
            </div>

            <div className="p-5 border-t">
              <Button className="w-full text-white h-12" style={{ background: business.brand_colors.primary }} onClick={onClose}>
                Done
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-bold" : "font-medium"} style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}
