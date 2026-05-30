"use client";
/**
 * EnablePushNudge — CP-42
 *
 * Fires once per user on first visit AFTER the boot splash fades.
 * Shows an animated arrow + tooltip pointing up-and-right at the
 * notification bell in the header, with copy nudging the customer
 * to tap it and enable push.
 *
 * Self-dismisses on:
 *   • Tap anywhere
 *   • 8 seconds elapsed
 *   • The user already has permission "granted" or "denied"
 *
 * Hides if Notification API isn't supported (e.g. iOS Safari outside
 * a PWA install, some embedded browsers).
 *
 * Persistence: `localStorage["atlas-push-nudge-seen"] = "1"` — so the
 * nudge never re-shows once dismissed (or once permission is set).
 */
import { useEffect, useState } from "react";
import { Bell, ArrowUpRight } from "lucide-react";

const SEEN_KEY = "atlas-push-nudge-seen";
const ARM_DELAY_MS = 1500;   // wait for boot splash to finish
const AUTO_DISMISS_MS = 9000;

export function EnablePushNudge({ primary }: { primary: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    // Already decided → don't nag
    if (Notification.permission !== "default") return;
    // Already shown this user
    try {
      if (window.localStorage.getItem(SEEN_KEY)) return;
    } catch { /* private mode: still show, just no persistence */ }

    const t1 = window.setTimeout(() => setVisible(true), ARM_DELAY_MS);
    return () => window.clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => dismiss(), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [visible]);

  function dismiss() {
    setVisible(false);
    try { window.localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-auto"
      onClick={dismiss}
    >
      {/* Soft dim — light enough that the bell is still recognizable */}
      <div className="absolute inset-0 bg-black/35" />

      {/* Arrow + tooltip — anchored top-right to point at the bell */}
      <div
        className="absolute"
        style={{ top: 8, right: 8, animation: "atlas-nudge-pop 480ms ease-out" }}
      >
        {/* Animated arrow up-right, bobs toward the bell */}
        <div
          className="flex items-start justify-end gap-0"
          style={{ animation: "atlas-nudge-bob 1.4s ease-in-out infinite" }}
        >
          <ArrowUpRight
            className="h-12 w-12 -rotate-12 drop-shadow-lg"
            style={{ color: "white" }}
            strokeWidth={3}
          />
        </div>

        {/* Tooltip card sits below the arrow */}
        <div
          className="mt-1 ml-auto max-w-[260px] rounded-2xl shadow-2xl bg-white p-3 text-left"
          style={{ borderTop: `3px solid ${primary}` }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div
              className="h-8 w-8 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
            >
              <Bell className="h-4 w-4" />
            </div>
            <div className="text-sm font-extrabold text-zinc-900 leading-tight">
              Turn on notifications
            </div>
          </div>
          <p className="text-[12px] text-zinc-600 leading-snug">
            Tap the bell up there to get pinged when you earn points, a reward unlocks, or a new offer drops.
          </p>
          <div className="mt-2 text-[10px] uppercase tracking-widest font-bold text-zinc-400">
            Tap anywhere to dismiss
          </div>
        </div>
      </div>

      <style>{`
        @keyframes atlas-nudge-pop {
          0%   { opacity: 0; transform: translateY(-8px) scale(0.9); }
          60%  { opacity: 1; transform: translateY(2px) scale(1.02); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes atlas-nudge-bob {
          0%, 100% { transform: translate(0, 0); }
          50%      { transform: translate(6px, -6px); }
        }
      `}</style>
    </div>
  );
}
