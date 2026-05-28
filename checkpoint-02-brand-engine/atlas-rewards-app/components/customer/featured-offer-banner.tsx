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
import { Tag, Play, Pause } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
}: {
  primary: string;
  offer: FeaturedBannerOffer | null;
  offersEnabled: boolean;
  /** CP-24: needed for realtime subscription. Optional for back-compat. */
  businessId?: string;
}) {
  const [liveOffer, setLiveOffer] = useState<FeaturedBannerOffer | null>(offer);
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
    // Pull once on mount in case the server-side fetch missed a write that
    // committed between layout render and hydration.
    reload();
    const ch = supabase
      .channel(`offer-banner-${businessId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "offers", filter: `business_id=eq.${businessId}` },
        reload,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [businessId, offersEnabled]);

  if (!offersEnabled || !liveOffer) return null;

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
      className="sticky top-0 z-40 px-3 py-2.5 flex items-center justify-between text-white text-[12px] font-medium shadow-sm relative overflow-hidden"
      style={{
        background: primary,
        backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.10) 0 8px, rgba(255,255,255,0) 8px 18px)`,
      }}
      role="status"
      aria-label={`Featured offer: ${liveOffer.title}`}
    >
      <span className="truncate pr-2 flex items-center gap-1.5 relative">
        <Tag className="h-3 w-3 shrink-0 opacity-90 drop-shadow-sm" />
        <span className="drop-shadow-sm font-semibold truncate">{liveOffer.title}</span>
        {/* CP-29: voice note play button — only renders when one is attached. */}
        {liveOffer.voice_message_url && (
          <>
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
              className="ml-1 inline-flex items-center gap-1 h-5 pl-1 pr-2 rounded-full bg-white/25 hover:bg-white/35 transition shrink-0"
              aria-label={playing ? "Pause voice message" : "Play voice message"}
            >
              {playing
                ? <Pause className="h-2.5 w-2.5 fill-white" />
                : <Play className="h-2.5 w-2.5 fill-white" />}
              <span className="text-[10px] font-bold">Voice</span>
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
        <span className="shrink-0 bg-white text-zinc-900 rounded-full pl-2 pr-2.5 py-0.5 flex items-center gap-1.5 relative shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
          <span className="text-[11px] font-semibold">
            Expires in {daysLeft}d
          </span>
        </span>
      )}
    </div>
  );
}
