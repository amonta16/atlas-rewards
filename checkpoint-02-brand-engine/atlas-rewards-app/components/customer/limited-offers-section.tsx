"use client";
/**
 * LimitedOffersSection — CP-29.1
 *
 * Lives on the Rewards tab, above the Rewards Store. Shows every active
 * offer for the business — automated or one-off — as a card with image,
 * headline, discount chip, live countdown, and a "Replay reveal" link
 * that re-fires <OfferRevealPopup/> for that offer.
 *
 * Discount chips:
 *   - percent     → "10% off"
 *   - flat_cents  → "$5 off"
 *   - points_bonus → "+200 pts"
 *   - none / null → no chip (the offer is informational, not redeemable)
 *
 * Replay reveal: clears the saved seen-state for that offer id, then
 * triggers an in-place popup. Customers can play the gift moment again
 * any time they want.
 */

import { useEffect, useMemo, useState } from "react";
import { Clock, Gift, Mic, Play } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { OfferRevealPopup, type RevealOffer } from "./offer-reveal-popup";

type ActiveOffer = RevealOffer & {
  is_automated: boolean;
  is_featured: boolean;
};

export function LimitedOffersSection({
  businessId,
  businessName,
  primary,
  secondary,
}: {
  businessId: string;
  businessName: string;
  primary: string;
  secondary?: string | null;
}) {
  const [rows, setRows] = useState<ActiveOffer[] | null>(null);
  const [replaying, setReplaying] = useState<ActiveOffer | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick once a minute for the countdown labels (we only show day+hour so
  // sub-minute precision is overkill).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // ── load + realtime ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const load = async () => {
      const { data } = await supabase.rpc("list_active_offers", { p_business_id: businessId });
      if (!cancelled) setRows((data ?? []) as ActiveOffer[]);
    };
    load();
    const ch = supabase
      .channel(`limited-offers-${businessId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "offers", filter: `business_id=eq.${businessId}` },
        load,
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [businessId]);

  /** Replay = remove from seen-set then show the popup in place. */
  function replay(offer: ActiveOffer) {
    if (typeof window !== "undefined") {
      try {
        const key = `atlas-offer-seen-${businessId}`;
        const raw = window.localStorage.getItem(key);
        if (raw) {
          const list = JSON.parse(raw) as string[];
          window.localStorage.setItem(key, JSON.stringify(list.filter((id) => id !== offer.id)));
        }
      } catch { /* ignore */ }
    }
    setReplaying(offer);
  }

  const sec = secondary || primary;

  // Hide the entire section when there's nothing to show — the rewards page
  // is already busy and a stub-y "no offers" card would just be noise.
  if (!rows || rows.length === 0) return null;

  return (
    <>
      <section className="px-4 mt-5">
        <div className="flex items-center gap-2 mb-2.5">
          <h2 className="text-base font-bold">Limited offers</h2>
          <span
            className="inline-flex items-center gap-0.5 text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded-full text-white shadow-sm"
            style={{ background: `linear-gradient(135deg, ${primary}, ${sec})` }}
          >
            <Gift className="h-2.5 w-2.5" /> Just for you
          </span>
        </div>

        <div className="space-y-2.5">
          {rows.map((o) => {
            const expires = o.expires_at ? new Date(o.expires_at).getTime() : null;
            const remainMs = expires ? Math.max(0, expires - now) : null;
            const countdown = remainMs != null ? formatRemaining(remainMs) : null;
            const expired = remainMs != null && remainMs <= 0;
            const discount = discountLabel(o);
            return (
              <div
                key={o.id}
                className="rounded-2xl border bg-white overflow-hidden flex"
                style={{ borderColor: `${primary}1f` }}
              >
                {/* Image (with brand-gradient fallback) */}
                <div
                  className="w-24 shrink-0 relative"
                  style={{
                    background: `linear-gradient(135deg, ${primary}15 0%, ${sec}06 100%)`,
                  }}
                >
                  {o.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={o.image_url} alt={o.title} className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Gift className="h-6 w-6" style={{ color: primary }} />
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0 p-3">
                  <div className="text-sm font-bold leading-tight truncate">{o.title}</div>
                  {o.description && (
                    <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug line-clamp-1">{o.description}</div>
                  )}

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {/* Discount chip */}
                    {discount && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[10px] font-extrabold px-2 py-0.5 rounded-full text-white shadow-sm"
                        style={{ background: `linear-gradient(135deg, ${primary}, ${sec})` }}
                      >
                        {discount}
                      </span>
                    )}
                    {/* Voice marker */}
                    {o.voice_message_url && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700"
                      >
                        <Mic className="h-2.5 w-2.5" /> Voice
                      </span>
                    )}
                    {/* Countdown */}
                    {countdown && !expired && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-zinc-500">
                        <Clock className="h-2.5 w-2.5" /> {countdown}
                      </span>
                    )}
                    {expired && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-zinc-400">
                        Expired
                      </span>
                    )}
                  </div>

                  {/* Replay link */}
                  <button
                    type="button"
                    onClick={() => replay(o)}
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold hover:underline"
                    style={{ color: primary }}
                  >
                    <Play className="h-2.5 w-2.5 fill-current" /> Replay reveal
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* In-place popup replay */}
      {replaying && (
        <OfferRevealPopup
          offer={replaying}
          primary={primary}
          secondary={sec}
          businessName={businessName}
          onDismiss={() => setReplaying(null)}
        />
      )}
    </>
  );
}

/* ─── helpers ─── */

function discountLabel(o: RevealOffer): string | null {
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
