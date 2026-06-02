"use client";
/**
 * EnablePushNudge — CP-42 → CP-43.3
 *
 * The single, one-time onboarding moment for turning on notifications.
 * Darkens the whole screen, spotlights the notification bell (glow + shake)
 * and points an arrow at it: "Tap the bell to turn on notifications."
 *
 * CP-43.3 changes (Andrew's seamless-onboarding request):
 *   • Runs in BOTH the browser AND the installed PWA (was browser-only).
 *     The installed welcome modal that used to own this ask is retired, so
 *     the bell is the one consistent notification prompt everywhere.
 *   • Much heavier dim + a glowing, shaking spotlight on the bell.
 *   • Sets a shared "bell done" flag (atlas-onboard-bell-done:<businessId>)
 *     on every exit path so the welcome-gift reveal knows the bell moment
 *     is finished and can follow AFTER a short cooldown — the two never
 *     fight for the screen.
 *
 * Self-dismisses on: tap anywhere · 9s elapsed · permission already
 * decided · bell not on the page.
 */
import { useEffect, useState } from "react";
import { Bell, ArrowUpRight } from "lucide-react";

const SEEN_KEY_PREFIX = "atlas-push-nudge-seen";
const BELL_DONE_PREFIX = "atlas-onboard-bell-done";
const ARM_DELAY_MS = 1500;   // wait for boot splash + layout to settle
const AUTO_DISMISS_MS = 9000;
const RETRY_FIND_MS = 250;
const MAX_FIND_TRIES = 16;

/** Shared with OfferRevealWatcher so the welcome gift can wait for the bell. */
export function bellOnboardKey(businessId?: string | null) {
  return `${BELL_DONE_PREFIX}:${businessId ?? "global"}`;
}
export function markBellOnboardDone(businessId?: string | null) {
  try { window.localStorage.setItem(bellOnboardKey(businessId), "1"); } catch { /* ignore */ }
}
export function isBellOnboardDone(businessId?: string | null) {
  try { return window.localStorage.getItem(bellOnboardKey(businessId)) === "1"; }
  catch { return true; } // private mode → don't block the gift
}

type Anchor = { x: number; y: number; w: number; h: number };

