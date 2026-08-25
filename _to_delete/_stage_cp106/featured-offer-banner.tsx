"use client";
/**
 * FeaturedOfferBanner — persistent sticky bar that surfaces the featured offer
 * across every customer tab (Home, Scan, Rewards, Profile — not just Home).
 *
 * CP-24: now reactive. Subscribes to realtime changes on the offers table so
 * that when the agency flips an offer to ⭐ Featured, the banner appears
 * across the customer app without the customer reloading the page.
 *
 * CP-29: when the offer carries a voice_message_url (e.g. it was published
 * by an Automated Offer template with the agency's voice note attached),
 * an inline play button appears next to the title. Tap to play — no autoplay.
 *
 * Renders nothing when:
 *   • the Offers widget is off for this business
 *   • there is no featured offer (and no realtime one has appeared)
 *   • the featured offer is expired
 *
 * Styling: primary-tinted background with a diagonal stripe pattern and a
 * high-contrast white pill on the right showing days-left + a live red dot.
 */
import { useEffect, useRef, useState } from "react";
import { Tag, Play, Pause, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { bannerStyle } from "@/lib/banner-styles";
// CP-85.1: a featured OPEN raffle takes over the banner (raffle > offer —
// it's the bigger hype moment and it has a hard deadline).
import { type FeaturedRaffle, formatCountdown } from "@/lib/raffles";

export type FeaturedBannerOffer = {
  title: string;
  expires_at: string | null;
  /** CP-29: optional voice note attached to this offer. */
  voice_message_url?: string | null;
};

export function FeaturedOfferBanner({
  primary,
  offer,
  offersEnabled,
  businessId,
  bannerStyleId,
  secondary,
  accent,
  slug,
}: {
  primary: string;
  offer: FeaturedBannerOffer | null;
  offersEnabled: boolean;
  /** CP-24: needed for realtime subscription. Optional for back-compat. */
  businessId?: string;
  /** CP-56: chosen banner style (stripes/gradient/christmas/…). */
  bannerStyleId?: string | null;
  secondary?: string | null;
  accent?: string | null;
  /** CP-85.1: URL slug — when a featured raffle owns the banner, tapping it
   *  jumps to /{slug}/app/rewards where the entry flow lives. */
  slug?: string;
}) {
  const [liveOffer, setLiveOffer] = useState<FeaturedBannerOffer | null>(offer);
  // CP-85.1: featured raffle (scheduled or open, not yet ended).
  const [liveRaffle, setLiveRaffle] = useState<FeaturedRaffle | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  // CP-29: tiny inline audio player for the optional voice note. We keep one
  // <audio> element per banner instance; play/pause toggles via state.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  // CP-24: keep server-rendered initial value, but refetch on realtime
  // changes so the banner updates the moment the agency creates / features
  // an offer.
  useEffect(() => {
    if (!offersEnabled || !businessId) return;
    const supabase = createClient();
    const reload = async () => {
      const { data } = await supabase.rpc("featured_offer", {
        p_business_id: businessId,
      });
      const row = (Array.isArray(data) ? data[0] : null) as FeaturedBannerOffer | null;
      setLiveOffer(row);
    };
    // CP-85.1: also watch the featured raffle — it outranks the offer.
    const reloadRaffle = async () => {
      const { data } = await supabase.rpc("featured_raffle", {
        p_business_id: businessId,
      });
      setLiveRaffle(((Array.isArray(data) ? data[0] : null) ?? null) as FeaturedRaffle | null);
    };
    // Pull once on mount in case the server-side fetch missed a write that
    // committed between layout render and hydration.
    reload();
    reloadRaffle();
    const ch = supabase
      .channel(`offer-banner-${businessId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "offers", filter: `business_id=eq.${businessId}` },
        reload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "raffles", filter: `business_id=eq.${businessId}` },
        reloadRaffle,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [businessId, offersEnabled]);

  // CP-85.1: countdown tick for the raffle pill (once a second keeps the
  // final hour dramatic; the banner is cheap to re-render).
  useEffect(() => {
    if (!liveRaffle) return;
    const t = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [liveRaffle]);

  if (!offersEnabled) return null;

  // ── CP-85.1: featured raffle owns the banner while it's live ──
  const raffleEndMs = liveRaffle ? new Date(liveRaffle.ends_at).getTime() : 0;
  const raffleOpen =
    liveRaffle != null &&
    raffleEndMs > nowTs &&
    new Date(liveRaffle.starts_at).getTime() <= nowTs;

  if (raffleOpen && liveRaffle) {
    const inner = (
      <div
        // CP-92: sticky offset = the iPhone notch/status-bar inset, so the
        // banner pins just below the clock instead of underneath it.
        className="sticky z-40 px-3 py-3 flex items-center justify-between text-white text-[13px] font-bold shadow-sm relative overflow-hidden"
        style={{ ...bannerStyle(bannerStyleId, primary, secondary, accent), top: "env(safe-area-inset-top, 0px)" }}
        role="status"
        aria-label={`Giveaway: ${liveRaffle.title}`}
      >
        <span className="truncate pr-2 flex items-center gap-1.5 relative">
          <Ticket className="h-3.5 w-3.5 shrink-0 opacity-95 drop-shadow-sm" />
          <span className="drop-shadow-sm font-black tracking-tight uppercase truncate">
            🎟️ WIN {liveRaffle.prize}
          </span>
        </span>
        <span className="shrink-0 bg-white rounded-full pl-2 pr-2.5 py-0.5 flex items-center gap-1.5 relative shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[11px] font-extrabold text-red-600">
            {formatCountdown(Math.max(0, raffleEndMs - nowTs))} · Enter →
          </span>
        </span>
      </div>
    );
    // Whole banner is a tap target → Rewards tab, where the entry flow lives.
    return slug ? <a href={`/${slug}/app/rewards`} className="block">{inner}</a> : inner;
  }

  if (!liveOffer) return null;

  const daysLeft = liveOffer.expires_at
    ? Math.max(
        0,
        Math.ceil((new Date(liveOffer.expires_at).getTime() - Date.now()) / 86_400_000),
      )
    : null;

  // Hide expired offers — the customer should never see a stale "0d" badge.
  if (daysLeft === 0 && liveOffer.expires_at) return null;

  return (
    <div
      // sticky top-0 keeps it pinned as the user scrolls within each tab;
      // z-40 sits above the page content but below the celebration toasts (z-50).
      // CP-28: distinctive diagonal stripe pattern so the featured offer
      // header reads as a *promo* band, not just a flat color bar.
      // CP-92: same safe-area sticky offset as the raffle variant above.
      className="sticky z-40 px-3 py-3 flex items-center justify-between text-white text-[13px] font-bold shadow-sm relative overflow-hidden"
      style={{ ...bannerStyle(bannerStyleId, primary, secondary, accent), top: "env(safe-area-inset-top, 0px)" }}
      role="status"
      aria-label={`Featured offer: ${liveOffer.title}`}
    >
      <span className="truncate pr-2 flex items-center gap-1.5 relative">
        <Tag className="h-3.5 w-3.5 shrink-0 opacity-95 drop-shadow-sm" />
        <span className="drop-shadow-sm font-black tracking-tight uppercase truncate">{liveOffer.title}</span>
        {/* CP-29: voice note play button — only renders when one is attached. */}
        {liveOffer.voice_message_url && (
          <>
            {/* CP-42: way poppier — white pill, brand-tinted ring, soft glow,
                pulsing dot, and a subtle bounce when idle so the eye snaps
                to it against the dark banner background. */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const el = audioRef.current;
                if (!el) return;
                if (playing) { el.pause(); }
                else { el.play().catch(() => {/* user gesture missing — ignore */}); }
              }}
              className="atlas-voice-btn ml-2 inline-flex items-center gap-1.5 h-7 pl-1.5 pr-2.5 rounded-full bg-white text-zinc-900 shrink-0 transition active:scale-95"
              style={{
                boxShadow: "0 0 0 2px rgba(255,255,255,0.9), 0 0 0 4px rgba(255,255,255,0.35), 0 6px 18px rgba(0,0,0,0.25)",
                animation: playing ? undefined : "atlas-voice-bounce 1.8s ease-in-out infinite",
              }}
              aria-label={playing ? "Pause voice message" : "Play voice message"}
            >
              <span
                className="inline-flex items-center justify-center h-5 w-5 rounded-full text-white"
                style={{
                  background: "linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)",
                  boxShadow: playing
                    ? "0 0 0 2px rgba(244,63,94,0.4), 0 0 12px rgba(244,63,94,0.6)"
                    : "0 0 8px rgba(244,63,94,0.5)",
                }}
              >
                {playing
                  ? <Pause className="h-2.5 w-2.5 fill-white" />
                  : <Play className="h-2.5 w-2.5 fill-white ml-[1px]" />}
              </span>
              <span className="text-[11px] font-extrabold tracking-wide">
                {playing ? "Playing" : "Voice"}
              </span>
              {playing && (
                <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
              )}
            </button>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio
              ref={audioRef}
              src={liveOffer.voice_message_url}
              preload="none"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          </>
        )}
      </span>
      {daysLeft !== null && (
        <span className="shrink-0 bg-white rounded-full pl-2 pr-2.5 py-0.5 flex items-center gap-1.5 relative shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[11px] font-extrabold text-red-600">
            Expires in {daysLeft}d
          </span>
        </span>
      )}
    </div>
  );
}
