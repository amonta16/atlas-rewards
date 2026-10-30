"use client";
/**
 * CP-218 · route error screen
 *
 * The customer app had no error boundary at all. A render that failed (a
 * request that timed out on a weak connection, a script from an older
 * deploy that no longer exists) fell through to Next's bare white
 * "Application error" page — or, mid-navigation, left the loading screen up.
 * Now every failure lands here: a plain message, and a Try again that
 * actually retries (re-render first; a full reload if that fails again).
 *
 * A ChunkLoadError means the phone is running an older build than the
 * server — the only fix is a reload, so we do that once automatically.
 */
import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

const AUTO_RELOAD_KEY = "atlas-chunk-reload-at";

export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline, setOffline] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    const isChunk = error?.name === "ChunkLoadError" || /Loading (CSS )?chunk|dynamically imported module|importing a module script failed/i.test(error?.message ?? "");
    if (isChunk) {
      try {
        const last = Number(sessionStorage.getItem(AUTO_RELOAD_KEY) || 0);
        if (Date.now() - last > 60_000) {
          sessionStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()));
          window.location.reload();
        }
      } catch { /* storage blocked — the button still works */ }
    }
    // Keep a trace for Vercel/console without showing internals to customers.
    console.error("[atlas] route error", error?.name, error?.message, error?.digest);
    const on = () => { setOffline(false); reset(); };
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
  }, [error, reset]);

  function retry() {
    // First tap: re-render in place (cheap). If it fails again, a full reload
    // on a fresh connection.
    if (tries === 0) { setTries(1); reset(); return; }
    window.location.reload();
  }

  return (
    <div className="min-h-[70vh] w-full flex flex-col items-center justify-center px-8 text-center">
      <div className="h-12 w-12 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-500">
        {offline ? <WifiOff className="h-6 w-6" /> : <RefreshCw className="h-6 w-6" />}
      </div>
      <h1 className="mt-4 text-lg font-bold text-zinc-900">
        {offline ? "You're offline" : "We couldn't load this"}
      </h1>
      <p className="mt-1 text-sm text-zinc-500 max-w-xs">
        {offline
          ? "Connect to Wi-Fi or turn off Airplane Mode. We'll try again as soon as you're back."
          : "Your connection may be weak, or something hiccuped on our side. Your points and rewards are safe."}
      </p>
      <button
        type="button"
        onClick={retry}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow"
      >
        <RefreshCw className="h-4 w-4" /> Try again
      </button>
    </div>
  );
}
