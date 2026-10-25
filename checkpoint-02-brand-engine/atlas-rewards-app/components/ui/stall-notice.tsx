"use client";
/**
 * StallNotice — CP-218 · no loading screen may spin forever
 *
 * Oct 24 at Flippo's: two customers sat on a loading screen that never
 * ended. Supabase and the server answered every request that reached them
 * in well under a second — the requests that hung never arrived (a phone on
 * weak cellular / venue Wi-Fi, a connection that died after the app was
 * backgrounded). The app had no answer for that: every loading surface
 * waited forever with no message and no way out except killing the app.
 *
 * This sits inside every loading screen. Nothing shows for the first few
 * seconds (normal loads never see it). Then:
 *   · after `slowMs`  → "Still loading…" plus the likely reason
 *                       (offline / weak connection),
 *   · after `stuckMs` → a real Try again button.
 * Try again does a full reload of the CURRENT url — on a route transition
 * the url already points at the page being opened, so it retries that page
 * on a fresh connection rather than going back.
 * Coming back online while stuck retries automatically.
 */
import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

type Phase = "quiet" | "slow" | "stuck";

export function StallNotice({
  slowMs = 6000,
  stuckMs = 12000,
  tone = "onBrand",
  onRetry,
}: {
  slowMs?: number;
  stuckMs?: number;
  /** onBrand = white text on a brand-color screen; onLight = dark text. */
  tone?: "onBrand" | "onLight";
  /** Default: full reload of the current url. */
  onRetry?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("quiet");
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const read = () => setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
    read();
    // Back online after we went offline or got stuck → retry on a fresh connection.
    let stuckNow = false;
    const t1 = window.setTimeout(() => setPhase((p) => (p === "quiet" ? "slow" : p)), slowMs);
    const t2 = window.setTimeout(() => { stuckNow = true; setPhase("stuck"); }, stuckMs);
    const goOffline = () => { stuckNow = true; setOffline(true); setPhase("stuck"); };
    const goOnline = () => { setOffline(false); if (stuckNow) retry(onRetry); };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.clearTimeout(t1); window.clearTimeout(t2);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [slowMs, stuckMs, onRetry]);

  if (phase === "quiet" && !offline) return null;

  const fg = tone === "onBrand" ? "text-white" : "text-zinc-900";
  const sub = tone === "onBrand" ? "text-white/80" : "text-zinc-500";
  const btn = tone === "onBrand"
    ? "bg-white text-zinc-900 hover:bg-white/90"
    : "bg-zinc-900 text-white hover:bg-zinc-800";

  const title = offline
    ? "You're offline"
    : phase === "stuck" ? "This is taking too long" : "Still loading…";
  const detail = offline
    ? "Connect to Wi-Fi or turn off Airplane Mode, then try again."
    : phase === "stuck"
      ? "Your connection may be weak. Tap below to try again."
      : "Your connection seems slow. Hang tight.";

  return (
    <div role="status" aria-live="polite" className="mt-6 w-full max-w-xs text-center">
      <div className={`flex items-center justify-center gap-1.5 text-sm font-semibold ${fg}`}>
        {offline && <WifiOff className="h-4 w-4" />}{title}
      </div>
      <p className={`mt-1 text-xs ${sub}`}>{detail}</p>
      {(phase === "stuck" || offline) && (
        <button
          type="button"
          onClick={() => retry(onRetry)}
          className={`mt-4 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold shadow ${btn}`}
        >
          <RefreshCw className="h-4 w-4" /> Try again
        </button>
      )}
    </div>
  );
}

function retry(onRetry?: () => void) {
  if (onRetry) { onRetry(); return; }
  try { window.location.reload(); } catch { /* ignore */ }
}
