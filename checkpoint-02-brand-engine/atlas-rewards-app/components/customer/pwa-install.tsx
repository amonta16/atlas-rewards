"use client";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { isNative } from "@/lib/native";

/**
 * PWAInstall — CP-99: now the "Get the app" banner.
 *
 * With AE Rewards live in the App Store, iPhone visitors get a real
 * App Store link instead of the old Add-to-Home-Screen instructions.
 * Android keeps the Chrome PWA install prompt until the Play listing is
 * public — then pasting the Play URL into ANDROID_APP_URL below flips
 * Android to a store banner too (one-line change, no other edits).
 *
 * Never shows inside the native app (isNative) or an installed PWA, and
 * a dismissal is remembered for DISMISS_DAYS so it doesn't nag — the
 * banner exists to convert, not to annoy. Membership follows the
 * ACCOUNT, so someone who joined via the web QR just signs in after
 * installing — no re-scan needed.
 */

const IOS_APP_URL = "https://apps.apple.com/us/app/ae-rewards/id6797182694";
/** Paste the public Google Play URL here the moment production is approved. */
const ANDROID_APP_URL: string | null = null;

const DISMISS_KEY = "atlas-getapp-dismissed-at";
const DISMISS_DAYS = 7;

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function PWAInstall({ primary, businessName }: { primary: string; businessName: string }) {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [mode, setMode] = useState<"none" | "bip" | "ios-store" | "android-store">("none");

  useEffect(() => {
    // CP-80: inside the installed Android/iOS app there is nothing to
    // install — never show any prompt there.
    if (isNative()) return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // Recently dismissed → stay quiet (converts better than nagging).
    try {
      const at = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
      if (at && Date.now() - at < DISMISS_DAYS * 86_400_000) return;
    } catch { /* private mode — just show */ }

    const ua = window.navigator.userAgent;
    const standalone =
      ("standalone" in window.navigator && (window.navigator as unknown as { standalone?: boolean }).standalone) ||
      window.matchMedia?.("(display-mode: standalone)").matches;
    if (standalone) return; // already installed as a PWA

    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/.test(ua);

    if (isIos) {
      // Real App Store app beats Add-to-Home-Screen instructions.
      const t = setTimeout(() => setMode("ios-store"), 5000);
      return () => clearTimeout(t);
    }

    if (isAndroid && ANDROID_APP_URL) {
      const t = setTimeout(() => setMode("android-store"), 5000);
      return () => clearTimeout(t);
    }

    // Android pre-Play-launch (and desktop Chrome): the classic PWA prompt.
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setTimeout(() => setMode("bip"), 5000);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (mode === "none") return null;

  const storeUrl = mode === "ios-store" ? IOS_APP_URL : mode === "android-store" ? ANDROID_APP_URL : null;

  function dismiss() {
    setMode("none");
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
  }

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setMode("none");
  }

  // CP-115 (Andrew): bigger, more noticeable prompt. A full-width card that
  // sits just above the bottom nav with a brand-gradient header, a large
  // store button, and a soft pop-in — hard to miss, still one-tap dismissible.
  return (
    <div className="fixed inset-x-3 bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] z-40 max-w-md mx-auto rounded-3xl shadow-2xl border overflow-hidden bg-white"
      style={{ animation: "atlas-getapp-pop 420ms cubic-bezier(0.22,1,0.36,1)" }}>
      {/* brand header strip */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3 text-white"
        style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}>
        <div className="h-12 w-12 rounded-2xl bg-white/20 ring-1 ring-white/30 flex items-center justify-center shrink-0">
          <Download className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-[15px] leading-tight">
            {storeUrl ? `Get the ${businessName} app` : `Add ${businessName} to your home screen`}
          </div>
          <p className="text-[12px] text-white/85 mt-0.5 leading-snug">
            {storeUrl
              ? "Free — your points, streak and rewards come with you."
              : "Install for one-tap rewards access."}
          </p>
        </div>
        <button onClick={dismiss} aria-label="Dismiss"
          className="text-white/80 hover:text-white shrink-0 -mt-1 -mr-1 p-1">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* big action */}
      <div className="p-3">
        {storeUrl ? (
          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={dismiss}
            className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 text-white text-[15px] font-extrabold shadow-lg active:scale-[0.99] transition"
            style={{ background: primary, boxShadow: `0 10px 24px -10px ${primary}` }}
          >
            <Download className="h-5 w-5" />
            {mode === "ios-store" ? "Download on the App Store" : "Get it on Google Play"}
          </a>
        ) : (
          <button onClick={install}
            className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 text-white text-[15px] font-extrabold shadow-lg active:scale-[0.99] transition"
            style={{ background: primary, boxShadow: `0 10px 24px -10px ${primary}` }}>
            <Download className="h-5 w-5" /> Install app
          </button>
        )}
        <button onClick={dismiss}
          className="w-full mt-2 text-[12px] font-semibold text-zinc-400 hover:text-zinc-600 py-1">
          Maybe later
        </button>
      </div>

      <style>{`
        @keyframes atlas-getapp-pop {
          0%   { opacity: 0; transform: translateY(14px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