export function EnablePushNudge({ primary, businessId }: { primary: string; businessId?: string | null }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const seenKey = `${SEEN_KEY_PREFIX}:${businessId ?? "global"}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    // No notification support, or the user already decided → the bell
    // moment is effectively "done"; let the welcome gift proceed.
    if (!("Notification" in window) || Notification.permission !== "default") {
      markBellOnboardDone(businessId);
      return;
    }
    // Already shown once for this business → done.
    try {
      if (window.localStorage.getItem(seenKey)) { markBellOnboardDone(businessId); return; }
    } catch { /* private mode */ }

    let cancelled = false;
    let tries = 0;

    const tryLocate = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>('[data-atlas-bell="1"]');
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
          setAnchor({ x: rect.left, y: rect.top, w: rect.width, h: rect.height });
          return;
        }
      }
      tries += 1;
      if (tries < MAX_FIND_TRIES) {
        window.setTimeout(tryLocate, RETRY_FIND_MS);
      } else {
        // Bell never appeared (e.g. customer not on Home) — don't block
        // the welcome gift forever.
        markBellOnboardDone(businessId);
      }
    };

    const armTimer = window.setTimeout(tryLocate, ARM_DELAY_MS);
    return () => { cancelled = true; window.clearTimeout(armTimer); };
  }, [seenKey, businessId]);

  // Re-measure on resize / scroll so the spotlight stays on the bell.
  useEffect(() => {
    if (!anchor) return;
    const recompute = () => {
      const el = document.querySelector<HTMLElement>('[data-atlas-bell="1"]');
      if (!el) return;
      const r = el.getBoundingClientRect();
      setAnchor({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    window.addEventListener("resize", recompute);
    window.addEventListener("scroll", recompute, true);
    return () => {
      window.removeEventListener("resize", recompute);
      window.removeEventListener("scroll", recompute, true);
    };
  }, [anchor]);

  // Auto-dismiss timer
  useEffect(() => {
    if (!anchor) return;
    const t = window.setTimeout(() => dismiss(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  function dismiss() {
    setAnchor(null);
    try { window.localStorage.setItem(seenKey, "1"); } catch { /* ignore */ }
    markBellOnboardDone(businessId);
  }

  if (!anchor) return null;

  const bellCenterX = anchor.x + anchor.w / 2;
  const bellCenterY = anchor.y + anchor.h / 2;

  const arrowSize = 56;
  const arrowTop = Math.max(8, bellCenterY + 10);
  const arrowLeft = Math.max(8, bellCenterX - arrowSize - 10);

  const cardWidth = 268;
  const vw = typeof window !== "undefined" ? window.innerWidth : 380;
  const cardLeft = Math.min(
    Math.max(8, bellCenterX - cardWidth + 30),
    vw - cardWidth - 8,
  );
  const cardTop = arrowTop + arrowSize + 8;

  // Spotlight radius around the bell.
  const spotR = Math.max(anchor.w, anchor.h) / 2 + 16;

  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-auto"
      onClick={dismiss}
      aria-label="Tap to dismiss"
    >
      {/* Heavy dim with a transparent hole punched over the bell, so
          everything EXCEPT the bell darkens. */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle ${spotR}px at ${bellCenterX}px ${bellCenterY}px, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.78) 78%, rgba(0,0,0,0.82) 100%)`,
        }}
      />

      {/* Glowing, shaking spotlight ring around the bell. */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: bellCenterY - spotR,
          left: bellCenterX - spotR,
          width: spotR * 2,
          height: spotR * 2,
          borderRadius: 9999,
          boxShadow: `0 0 0 3px #fff, 0 0 0 7px ${primary}, 0 0 28px 6px ${primary}, 0 0 60px 14px rgba(255,255,255,0.45)`,
          animation: "atlas-nudge-shake 0.9s ease-in-out infinite, atlas-nudge-glow 1.6s ease-in-out infinite",
          transformOrigin: "center center",
        }}
      />

      {/* Arrow — bobs up-right toward the bell */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: arrowTop,
          left: arrowLeft,
          animation: "atlas-nudge-bob 1.2s ease-in-out infinite",
        }}
      >
        <ArrowUpRight className="h-14 w-14 drop-shadow-lg" style={{ color: "white" }} strokeWidth={3} />
      </div>

      {/* Tooltip card */}
      <div
        className="absolute rounded-2xl shadow-2xl bg-white p-3 text-left"
        style={{
          top: cardTop,
          left: cardLeft,
          width: cardWidth,
          borderTop: `3px solid ${primary}`,
          animation: "atlas-nudge-pop 480ms ease-out",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            className="h-8 w-8 rounded-xl flex items-center justify-center text-white shrink-0"
            style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
          >
            <Bell className="h-4 w-4" />
          </div>
          <div className="text-sm font-extrabold text-zinc-900 leading-tight">
            Tap the bell to turn on notifications
          </div>
        </div>
        <p className="text-[12px] text-zinc-600 leading-snug">
          Get pinged when you earn points, a reward unlocks, or a new offer drops.
        </p>
        <div className="mt-2 text-[10px] uppercase tracking-widest font-bold text-zinc-400">
          Tap anywhere to dismiss
        </div>
      </div>

      <style>{`
        @keyframes atlas-nudge-pop {
          0%   { opacity: 0; transform: translateY(-6px) scale(0.94); }
          60%  { opacity: 1; transform: translateY(2px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes atlas-nudge-bob {
          0%, 100% { transform: translate(0, 0); }
          50%      { transform: translate(7px, -7px); }
        }
        @keyframes atlas-nudge-shake {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          20%  { transform: translate(-2px, 1px) rotate(-2deg); }
          40%  { transform: translate(2px, -1px) rotate(2deg); }
          60%  { transform: translate(-1px, 1px) rotate(-1.5deg); }
          80%  { transform: translate(1px, -1px) rotate(1.5deg); }
        }
        @keyframes atlas-nudge-glow {
          0%, 100% { filter: brightness(1); }
          50%      { filter: brightness(1.25); }
        }
      `}</style>
    </div>
  );
}
