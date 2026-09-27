"use client";
/**
 * DeskLive — CP-167 · one realtime feed + one Refresh button for the desk
 *
 * Before this, the manager dashboard was a patchwork: the review queue and
 * pending-pass queue subscribed to realtime, bookings polled every 2 min,
 * "Recent activity" was rendered once on the server and never changed, and
 * the sidebar's Needs-action count polled on its own timer. A booking made
 * in the app, a wheel prize waiting to be handed over, points another
 * station just awarded — none of it showed up until someone hit F5.
 *
 * Now the dashboard mounts ONE Supabase channel per business that listens
 * to postgres_changes on the tables the desk cares about (bookings,
 * redemptions, reviews, points_ledger, business_memberships, check-ins),
 * all filtered by business_id. Every event bumps a `tick`; panels that
 * load data re-run their loader when `tick` changes. Events are debounced
 * (a single award writes ledger + membership + maybe a check-in) so a burst
 * becomes one reload, and reloads are capped to one per 1.5 s per panel via
 * the debounce here — no router.refresh() stampede (CP-85/88 lesson).
 *
 * The same `bump()` backs the visible Refresh button, and a slow 3-minute
 * safety poll covers the case where the websocket silently drops (tablets
 * that sleep). `lastAt` feeds the "updated 12s ago" caption.
 *
 * RLS still applies to realtime: staff only receive rows their SELECT
 * policies allow (all six tables have a staffs_business() read policy).
 * `bookings` must be in the supabase_realtime publication — cp167 SQL.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type DeskLiveState = {
  /** Increments on every relevant DB change or manual refresh. Put it in a useEffect dep list. */
  tick: number;
  /** Force a refresh of every subscribed panel (the Refresh button calls this). */
  bump: () => void;
  /** When the last tick happened. */
  lastAt: number;
  /** True while the realtime channel is joined. */
  live: boolean;
  /** True for ~700 ms after a bump, so the Refresh icon can spin. */
  busy: boolean;
};

const Ctx = createContext<DeskLiveState>({ tick: 0, bump: () => {}, lastAt: Date.now(), live: false, busy: false });

const TABLES = ["bookings", "redemptions", "reviews", "points_ledger", "business_memberships", "check_in_events"] as const;
const DEBOUNCE_MS = 700;
const SAFETY_POLL_MS = 180_000;

export function DeskLiveProvider({ businessId, children }: { businessId: string; children: React.ReactNode }) {
  const [tick, setTick] = useState(0);
  const [lastAt, setLastAt] = useState(() => Date.now());
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bump = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setBusy(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setTick(t => t + 1);
      setLastAt(Date.now());
      setTimeout(() => setBusy(false), 500);
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let ch = supabase.channel(`desk-live-${businessId}`);
    for (const table of TABLES) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table, filter: `business_id=eq.${businessId}` }, () => bump());
    }
    ch.subscribe(status => setLive(status === "SUBSCRIBED"));
    const poll = setInterval(bump, SAFETY_POLL_MS);
    const onFocus = () => bump();
    const onVis = () => { if (document.visibilityState === "visible") bump(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [businessId, bump]);

  const value = useMemo(() => ({ tick, bump, lastAt, live, busy }), [tick, bump, lastAt, live, busy]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Read the live feed. Safe outside the provider (tick stays 0, bump is a no-op). */
export function useDeskLive() {
  return useContext(Ctx);
}

/** "just now" / "12s ago" / "3m ago" — re-renders itself every 10 s. */
function useAgo(ts: number) {
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force(n => n + 1), 10_000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 8) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/**
 * The visible-but-quiet refresh control. `tone="dark"` for the sidebar,
 * `tone="light"` for the white title bar / phone header. Shows a green dot
 * while realtime is connected (so staff know they don't NEED to press it)
 * and the time of the last update.
 */
export function DeskRefreshButton({ tone = "light", compact = false, className }: { tone?: "light" | "dark"; compact?: boolean; className?: string }) {
  const { bump, lastAt, live, busy } = useDeskLive();
  const ago = useAgo(lastAt);
  const dark = tone === "dark";
  return (
    <button
      type="button"
      onClick={bump}
      title={live ? `Live · updated ${ago}. Click to refresh now.` : `Not live — click to refresh (updated ${ago}).`}
      aria-label="Refresh"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg h-9 text-[12px] font-semibold transition active:scale-[0.98]",
        compact ? "px-2" : "px-2.5",
        dark ? "text-zinc-300 hover:bg-white/[0.07] hover:text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
        className,
      )}
    >
      <RefreshCw className={cn("h-4 w-4 shrink-0", busy && "animate-spin")} />
      {!compact && (
        <span className="flex flex-col items-start leading-none">
          <span>Refresh</span>
          <span className={cn("mt-0.5 text-[10px] font-medium inline-flex items-center gap-1", dark ? "text-zinc-500" : "text-zinc-400")}>
            {live ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> : <WifiOff className="h-2.5 w-2.5" />}
            {live ? "Live" : "Offline"} · {ago}
          </span>
        </span>
      )}
      {compact && (live ? <Wifi className={cn("h-3 w-3", dark ? "text-emerald-300" : "text-emerald-500")} /> : <WifiOff className="h-3 w-3 text-amber-500" />)}
    </button>
  );
}
