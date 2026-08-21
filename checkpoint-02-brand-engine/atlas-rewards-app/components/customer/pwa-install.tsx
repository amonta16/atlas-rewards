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

  return (
    <div className="fixed inset-x-3 bottom-20 z-40 max-w-sm mx-auto bg-white rounded-2xl shadow-2xl border p-4 flex items-start gap-3"
      style={{ borderTopColor: primary, borderTopWidth: 3 }}>
      <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 text-white"
        style={{ background: primary }}>
        <Download className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        {storeUrl ? (
          <>
            <div className="font-semibold text-sm">Take {businessName} with you</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Get the free AE Rewards app — same account, your points and streak come with you.
            </p>
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={dismiss}
              className="mt-2 inline-block text-xs font-bold px-3 py-1.5 rounded-full text-white"
              style={{ background: primary }}
            >
              {mode === "ios-store" ? " Download on the App Store" : "Get it on Google Play"}
            </a>
          </>
        ) : (
          <>
            <div className="font-semibold text-sm">Add {businessName} to your home screen</div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Install the app for one-tap rewards access.
            </p>
            <button onClick={install}
              className="mt-2 text-xs font-bold px-3 py-1.5 rounded-full text-white"
              style={{ background: primary }}>
              Install app
            </button>
          </>
        )}
      </div>
      <button onClick={dismiss}
        className="text-zinc-400 hover:text-zinc-700 shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
