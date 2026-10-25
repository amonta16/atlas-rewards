"use client";
/**
 * CP-218 · offline guard
 *
 * When the phone has no connection and the customer taps a tab, Next.js
 * can't fetch the page, gives up on the in-app navigation and falls back to
 * a full page load — which, offline, is the browser's own error page (or a
 * blank WebView inside the native app). Before that happens: while the
 * device reports itself offline, in-app link taps stay put and a banner says
 * why. The banner leaves on its own when the connection comes back.
 */
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineGuard() {
  const [offline, setOffline] = useState(false);
  const [nudge, setNudge] = useState(0);

  useEffect(() => {
    const sync = () => setOffline(navigator.onLine === false);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const onClick = (e: MouseEvent) => {
      if (navigator.onLine !== false || e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      let u: URL;
      try { u = new URL(a.href, location.href); } catch { return; }
      if (u.origin !== location.origin || (u.pathname === location.pathname && u.search === location.search)) return;
      e.preventDefault();
      e.stopPropagation();
      setOffline(true);
      setNudge((n) => n + 1);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      key={nudge}
      className="fixed inset-x-0 top-0 z-[10000] flex justify-center px-3 pointer-events-none"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-zinc-900 px-4 py-2 text-xs font-semibold text-white shadow-lg animate-in fade-in">
        <WifiOff className="h-3.5 w-3.5" /> You&apos;re offline — reconnect to keep going
      </div>
    </div>
  );
}
