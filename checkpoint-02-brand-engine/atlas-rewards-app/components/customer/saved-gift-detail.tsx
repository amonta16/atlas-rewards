"use client";
/**
 * SavedGiftDetail — CP-36b
 *
 * Full-screen-ish modal opened when the customer taps a row in
 * SavedGiftsSection. Mirrors RedemptionDetail in spirit but for saved
 * gifts: shows the artwork, discount, a giant QR code embedding the
 * 7-char redeem_code, and the code text itself in big mono type so the
 * customer can show their phone to the front desk and have it scanned
 * (or read off).
 *
 * The front-desk's existing scanner pipeline (manager-dashboard's
 * resolveCode) needs the cp36 SQL applied to also fall through to
 * resolve_saved_offer_by_code — that's done in cp36_migration.sql and
 * picked up via the manager wiring in CP-36b.
 */

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { X, Gift, Clock, Sparkles } from "lucide-react";

type GiftLike = {
  saved_id: string;
  offer_id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  discount_type: "none" | "percent" | "flat_cents" | "points_bonus" | null;
  discount_value: number | null;
  expires_at: string | null;
  redeem_code: string | null;
  fulfilled_at: string | null;
};

export function SavedGiftDetail({
  gift, primary, secondary, onClose,
}: {
  gift: GiftLike;
  primary: string;
  secondary: string;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const expiresMs = gift.expires_at ? new Date(gift.expires_at).getTime() : null;
  const remainMs = expiresMs ? Math.max(0, expiresMs - now) : null;
  const countdown = remainMs != null ? formatRemaining(remainMs) : null;
  const expired = remainMs != null && remainMs <= 0;

  const discount = (() => {
    if (!gift.discount_type || gift.discount_type === "none") return null;
    const v = gift.discount_value ?? 0;
    if (gift.discount_type === "percent")      return `${v}% off`;
    if (gift.discount_type === "flat_cents")   return `$${(v / 100).toFixed(0)} off`;
    if (gift.discount_type === "points_bonus") return `+${v} pts`;
    return null;
  })();

  const fulfilled = !!gift.fulfilled_at;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
        style={{
          background: fulfilled
            ? "linear-gradient(160deg, #6b7280 0%, #374151 100%)"
            : `linear-gradient(160deg, ${primary} 0%, ${secondary} 100%)`,
        }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-5 pt-6 text-center text-white">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full bg-white/15 ring-1 ring-white/30">
            <Sparkles className="h-3 w-3" /> {fulfilled ? "Redeemed gift" : "Your saved gift"}
          </div>
          <h2 className="text-xl font-extrabold mt-3 leading-tight">{gift.title}</h2>
          {gift.description && (
            <p className="text-sm text-white/90 mt-1 leading-snug">{gift.description}</p>
          )}
          {discount && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-extrabold px-3 py-1.5 rounded-full bg-white text-zinc-900">
              <Gift className="h-3.5 w-3.5" /> {discount}
            </div>
          )}
        </div>

        {/* QR + code panel */}
        <div className="mx-5 mt-5 rounded-2xl bg-white p-5 text-center">
          {gift.redeem_code ? (
            <>
              <div className="text-[10px] font-bold tracking-widest uppercase text-zinc-500 mb-3">
                Show this to the front desk
              </div>
              <div className="flex items-center justify-center">
                <div className="p-3 rounded-xl bg-white border border-zinc-200">
                  <QRCode
                    value={gift.redeem_code}
                    size={180}
                    bgColor="#ffffff"
                    fgColor="#0a0a0a"
                    level="M"
                  />
                </div>
              </div>
              <div className="mt-4 text-[10px] font-bold tracking-widest uppercase text-zinc-500">Code</div>
              <div className="text-3xl font-mono font-extrabold tracking-[0.3em] text-zinc-900 mt-1 select-all">
                {gift.redeem_code}
              </div>
              {fulfilled && (
                <div className="mt-3 text-[11px] font-bold text-rose-600">
                  Already redeemed {new Date(gift.fulfilled_at!).toLocaleString()}
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-zinc-500">
              Code not generated yet — try refreshing the page.
            </div>
          )}
        </div>

        {/* Countdown footer */}
        <div className="px-5 py-4 text-center text-white text-[11px] font-bold flex items-center justify-center gap-1.5">
          {countdown && !expired && (
            <><Clock className="h-3 w-3" /> Expires in {countdown}</>
          )}
          {expired && <>This gift has expired.</>}
          {!countdown && !expired && <>No expiration.</>}
        </div>
      </div>
    </div>
  );
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "0s";
  const sec = Math.floor(ms / 1000);
  const day = Math.floor(sec / 86400);
  const hr  = Math.floor((sec % 86400) / 3600);
  const min = Math.floor((sec % 3600) / 60);
  if (day > 0) return `${day}d ${hr}h`;
  if (hr  > 0) return `${hr}h ${min}m`;
  return `${min}m`;
}
