"use client";
/**
 * PWABootSplash — CP-42
 *
 * Shows a centered business logo on a WHITE background, then fades
 * seamlessly into the app UI behind it. Plays ONCE per cold-boot of
 * the PWA, not on every nav.
 *
 * Detection rules (fire splash only when ALL true):
 *   • Window is loaded (DOMContentLoaded)
 *   • We haven't shown the splash this session (sessionStorage flag)
 *   • Either the PWA is running standalone, OR the URL is a fresh
 *     deep-link (we still show it on first browser visit — it makes
 *     the app feel intentional even outside the home-screen).
 *
 * After ~900ms, fade out over 350ms. Total perceived: ~1.25s.
 */
import { useEffect, useState } from "react";

const SHOWN_FLAG = "atlas-boot-splash-shown";
const DISPLAY_MS = 900;
const FADE_MS = 350;

export function PWABootSplash({
  primary,
  name,
  logoUrl,
}: {
  primary: string;
  name: string;
  logoUrl?: string | null;
}) {
  // Two phases: mounted-visible, then mounted-fading. Unmount after fade.
  const [phase, setPhase] = useState<"hidden" | "visible" | "fading" | "gone">("hidden");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(SHOWN_FLAG)) return; // already shown this session
      window.sessionStorage.setItem(SHOWN_FLAG, "1");
    } catch { /* private mode: still show, just no flag */ }

    setPhase("visible");
    const t1 = window.setTimeout(() => setPhase("fading"), DISPLAY_MS);
    const t2 = window.setTimeout(() => setPhase("gone"), DISPLAY_MS + FADE_MS);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);

  if (phase === "hidden" || phase === "gone") return null;

  // Initials fallback when no logo image is set.
  const initials = (name || "")
    .split(" ").map(s => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "•";

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-white pointer-events-none"
      style={{
        transition: `opacity ${FADE_MS}ms ease-out`,
        opacity: phase === "fading" ? 0 : 1,
      }}
    >
      <div className="flex flex-col items-center gap-5">
        {/* Logo — drops in with a tiny scale + fade so the moment feels alive */}
        <div
          className="flex items-center justify-center"
          style={{
            animation: "atlas-boot-pop 700ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt=""
              className="h-24 w-24 object-contain"
              style={{ maxWidth: 160, maxHeight: 120 }}
            />
          ) : (
            <div
              className="h-24 w-24 rounded-3xl flex items-center justify-center text-white font-extrabold text-3xl shadow-2xl"
              style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
            >
              {initials}
            </div>
          )}
        </div>
        {/* Soft brand-tinted bar pulse */}
        <div className="h-1 w-24 rounded-full overflow-hidden bg-zinc-100">
          <div
            className="h-full rounded-full"
            style={{
              width: "40%",
              background: primary,
              animation: "atlas-boot-shimmer 1.2s ease-in-out infinite",
            }}
          />
        </div>
      </div>
      <style>{`
        @keyframes atlas-boot-pop {
          0%   { opacity: 0; transform: scale(0.85); }
          60%  { opacity: 1; transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes atlas-boot-shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(260%); }
        }
      `}</style>
    </div>
  );
}
