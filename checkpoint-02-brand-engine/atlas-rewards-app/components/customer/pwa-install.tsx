"use client";
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * Registers the service worker and shows a brand-colored "Install app" prompt
 * when the browser fires `beforeinstallprompt`. iOS Safari has no API — it
 * shows separate instructions for Add to Home Screen.
 */
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function PWAInstall({ primary, businessName }: { primary: string; businessName: string }) {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      // Show after 5 seconds so it doesn't appear immediately
      setTimeout(() => setShow(true), 5000);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS detection
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !("standalone" in window.navigator && (window.navigator as any).standalone);
    if (isIos) setTimeout(() => setIosHint(true), 6000);

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!show && !iosHint) return null;

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setShow(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-20 z-40 max-w-sm mx-auto bg-white rounded-2xl shadow-2xl border p-4 flex items-start gap-3"
      style={{ borderTopColor: primary, borderTopWidth: 3 }}>
      <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 text-white"
        style={{ background: primary }}>
        <Download className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">Add {businessName} to your home screen</div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {iosHint ? "Tap the Share button, then 'Add to Home Screen.'" : "Install the app for one-tap rewards access."}
        </p>
        {!iosHint && (
          <button onClick={install}
            className="mt-2 text-xs font-bold px-3 py-1.5 rounded-full text-white"
            style={{ background: primary }}>
            Install app
          </button>
        )}
      </div>
      <button onClick={() => { setShow(false); setIosHint(false); }}
        className="text-zinc-400 hover:text-zinc-700 shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
