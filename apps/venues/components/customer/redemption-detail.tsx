"use client";
import { X, Copy } from "lucide-react";
import QRCode from "react-qr-code";
import type { Business } from "@/lib/types/database";
import type { ActiveRedemption } from "./active-redemptions";

export function RedemptionDetail({
  business, redemption, onClose,
}: { business: Business; redemption: ActiveRedemption; onClose: () => void }) {
  const expiresAt = redemption.expires_at
    ? new Date(redemption.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden">
        <div className="p-5 flex items-center justify-between border-b">
          <h2 className="text-lg font-bold">{redemption.reward_name}</h2>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-xs text-muted-foreground text-center mb-4">Show this to staff to claim your reward.</p>

          <div
            className="rounded-2xl p-5 text-white"
            style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary} 0%, ${business.brand_colors.secondary} 100%)` }}
          >
            <div className="bg-white rounded-xl p-4 flex items-center justify-center">
              <QRCode value={redemption.code} size={180} fgColor="#0a0a0a" bgColor="#ffffff" />
            </div>
            <div className="mt-4 text-center">
              <div className="text-[10px] uppercase tracking-widest opacity-85">Redemption code</div>
              <div className="font-mono font-bold text-2xl tracking-[0.25em] mt-1">{redemption.code}</div>
            </div>
          </div>

          <button
            onClick={() => navigator.clipboard.writeText(redemption.code)}
            className="mt-3 w-full rounded-xl border bg-white py-2.5 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-zinc-50"
          >
            <Copy className="h-4 w-4" /> Copy code
          </button>

          <div className="mt-4 text-xs text-center text-muted-foreground space-y-0.5">
            <div>{redemption.point_cost.toLocaleString()} points · {redemption.reward_type.replace(/_/g, " ")}</div>
            {expiresAt && <div>Expires {expiresAt}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
