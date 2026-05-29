"use client";
/**
 * SavedGiftsSection — CP-36
 *
 * Lives at the top of the Rewards tab, immediately above "Your active
 * rewards". Shows every offer the customer has explicitly tapped "Save
 * to my rewards" on (from OfferRevealPopup). Backed by my_saved_offers()
 * with realtime subscription to customer_saved_offers — the moment the
 * save_offer() RPC inserts a row, this section updates without a refresh.
 *
 * Why this exists: before CP-36, tapping "Save to my rewards" on a gift
 * popup just dismissed the modal. Customers thought the action failed
 * because the gift didn't appear anywhere obviously labeled "Your
 * rewards". Now it lands here with a dramatic gradient row that mirrors
 * the active-redemption row treatment, so the save action feels real.
 */

import { useEffect, useState } from "react";
import { Gift, Clock, Sparkles, QrCode, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SavedGiftDetail } from "./saved-gift-detail";

type SavedOffer = {
  saved_id: string;
  offer_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  discount_type: "none" | "percent" | "flat_cents" | "points_bonus" | null;
  discount_value: number | null;
  expires_at: string | null;
  voice_message_url: string | null;
  redeem_code: string | null;
  fulfilled_at: string | null;
  saved_at: string;
};

export function SavedGiftsSection({
  businessId,
  primary,
  secondary,
  membershipId,
}: {
  businessId: string;
  primary: string;
  secondary?: string | null;
  membershipId: string | null;
}) {
  const [rows, setRows] = useState<SavedOffer[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // CP-36b: clicking a gift row opens a detail modal with a big QR + the
  // 7-char code so the front desk can scan/type to fulfill.
  const [open, setOpen] = useState<SavedOffer | null>(null);
  const sec = secondary || primary;

  // Tick once a minute for the countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!membershipId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const supabase = createClient();

    const load = async () => {
      const { data, error } = await supabase.rpc("my_saved_offers", { p_business_id: businessId });
      if (cancelled) return;
      if (error) {
        // RPC not deployed yet — render nothing rather than a stub error row.
        setRows([]);
        return;
      }
      setRows((data ?? []) as SavedOffer[]);
    };
    load();

    const ch = supabase
      .channel(`saved-offers-${membershipId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "customer_saved_offers",
          filter: `membership_id=eq.${membershipId}`,
        },
        load,
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [businessId, membershipId]);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="px-4 mt-5">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-base font-bold">Your saved gifts</h2>
        <span
          className="inline-flex items-center gap-0.5 text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full text-white shadow-sm"
          style={{ background: `linear-gradient(135deg, ${primary}, ${sec})` }}
        >
          <Sparkles className="h-2.5 w-2.5" /> Unwrapped
        </span>
      </div>

      <div className="space-y-2.5">
        {rows.map(o => {
          const expires = o.expires_at ? new Date(o.expires_at).getTime() : null;
          const remainMs = expires ? Math.max(0, expires - now) : null;
          const expired = remainMs != null && remainMs <= 0;
          const countdown = remainMs != null ? formatRemaining(remainMs) : null;
          const discount = discountLabel(o);

          const fulfilled = !!o.fulfilled_at;
          return (
            <button
              key={o.saved_id}
              onClick={() => setOpen(o)}
              className="w-full text-left rounded-2xl overflow-hidden relative shadow-lg active:scale-[0.99] transition-transform"
              style={{
                background: fulfilled
                  ? `linear-gradient(135deg, #6b7280 0%, #4b5563dd 100%)`
                  : `linear-gradient(135deg, ${primary} 0%, ${sec}dd 100%)`,
                boxShadow: `0 10px 24px ${primary}33`,
              }}
            >
              <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-25 blur-2xl pointer-events-none bg-white" />
              <div className="relative flex items-stretch gap-3 p-3">
                <div className="h-16 w-16 rounded-xl overflow-hidden shrink-0 bg-white/15 border border-white/25 flex items-center justify-center">
                  {o.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={o.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Gift className="h-7 w-7 text-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0 text-white">
                  <div className="text-[10px] font-black tracking-widest uppercase text-white/85">
                    {fulfilled ? "Redeemed gift" : "Saved gift"}
                  </div>
                  <div className="text-sm font-extrabold leading-tight truncate">{o.title}</div>
                  {o.redeem_code && !fulfilled && (
                    <div className="text-[11px] text-white/90 mt-1">
                      Code:{" "}
                      <span className="font-mono font-bold tracking-wider bg-white/20 px-1.5 py-0.5 rounded">
                        {o.redeem_code}
                      </span>
                    </div>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {discount && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white text-zinc-900">
                        {discount}
                      </span>
                    )}
                    {fulfilled ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-white/90">
                        <Check className="h-2.5 w-2.5" /> Used {new Date(o.fulfilled_at!).toLocaleDateString()}
                      </span>
                    ) : countdown && !expired ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-white/90">
                        <Clock className="h-2.5 w-2.5" /> {countdown}
                      </span>
                    ) : expired ? (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-white/70">
                        Expired
                      </span>
                    ) : null}
                  </div>
                </div>
                {!fulfilled && (
                  <div className="flex items-center justify-center h-16 w-12 rounded-xl bg-white/15 border border-white/25 shrink-0">
                    <QrCode className="h-6 w-6 text-white" />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {open && (
        <SavedGiftDetail
          gift={open}
          primary={primary}
          secondary={sec}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function discountLabel(o: SavedOffer): string | null {
  if (!o.discount_type || o.discount_type === "none") return null;
  const v = o.discount_value ?? 0;
  if (o.discount_type === "percent")      return `${v}% off`;
  if (o.discount_type === "flat_cents")   return `$${(v / 100).toFixed(0)} off`;
  if (o.discount_type === "points_bonus") return `+${v} pts`;
  return null;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0s";
  const sec = Math.floor(ms / 1000);
  const day = Math.floor(sec / 86400);
  const hr  = Math.floor((sec % 86400) / 3600);
  const min = Math.floor((sec % 3600) / 60);
  if (day > 0) return `${day}d ${hr}h left`;
  if (hr  > 0) return `${hr}h ${min}m left`;
  return `${min}m left`;
}
