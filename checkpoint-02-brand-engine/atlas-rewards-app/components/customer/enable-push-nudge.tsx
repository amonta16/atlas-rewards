"use client";
/**
 * EnablePushNudge — CP-42
 *
 * Fires once per user on first visit AFTER the boot splash fades.
 * Locates the notification bell on the customer home page by its
 * `data-atlas-bell` attribute, then renders an arrow + tooltip
 * pointed directly at it.
 *
 * Self-dismisses on:
 *   • Tap anywhere
 *   • 9 seconds elapsed
 *   • The user already has permission "granted" or "denied"
 *   • The bell isn't on the page (e.g. we're not on Home)
 *
 * Persistence (CP-43): the "seen" flag is now keyed PER BUSINESS
 * (`atlas-push-nudge-seen:<businessId>`). It used to be a single global
 * key, so the very first business a customer opened got the arrow and
 * every other business they later opened never did — which is exactly
 * the "some businesses show the arrow, some don't" inconsistency Andrew
 * flagged. Per-business keying matches PwaWelcomeOverlay and makes the
 * onboarding identical across every sub-account.
 *
 * CP-43 also skips this nudge when running as an installed PWA
 * (standalone): there, PwaWelcomeOverlay owns the notification ask, so
 * the two flows no longer race. Browser tab → arrow; installed app →
 * welcome cutscene. Deterministic everywhere.
 */
import { useEffect, useState } from "react";
import { Bell, ArrowUpRight } from "lucide-react";

const SEEN_KEY_PREFIX = "atlas-push-nudge-seen";
const ARM_DELAY_MS = 1800;   // wait for boot splash + layout to settle
const AUTO_DISMISS_MS = 9000;
const RETRY_FIND_MS = 250;
const MAX_FIND_TRIES = 12;

type Anchor = { x: number; y: number; w: number; h: number };

export function EnablePushNudge({ primary, businessId }: { primary: string; businessId?: string | null }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const seenKey = `${SEEN_KEY_PREFIX}:${businessId ?? "global"}`;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    // Installed PWA → PwaWelcomeOverlay handles the ask; don't double up.
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone) return;
    try { if (window.localStorage.getItem(seenKey)) return; } catch { /* private mode */ }

    let cancelled = false;
    let tries = 0;

    const tryLocate = () => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>('[data-atlas-bell="1"]');
      if (el) {
        const rect = el.getBoundingClientRect();
        // Only show if the bell is actually visible in the viewport
        if (rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight) {
          setAnchor({ x: rect.left, y: rect.top, w: rect.width, h: rect.height });
          return;
        }
      }
      tries += 1;
      if (tries < MAX_FIND_TRIES) {
        window.setTimeout(tryLocate, RETRY_FIND_MS);
      }
    };

    const armTimer = window.setTimeout(tryLocate, ARM_DELAY_MS);
    return () => { cancelled = true; window.clearTimeout(armTimer); };
  }, [seenKey]);

  // Re-measure on resize / orientation change so the arrow stays
  // pointed correctly if the user rotates their phone while the
  // nudge is still up.
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
  }, [anchor]);

  function dismiss() {
    setAnchor(null);
    try { window.localStorage.setItem(seenKey, "1"); } catch { /* ignore */ }
  }

  if (!anchor) return null;

  // Arrow tip points at the CENTER of the bell. Position the arrow's
  // tail off-screen-bottom-left of the bell so the arrow visually
  // shoots up-and-right toward it.
  const bellCenterX = anchor.x + anchor.w / 2;
  const bellCenterY = anchor.y + anchor.h / 2;

  // Arrow icon is 56x56. Place its bottom-left so its top-right corner
  // (which is where the lucide ArrowUpRight tip lives) lands ~6px
  // below-left of the bell center.
  const arrowSize = 56;
  const arrowTop = Math.max(8, bellCenterY + 8);
  const arrowLeft = Math.max(8, bellCenterX - arrowSize - 8);

  // Tooltip card sits below the arrow, centered horizontally near the
  // bell but kept inside the viewport.
  const cardWidth = 264;
  const vw = typeof window !== "undefined" ? window.innerWidth : 380;
  const cardLeft = Math.min(
    Math.max(8, bellCenterX - cardWidth + 30),
    vw - cardWidth - 8,
  );
  const cardTop = arrowTop + arrowSize + 6;

  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-auto"
      onClick={dismiss}
      aria-label="Tap to dismiss"
    >
      {/* Soft dim */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Highlight ring around the bell so the eye snaps to it */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: anchor.y - 6,
          left: anchor.x - 6,
          width: anchor.w + 12,
          height: anchor.h + 12,
          borderRadius: 9999,
          boxShadow: `0 0 0 4px ${primary}, 0 0 0 8px rgba(255,255,255,0.35)`,
          animation: "atlas-nudge-ring 1.4s ease-in-out infinite",
        }}
      />

      {/* Arrow — bobs up-right toward the bell */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: arrowTop,
          left: arrowLeft,
          animation: "atlas-nudge-bob 1.4s ease-in-out infinite",
        }}
      >
        <ArrowUpRight
          className="h-14 w-14 drop-shadow-lg"
          style={{ color: "white" }}
          strokeWidth={3}
        />
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
            Tap the bell to tu