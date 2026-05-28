"use client";
/**
 * OfferRevealPopup — CP-29.1
 *
 * The "magic moment" when an automated offer fires on the customer's app:
 * a wrapped-gift popup slides up, the customer taps to unwrap, the reveal
 * animation plays, and the reward is shown with its discount + optional
 * voice note + live countdown to expiry.
 *
 * Design choices Andrew called out:
 *   • No trigger icon — the popup auto-appears the moment the customer
 *     opens the app and a new (unseen) offer is live.
 *   • Tap-to-unwrap interaction (the simplest gesture across web + mobile;
 *     "scratch" needs drag tracking that doesn't pay off here).
 *   • ~5–6s "linger" — if the customer doesn't interact the popup auto-
 *     dismisses but the offer still lands in their rewards list (see
 *     LimitedOffersSection in rewards-client.tsx).
 *   • Voice note plays inline after unwrap when one is attached.
 *
 * Seen-state is tracked in localStorage by offer.id, so the popup only
 * fires once per offer per device. (Cleared when the offer expires —
 * if the agency replays it next year a fresh popup happens.)
 */

import { useEffect, useRef, useState } from "react";
import { Gift, Sparkles, X, Play, Pause, Clock, Check } from "lucide-react";

export type RevealOffer = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  voice_message_url: string | null;
  expires_at: string | null;
  /** Optional discount fields the agency configured. When present we render
   *  a big colored chip on the unwrapped card. */
  discount_type?: "none" | "percent" | "flat_cents" | "points_bonus" | null;
  discount_value?: number | null;
};

