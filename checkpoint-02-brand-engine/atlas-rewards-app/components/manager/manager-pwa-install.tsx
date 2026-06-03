"use client";
/**
 * ManagerPwaInstall — CP-37.18 → CP-43.4
 *
 * Lets the front desk install Atlas as a real app on their computer (or
 * phone) so it lives in the Windows taskbar / Start menu / Dock instead of
 * being "just a website." Backed by the dedicated front-desk manifest
 * (app/[business]/manage/manifest.ts) so the installed app opens straight
 * to /manage.
 *
 * Two render modes:
 *   • variant="button" — compact pill in the dashboard header.
 *   • variant="card"   — a prominent banner on the Front-desk tab that
 *                        spells out the "pin it to your taskbar" pitch.
 *
 * On Chrome / Edge (Windows, Mac, Android) we capture beforeinstallprompt
 * and fire the native installer on click. Where that isn't available
 * (iOS Safari, or before the browser has armed the prompt) we show clear,
 * platform-specific steps. Registers /sw.js so the page is installable.
 * Hides itself once the app is already running installed (standalone).
 */
import { useEffect, useState } from "react";
import { Download, Monitor, Smartphone, X, Check } from "lucide-react";

type DeferredPrompt = {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type OS = "windows" | "mac" | "ios" | "android" | "other";

function detectOS(): OS {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent || "";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/win/i.test(ua)) return "windows";
  if (/mac/i.test(ua)) return "mac";
  return "other";
}

export function ManagerPwaInstall({
  primary,
  businessName,
  variant = "button",
}: {
  primary: string;
  businessName?: string;
  variant?: "button" | "card";
}) {
  const [prompt, setPrompt] = useState<DeferredPrompt | null>(null);
  const [os, setOs] = useState<OS>("other");
  const [isStandalone, setIsStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOs(detectOS());
    setIsStandalone(
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true,
    );

    // Register the service worker so the browser will offer to install.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { /* ignore */ });
    }

    const onPrompt = (e: any) => { e.preventDefault(); setPrompt(e as DeferredPrompt); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (isStandalone || installed) return null;

  async function install() {
    if (prompt) {
      prompt.prompt();
      const res = await prompt.userChoice;
      if (res.outcome === "accepted") setInstalled(true);
      setPrompt(null);
      return;
    }
    setShowHelp(true);
  }

  const name = businessName || "this app";
  const isDesktop = os === "windows" || os === "mac" || os === "other";

  return (
    <>
      {variant === "button" ? (
        <button
          type="button"
          onClick={install}
          className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md text-xs font-bold text-white shadow-sm active:scale-[0.97] transition"
          style={{ background: primary }}
          title="Install this app on your computer"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Install app</span>
        </button>
      ) : (
        <div
          className="rounded-3xl p-[2px] shadow-sm"
          style={{ background: `linear-gradient(135deg, ${primary}, ${primary}99)` }}
        >
          <div className="rounded-[22px] bg-white p-4 flex items-center gap-4">
            <div
              className="h-12 w-12 rounded-2xl flex items-center justify-center text-white shrink-0"
              style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
            >
              <Monitor className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-extrabold text-sm leading-tight">Install on this computer</div>
              <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                Run the front desk as a real app, pinned to your taskbar — opens full-screen, no browser bar. Faster and more professional than a website tab.
              </div>
            </div>
            <button
              type="button"
              onClick={install}
              className="shrink-0 inline-flex items-center gap-1.5 px-3.5 h-10 rounded-xl text-sm font-bold text-white shadow active:scale-[0.98] transition"
              style={{ background: primary }}
            >
              <Download className="h-4 w-4" /> Install
            </button>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/55">
          <div className="w-full max-w-md bg-white rounded-3xl overflow-hidden">
            <div className="px-5 pt-5 pb-3 border-b flex items-center justify-between">
              <h2 className="font-bold text-base flex items-center gap-2">
                {isDesktop ? <Monitor className="h-4 w-4" style={{ color: primary }} /> : <Smartphone className="h-4 w-4" style={{ color: primary }} />}
                Install {name}
              </h2>
              <button onClick={() => setShowHelp(false)} className="h-9 w-9 rounded-full bg-zinc-100 flex items-center justify-center" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-sm text-zinc-700">
              {(os === "windows" || os === "mac" || os === "other") && (
                <>
                  <p className="text-[12px] text-zinc-500">In <strong>Chrome</strong> or <strong>Edge</strong> on your computer:</p>
                  <Step n={1}>Click the <strong>install icon</strong> in the address bar — a small monitor/⊕ icon at the right end of the URL. (Or open the <strong>⋮ menu → Cast, save and share → Install page as app</strong>.)</Step>
                  <Step n={2}>Click <strong>Install</strong> in the little pop-up.</Step>
                  <Step n={3}>It opens as its own window. <strong>Right-click its taskbar icon → Pin to taskbar</strong> for one-click access every shift.</Step>
                  <p className="text-[11px] text-zinc-500 pt-2 border-t">Tip: if you don't see the install icon yet, refresh the page once — the browser arms it after the app loads.</p>
                </>
              )}
              {os === "ios" && (
                <>
                  <p className="text-[12px] text-zinc-500">On <strong>iPhone / iPad</strong> (Safari):</p>
                  <Step n={1}>Tap the <strong>Share</strong> button (the square with an up-arrow).</Step>
                  <Step n={2}>Scroll and tap <strong>Add to Home Screen</strong>.</Step>
                  <Step n={3}>Open it from the new icon — it runs full-screen like an app.</Step>
                </>
              )}
              {os === "android" && (
                <>
                  <p className="text-[12px] text-zinc-500">On <strong>Android</strong> (Chrome):</p>
                  <Step n={1}>Open the <strong>⋮ menu</strong> at the top-right.</Step>
                  <Step n={2}>Tap <strong>Install app</strong> (or "Add to Home screen").</Step>
                  <Step n={3}>Confirm — it lands on your home screen as its own app.</Step>
                </>
              )}
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
      <div className="h-6 w-6 rounded-full bg-zinc-100 text-zinc-700 text-xs font-extrabold flex items-center justify-center shrink-0">{n}</div>
      <div className="flex-1 leading-snug">{children}</div>
    </div>
  );
}
