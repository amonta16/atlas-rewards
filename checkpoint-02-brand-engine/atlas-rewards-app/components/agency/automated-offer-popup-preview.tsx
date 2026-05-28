"use client";
/**
 * AutomatedOfferPopupPreview — CP-29.1
 *
 * Shows the agency what the customer-side offer popup will look like, in a
 * mini phone frame. Auto-loops: every ~7 seconds the popup re-appears in
 * its wrapped state, after ~2.5s it transitions to the revealed state,
 * then ~4s later it dismisses and restarts.
 *
 * Reads from the in-progress offer being edited so changes to image / title /
 * description / discount / voice all reflect in the preview live.
 */

import { useEffect, useState } from "react";
import { OfferRevealPopup, type RevealOffer } from "@/components/customer/offer-reveal-popup";
import type { Business } from "@/lib/types/database";

type DraftOffer = {
  template_id: string;
  name: string;
  emoji: string | null;
  custom_title: string | null;
  custom_description: string | null;
  custom_image_url: string | null;
  default_image_url?: string | null;
  slug: string;
  discount_type: "none" | "percent" | "flat_cents" | "points_bonus" | null;
  discount_value: number | null;
  voice_message_url: string | null;
};

export function AutomatedOfferPopupPreview({
  business,
  draft,
}: {
  business: Business;
  draft: DraftOffer;
}) {
  // Resolve an image the same way the list view does, so the preview never
  // shows a different art than the agency expects.
  const imageUrl =
    draft.custom_image_url ??
    draft.default_image_url ??
    `/automated-offers/${draft.slug.replace(/_/g, "-")}.png`;

  // Smart default headlines per occasion — the agency rarely customizes
  // these and "🎁 Birthday Special" feels colder than "NAME, happy birthday!"
  const defaultTitle = friendlyDefaultTitle(draft);
  const defaultDescription = friendlyDefaultDescription(draft);

  const previewOffer: RevealOffer = {
    id: `preview-${draft.template_id}`,
    title: draft.custom_title?.trim() || defaultTitle,
    description: draft.custom_description?.trim() || defaultDescription,
    // The popup component falls back to its own SVG when no image — that's
    // fine for an empty state, but here we always pass through whatever the
    // resolution gave us.
    image_url: imageUrl,
    voice_message_url: draft.voice_message_url,
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    discount_type: draft.discount_type,
    discount_value: draft.discount_value,
  };

  /* ───────────── auto-looping demo cycle ───────────── */
  // Cycle states: "wrapped" → "revealed" → "dismissed" → restart.
  // Times mirror what the live customer experience feels like.
  type Phase = "wrapped" | "revealed" | "dismissed";
  const [phase, setPhase] = useState<Phase>("wrapped");
  const [tick, setTick] = useState(0); // re-key the popup to force remount

  useEffect(() => {
    if (phase === "wrapped") {
      const t = setTimeout(() => setPhase("revealed"), 2500);
      return () => clearTimeout(t);
    }
    if (phase === "revealed") {
      const t = setTimeout(() => setPhase("dismissed"), 4000);
      return () => clearTimeout(t);
    }
    // dismissed: short pause before restart
    const t = setTimeout(() => {
      setPhase("wrapped");
      setTick((n) => n + 1);
    }, 1200);
    return () => clearTimeout(t);
  }, [phase]);

  return (
    <div className="relative mx-auto" style={{ width: 280 }}>
      <p className="text-center text-xs text-zinc-400 mb-2">Customer popup preview</p>

      {/* Phone frame */}
      <div
        className="relative rounded-[36px] bg-zinc-900 p-2 shadow-2xl"
        style={{ aspectRatio: "9 / 18.5" }}
      >
        {/* notch */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 h-5 w-24 bg-zinc-900 rounded-b-2xl z-10" />
        {/* screen */}
        <div
          className="relative w-full h-full rounded-[28px] overflow-hidden bg-zinc-100"
        >
          {/* Faint app shell so the popup doesn't look like it's on a blank canvas */}
          <div className="absolute inset-0 flex flex-col">
            {/* top bar (banner) */}
            <div
              className="h-7 flex items-center justify-center text-[9px] font-bold text-white px-3"
              style={{
                background: business.brand_colors.primary,
                backgroundImage: `repeating-linear-gradient(45deg, rgba(255,255,255,0.10) 0 6px, transparent 6px 14px)`,
              }}
            >
              Featured offer banner
            </div>
            {/* faux content blocks */}
            <div className="flex-1 px-3 py-3 space-y-2">
              <div className="h-3 w-2/3 bg-zinc-300 rounded" />
              <div className="h-3 w-1/2 bg-zinc-200 rounded" />
              <div className="h-20 w-full bg-zinc-200 rounded-lg" />
              <div className="h-3 w-1/3 bg-zinc-200 rounded" />
              <div className="h-12 w-full bg-zinc-200 rounded-lg" />
            </div>
            {/* bottom tab bar */}
            <div className="h-10 bg-white border-t border-zinc-200" />
          </div>

          {/* Popup overlay — uses the real <OfferRevealPopup/> but
              constrained inside the phone screen via a contained portal-
              alike trick: we render it inside an absolute-fill wrapper
              and override its `fixed inset-0` z-60 by clipping the parent
              with overflow-hidden + relative. */}
          {phase !== "dismissed" && (
            <div className="absolute inset-0 z-20" key={`${tick}-${phase}`}>
              <PopupHost>
                <OfferRevealPopup
                  key={`${tick}-${phase}`}
                  offer={previewOffer}
                  primary={business.brand_colors.primary}
                  secondary={business.brand_colors.secondary}
                  businessName={business.name}
                  onDismiss={() => {/* preview controls its own lifecycle */}}
                  startRevealed={phase === "revealed"}
                  autoDismiss={false}
                />
              </PopupHost>
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-[10px] text-zinc-400 mt-2 leading-tight">
        Auto-loops every 8s · matches the real customer experience
      </p>
    </div>
  );
}

/**
 * PopupHost — neutralizes the popup's `fixed inset-0` positioning so the
 * preview can render the real popup component inside a phone frame. Done
 * via CSS only (the popup itself has no idea it's being previewed).
 */
function PopupHost({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 [&_.fixed]:!absolute [&_.fixed]:!inset-0 [&_.z-\[60\]]:!z-20">
      {/* The selectors above promote any `fixed` child (the popup) to
          `absolute` so it stays inside the phone screen rather than
          escaping to the viewport, and tame the z-60 layer so it doesn't
          fight neighboring previews. */}
      {children}
    </div>
  );
}

/* ─── friendly default copy per template ─── */

function friendlyDefaultTitle(draft: DraftOffer): string {
  switch (draft.slug) {
    case "birthday":      return "NAME, happy birthday!";
    case "anniversary":   return "Cheers to {N} years, NAME!";
    case "welcome":       return "Welcome in, NAME!";
    case "comeback":      return "We miss you, NAME";
    case "valentines":    return "Happy Valentine's, NAME 💗";
    case "halloween":     return "Boo! A treat for you, NAME 🎃";
    case "new_years":     return "Happy New Year, NAME 🎉";
    case "easter":        return "Hop in for a treat, NAME 🐣";
    case "black_friday":  return "Black Friday is here, NAME 🛍️";
    case "christmas":     return "Merry Christmas, NAME 🎄";
    case "st_patricks":   return "Luck of the Irish, NAME 🍀";
    case "summer_kickoff":return "Summer's here, NAME ☀️";
    default:              return `${draft.emoji ? draft.emoji + " " : ""}${draft.name}`;
  }
}

function friendlyDefaultDescription(draft: DraftOffer): string {
  switch (draft.slug) {
    case "birthday":      return "We got you a little gift!";
    case "anniversary":   return "Thanks for sticking with us — here's a gift.";
    case "welcome":       return "We're so glad you joined. Here's something on us.";
    case "comeback":      return "It's been a minute. Here's a gift to lure you back.";
    case "valentines":    return "A little something from us with love.";
    case "halloween":     return "No tricks, just treats.";
    case "new_years":     return "New year, new perks — enjoy.";
    case "easter":        return "Easter surprise just for you.";
    case "black_friday":  return "Our biggest deal of the year.";
    case "christmas":     return "A holiday gift from us to you.";
    case "st_patricks":   return "A little extra luck for you today.";
    case "summer_kickoff":return "Summer's just better with this.";
    default:              return "We got you a little gift!";
  }
}
