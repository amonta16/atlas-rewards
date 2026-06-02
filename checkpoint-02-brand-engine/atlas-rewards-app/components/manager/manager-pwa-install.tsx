"use client";
/**
 * ManagerPwaInstall — CP-37.18
 *
 * Compact "Install front-desk app" affordance that appears in the
 * manager dashboard header on devices that support beforeinstallprompt
 * (Chrome / Edge on Android + desktop). Tap it → native install prompt
 * → the manager surface lands as its own home-screen icon.
 *
 * iOS Safari doesn't expose beforeinstallprompt; for that we fall back
 * to a short instruction "Share → Add to Home Screen." Hidden once
 * the app is already running in standalone mode.
 */
import { useEffect, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";

type DeferredPrompt = {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function ManagerPwaInstall({ primary }: { primary: string }) {
  const [prompt, setPrompt] = useState<DeferredPrompt | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsStandalone(
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true,
    );
    // iOS detection (Safari only — Chrome on iOS is the same engine).
    const ua = navigator.userAgent || "";
    setIsIos(/iphone|ipad|ipod/i.test(ua));

    const onPrompt = (e: any) => {
      e.preventDefault();
      setPrompt(e as DeferredPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (isStandalone) return null;

  async function install() {
    if (prompt) {
      prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
      return;
    }
    if (isIos) {
      setShowIosHelp(true);
      return;
    }
    // Other browsers — show iOS-style help as a fallback hint.
    setShowIosHelp(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs font-bold text-white shadow-sm active:scale-[0.97] transition"
        style={{ background: primary }}
        title="Install the front-desk app on this device"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Install app</span>
      </button>

      {showIosHelp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/55">
          <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b flex items-center justify-between">
              <h2 className="font-bold text-base flex items-center gap-2">
                <Smartphone className="h-4 w-4" style={{ color: primary }} />
                Install on this iPhone
              </h2>
              <button
                onClick={() => setShowIosHelp(false)}
                className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm text-zinc-700">
              <Step n={1}>Tap the <strong>Share</strong> button at the bottom of Safari (the square with an arrow).</Step>
              <Step n={2}>Scroll the share sheet and tap <strong>Add to Home Screen</strong>.</Step>
              <Step n={3}>Confirm — the front-desk app appears as its own icon. Open it from there and you're set.</Step>
              <p className="text-[11px] text-zinc-500 pt-2 border-t">
                On Android / desktop Chrome, browsers usually pop the install prompt automatically.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="h-6 w-6 rounded-full bg-zinc-100 text-zinc-700 text-xs font-extrabold flex items-center justify-center shrink-0">
        {n}
      </div>
      <div className="flex-1 leading-snug">{children}</div>
    </div>
  );
}