export function OfferRevealPopup({
  offer,
  primary,
  secondary,
  businessName,
  onDismiss,
  /** When true, the unwrap animation skips and the card opens revealed —
   *  used by the agency-side preview to demo the post-unwrap state. */
  startRevealed = false,
  /** Disables the auto-dismiss timer. Used by the looping agency preview. */
  autoDismiss = true,
}: {
  offer: RevealOffer;
  primary: string;
  secondary?: string;
  businessName: string;
  onDismiss: () => void;
  startRevealed?: boolean;
  autoDismiss?: boolean;
}) {
  const sec = secondary || primary;
  const [revealed, setRevealed] = useState(startRevealed);
  const [closing, setClosing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Tick once a second for live countdown.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-dismiss after a generous linger — but only if the user hasn't
  // started interacting yet (clicked unwrap or played the voice note).
  useEffect(() => {
    if (!autoDismiss) return;
    if (revealed) return; // once interacted, stop the timer
    const t = setTimeout(() => {
      handleClose();
    }, 6000);
    return () => clearTimeout(t);
  }, [autoDismiss, revealed]);

  function handleClose() {
    setClosing(true);
    // Allow the slide-down animation to play before unmounting.
    setTimeout(() => onDismiss(), 250);
  }

  function handleUnwrap() {
    if (revealed) return;
    setRevealed(true);
  }

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else el.play().catch(() => {/* gesture required — ignore */});
  }

  /* ── countdown formatting ─────────────────────────────────────────── */
  const expiresMs = offer.expires_at ? new Date(offer.expires_at).getTime() : null;
  const remainMs = expiresMs ? Math.max(0, expiresMs - now) : null;
  const countdown = remainMs != null ? formatRemaining(remainMs) : null;

  /* ── discount label ───────────────────────────────────────────────── */
  const discount = (() => {
    if (!offer.discount_type || offer.discount_type === "none") return null;
    const v = offer.discount_value ?? 0;
    if (offer.discount_type === "percent") return `${v}% off`;
    if (offer.discount_type === "flat_cents") return `$${(v / 100).toFixed(0)} off`;
    if (offer.discount_type === "points_bonus") return `+${v} pts`;
    return null;
  })();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-label={offer.title}
    >
      {/* Scrim — fades in */}
      <div
        className={`absolute inset-0 bg-black/55 backdrop-blur-sm transition-opacity duration-200 ${closing ? "opacity-0" : "opacity-100"}`}
        onClick={handleClose}
      />

      {/* Card — slides up + bounces in */}
      <div
        className={`relative w-full max-w-sm rounded-3xl bg-white overflow-hidden shadow-2xl
          transition-all duration-300
          ${closing
            ? "translate-y-6 opacity-0 scale-95"
            : "translate-y-0 opacity-100 scale-100 animate-offer-pop"}`}
      >
        {/* Close (X) — subtle, top right */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-3 right-3 z-10 h-8 w-8 rounded-full bg-white/80 hover:bg-white backdrop-blur flex items-center justify-center text-zinc-500 shadow"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Branded header strip */}
        <div
          className="px-5 pt-5 pb-3 text-center"
          style={{
            background: `linear-gradient(135deg, ${primary}10 0%, ${sec}05 100%)`,
            backgroundImage: `repeating-linear-gradient(45deg, ${primary}0a 0 8px, transparent 8px 18px)`,
          }}
        >
          <div
            className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full text-white shadow"
            style={{ background: `linear-gradient(135deg, ${primary}, ${sec})` }}
          >
            <Sparkles className="h-3 w-3" /> A gift from {businessName}
          </div>
        </div>

        {/* Gift visual — wrapped (clickable) or unwrapped (image + content) */}
        <div className="px-5 pt-3 pb-2">
          {!revealed ? (
            <button
              type="button"
              onClick={handleUnwrap}
              className="block w-full group focus:outline-none"
              aria-label="Tap to unwrap your gift"
            >
              {/* Wrapped gift box — pure SVG so it works without any asset.
                  Brand colors drive the ribbon so each business looks
                  on-brand without uploading anything. */}
              <div
                className="relative mx-auto rounded-2xl overflow-hidden flex items-center justify-center group-active:scale-95 transition-transform"
                style={{
                  width: 220,
                  height: 220,
                  background: `radial-gradient(circle at 30% 30%, ${primary}15 0%, transparent 65%), linear-gradient(135deg, ${primary}10 0%, ${sec}06 100%)`,
                }}
              >
                <WrappedGiftSVG primary={primary} secondary={sec} />
                {/* Hint chip */}
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[11px] font-bold px-3 py-1.5 rounded-full bg-zinc-900 text-white shadow-lg animate-bounce">
                  Tap to unwrap ✨
                </span>
              </div>
            </button>
          ) : (
            <div className="animate-offer-reveal">
              {/* Image, falling back to the SVG gift when none is attached. */}
              <div
                className="relative mx-auto rounded-2xl overflow-hidden"
                style={{
                  width: "100%",
                  aspectRatio: "16 / 10",
                  background: `linear-gradient(135deg, ${primary}10 0%, ${sec}06 100%)`,
                }}
              >
                {offer.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={offer.image_url}
                    alt={offer.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Gift className="h-16 w-16" style={{ color: primary }} />
                  </div>
                )}
                {/* Confetti dots — pure CSS */}
                <span className="absolute -top-1 left-6 text-2xl animate-confetti-1">🎉</span>
                <span className="absolute -top-1 right-8 text-2xl animate-confetti-2">✨</span>
                <span className="absolute top-2 left-1/2 text-xl animate-confetti-3">💫</span>
              </div>
            </div>
          )}
        </div>

        {/* Headline + description */}
        <div className="px-5 pt-2 text-center">
          <h2 className="text-xl font-extrabold leading-tight text-zinc-900">
            {offer.title}
          </h2>
          {offer.description && (
            <p className="text-sm text-zinc-500 mt-1 leading-snug">
              {offer.description}
            </p>
          )}
        </div>

        {/* Discount chip — only renders post-unwrap */}
        {revealed && discount && (
          <div className="px-5 pt-4 flex justify-center">
            <div
              className="inline-flex items-center gap-1.5 text-base font-extrabold px-4 py-2 rounded-full text-white shadow-md"
              style={{
                background: `linear-gradient(135deg, ${primary}, ${sec})`,
                boxShadow: `0 8px 22px ${primary}55`,
              }}
            >
              <Gift className="h-4 w-4" />
              {discount}
            </div>
          </div>
        )}

        {/* Voice note pill — only renders post-unwrap */}
        {revealed && offer.voice_message_url && (
          <div className="px-5 pt-3 flex justify-center">
            <button
              type="button"
              onClick={togglePlay}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold border bg-white hover:bg-zinc-50 transition"
              style={{ color: primary, borderColor: `${primary}55` }}
            >
              {playing
                ? <Pause className="h-3.5 w-3.5 fill-current" />
                : <Play className="h-3.5 w-3.5 fill-current" />}
              {playing ? "Pause voice note" : "Play voice note from us"}
            </button>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              ref={audioRef}
              src={offer.voice_message_url}
              preload="none"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          </div>
        )}

        {/* Countdown */}
        {countdown && (
          <div className="px-5 pt-3 flex items-center justify-center gap-1.5 text-[11px] font-bold text-zinc-500">
            <Clock className="h-3 w-3" />
            Expires in {countdown}
          </div>
        )}

        {/* CTA + save reassurance */}
        <div className="px-5 pt-4 pb-5">
          <button
            type="button"
            onClick={handleClose}
            className="w-full rounded-2xl py-3 text-sm font-extrabold text-white transition active:scale-95 shadow-lg ring-1 ring-white/40"
            style={{
              background: `linear-gradient(135deg, ${primary}, ${sec})`,
              boxShadow: `0 10px 30px ${primary}55`,
            }}
          >
            {revealed ? "Save to my rewards" : "Open later — save it"}
          </button>
          <p className="text-center text-[10px] text-zinc-500 mt-2 inline-flex items-center gap-1 justify-center w-full">
            <Check className="h-2.5 w-2.5 text-emerald-500" />
            Added to your rewards automatically
          </p>
        </div>
      </div>

      {/* Keyframes — inline so the component is fully self-contained. */}
      <style jsx>{`
        @keyframes offer-pop {
          0%   { transform: translateY(40px) scale(0.92); opacity: 0; }
          60%  { transform: translateY(-6px) scale(1.02);  opacity: 1; }
          100% { transform: translateY(0)    scale(1);     opacity: 1; }
        }
        :global(.animate-offer-pop) { animation: offer-pop 380ms cubic-bezier(.18,.89,.32,1.28); }

        @keyframes offer-reveal {
          0%   { transform: scale(0.85) rotate(-2deg); opacity: 0; }
          70%  { transform: scale(1.03) rotate(1deg);  opacity: 1; }
          100% { transform: scale(1)    rotate(0);      opacity: 1; }
        }
        :global(.animate-offer-reveal) { animation: offer-reveal 520ms cubic-bezier(.2,.8,.3,1.2); }

        @keyframes confetti-1 { from { transform: translate(0,0) rotate(0); opacity: 0; } 30% { opacity: 1; } to { transform: translate(-22px,-30px) rotate(-30deg); opacity: 0; } }
        @keyframes confetti-2 { from { transform: translate(0,0) rotate(0); opacity: 0; } 30% { opacity: 1; } to { transform: translate(24px,-32px) rotate(35deg); opacity: 0; } }
        @keyframes confetti-3 { from { transform: translate(0,0) rotate(0); opacity: 0; } 40% { opacity: 1; } to { transform: translate(0,-40px) scale(1.3); opacity: 0; } }
        :global(.animate-confetti-1) { animation: confetti-1 1.2s ease-out 80ms forwards; }
        :global(.animate-confetti-2) { animation: confetti-2 1.2s ease-out 120ms forwards; }
        :global(.animate-confetti-3) { animation: confetti-3 1.4s ease-out 200ms forwards; }
      `}</style>
    </div>
  );
}

