"use client";
/**
 * PwaWelcomeOverlay — CP-37.18
 *
 * One-time onboarding screen that fires on first launch from a home-
 * screen install. Cinematic intro: business logo, brand-colored hero,
 * an "Enable notifications" CTA, and a quiet "Maybe later" escape.
 *
 * Why: Andrew's request — when a customer adds the app to their home
 * screen and opens it as a PWA, the notification-permission prompt
 * should feel like part of an opinionated onboarding sequence, not a
 * surprise system dialog buried somewhere later in the flow.
 *
 * Trigger logic:
 *   • Standalone display mode  (window.matchMedia('(display-mode: standalone)'))
 *     OR navigator.standalone (iOS PWA) — only then do we show this.
 *   • localStorage flag prevents re-firing once the user has decided.
 *
 * The CTA calls ensurePushSubscription(businessId) — same code path
 * the Rewards tab uses, so a granted permission immediately registers
 * a push subscription against this business.
 */
import { useEffect, useState } from "react";
import { Bell, Sparkles, Check } from "lucide-react";
import { ensurePushSubscription } from "@/lib/notifications/push-client";
import { isNative } from "@/lib/native";

const STORAGE_KEY_PREFIX = "atlas-pwa-onboarded";

type Phase = "idle" | "asking" | "granted" | "denied";

export function PwaWelcomeOverlay({
  businessId,
  businessName,
  logoUrl,
  primary,
  secondary,
}: {
  businessId: string;
  businessName: string;
  logoUrl: string | null;
  primary: string;
  secondary: string;
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    // CP-80: the native app has its own push onboarding (native-shell.tsx)
    // — this overlay is web-PWA only.
    if (isNative()) return;
    // Already decided? Don't re-prompt.
    try {
      const flag = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}:${businessId}`);
      if (flag) return;
    } catch { /* private mode — ignore */ }

    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (!isStandalone) return;

    // Don't pop on top of a Notification dialog that's already granted.
    if (typeof Notification !== "undefined" && Notification.permission !== "default") {
      // User has already explicitly granted/denied — record + skip the overlay.
      try {
        window.localStorage.setItem(
          `${STORAGE_KEY_PREFIX}:${businessId}`,
          Notification.permission,
        );
      } catch { /* ignore */ }
      return;
    }

    // Small delay so the home screen has a moment to render before the
    // overlay flashes — feels like an intentional welcome, not a takeover.
    const t = setTimeout(() => setOpen(true), 350);
    return () => clearTimeout(t);
  }, [businessId]);

  async function grant() {
    setPhase("asking");
    try {
      await ensurePushSubscription(businessId);
      // Permission state is whatever Notification.permission ended up as.
      const granted = typeof Notification !== "undefined" && Notification.permission === "granted";
      setPhase(granted ? "granted" : "denied");
      try {
        window.localStorage.setItem(
          `${STORAGE_KEY_PREFIX}:${businessId}`,
          granted ? "granted" : "denied",
        );
      } catch { /* ignore */ }
      // Auto-close after a beat once granted.
      if (granted) setTimeout(() => setOpen(false), 1200);
    } catch {
      setPhase("denied");
    }
  }

  function skip() {
    try {
      window.localStorage.setItem(`${STORAGE_KEY_PREFIX}:${businessId}`, "skipped");
    } catch { /* ignore */ }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm">
      <div
        className="relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
        style={{
          background: `linear-gradient(160deg, ${primary} 0%, ${secondary} 100%)`,
        }}
      >
        {/* Decorative sparkle blobs */}
        <Sparkles className="absolute -top-3 -right-3 h-24 w-24 text-white opacity-10" />
        <Sparkles className="absolute -bottom-6 -left-6 h-20 w-20 text-white opacity-10" />

        <div className="relative px-6 pt-8 pb-6 text-white text-center">
          {/* Brand-color halo behind the logo */}
          <div className="mx-auto h-24 w-24 rounded-3xl bg-white ring-4 ring-white/40 shadow-xl flex items-center justify-center overflow-hidden">
            {logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={logoUrl} alt={businessName} className="h-full w-full object-contain p-3" />
            ) : (
              <Sparkles className="h-10 w-10" style={{ color: primary }} />
            )}
          </div>

          <div className="text-[10px] uppercase tracking-[0.3em] font-extrabold opacity-90 mt-5">
            Welcome to
          </div>
          <h1 className="text-2xl font-extrabold leading-tight mt-1">{businessName}</h1>
          <p className="text-sm opacity-90 mt-3 leading-snug">
            One last thing — turn on notifications so we can ping you when a reward unlocks, a streak's about to break, or a surprise drop lands. We promise not to spam.
          </p>

          {phase === "granted" ? (
            <div className="mt-6 rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur-sm py-3 flex items-center justify-center gap-2 text-sm font-bold">
              <Check className="h-4 w-4" /> Notifications on — you're all set.
            </div>
          ) : phase === "denied" ? (
            <div className="mt-6 space-y-2.5">
              <div className="rounded-2xl bg-white/15 ring-1 ring-white/30 backdrop-blur-sm py-3 px-3 text-xs">
                Your browser blocked the prompt. You can enable notifications later from your phone Settings → this app.
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-full h-12 rounded-2xl bg-white text-zinc-900 font-extrabold"
              >
                Continue to the app
              </button>
            </div>
          ) : (
            <div className="mt-6 space-y-2.5">
              <button
                onClick={grant}
                disabled={phase === "asking"}
                className="w-full h-12 rounded-2xl bg-white text-zinc-900 font-extrabold flex items-center justify-center gap-2 disabled:opacity-70"
              >
                <Bell className="h-4 w-4" />
                {phase === "asking" ? "Asking your phone…" : "Turn on notifications"}
              </button>
              <button
                onClick={skip}
                className="w-full text-xs font-bold text-white/85 hover:text-white py-2"
              >
                Maybe later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