/* ─── helpers ─── */

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

/* ─── wrapped gift SVG (zero-asset, brand-driven) ─── */

function WrappedGiftSVG({ primary, secondary }: { primary: string; secondary: string }) {
  // A simple, friendly gift box with a big bow — colored from the business's
  // brand. Always looks on-brand even before any image is uploaded.
  return (
    <svg viewBox="0 0 200 200" width={170} height={170} aria-hidden="true">
      <defs>
        <linearGradient id="boxGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"  stopColor="#f4d4a8" />
          <stop offset="100%" stopColor="#e2b380" />
        </linearGradient>
        <linearGradient id="ribbonGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={primary} />
          <stop offset="100%" stopColor={secondary} />
        </linearGradient>
      </defs>
      {/* Box body */}
      <rect x="22" y="62" width="156" height="120" rx="10" fill="url(#boxGrad)" />
      {/* Vertical ribbon */}
      <rect x="86" y="62"  width="28" height="120" fill="url(#ribbonGrad)" />
      {/* Horizontal ribbon */}
      <rect x="22" y="106" width="156" height="22" fill="url(#ribbonGrad)" />
      {/* Bow loops */}
      <ellipse cx="78"  cy="58" rx="32" ry="22" fill="url(#ribbonGrad)" />
      <ellipse cx="122" cy="58" rx="32" ry="22" fill="url(#ribbonGrad)" />
      <ellipse cx="78"  cy="58" rx="10" ry="7"  fill="#ffffff" opacity="0.25" />
      <ellipse cx="122" cy="58" rx="10" ry="7"  fill="#ffffff" opacity="0.25" />
      {/* Bow knot */}
      <rect x="92" y="48" width="16" height="22" rx="4" fill="url(#ribbonGrad)" />
      {/* Highlight */}
      <rect x="34" y="74" width="40" height="6" rx="3" fill="#ffffff" opacity="0.35" />
    </svg>
  );
}
