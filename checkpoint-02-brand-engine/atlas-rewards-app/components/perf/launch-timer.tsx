"use client";
/**
 * LaunchTimer — CP-211 · "open → interactive" for the customer app
 *
 * Interactive = the Home screen has hydrated (HomeReady fired — taps work)
 * AND the boot splash is gone (the customer can see it). Both are measured from the browser's
 * navigation start, so the number covers server time, download, JS boot
 * and the splash.
 *
 *   window.__atlasLaunch  → { ttfb, html, hydrated, splash, interactive }
 *   console               → "[launch] interactive 812ms (ttfb 340, hydrated 790, splash 812)"
 *   /api/perf/launch      → a 20 % sample of cold opens (always with ?perf=1),
 *                           so production numbers land in the Vercel logs.
 * Only the first open of a tab session is reported (that's the cold start).
 */
import { useEffect } from "react";

declare global {
  interface Window {
    __atlasLaunch?: Record<string, number | string>;
    __atlasSplashDone?: number;
  }
}

const FLAG = "atlas-launch-reported";

export function LaunchTimer({ slug }: { slug: string }) {
  useEffect(() => {
    let reported = false;
    try { reported = !!sessionStorage.getItem(FLAG); sessionStorage.setItem(FLAG, "1"); } catch { /* private mode */ }
    if (reported) return;

    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const w = window as unknown as { __atlasHomeReady?: number; __atlasSplashPending?: boolean; __atlasCachedShell?: number };

    const finish = () => {
      const home = Math.round(w.__atlasHomeReady ?? 0);
      const splash = Math.round(window.__atlasSplashDone ?? 0);
      const m = {
        slug,
        path: location.pathname,
        ttfb: Math.round(nav?.responseStart ?? 0),
        html: Math.round(nav?.responseEnd ?? 0),
        hydrated: home,
        splash,
        // When the last-known Home (from the phone) was on screen; 0 = not used.
        cached: Math.round(w.__atlasCachedShell ?? 0),
        interactive: Math.max(home, splash),
      };
      window.__atlasLaunch = m;
      console.info(`[launch] interactive ${m.interactive}ms (ttfb ${m.ttfb}, html ${m.html}, home hydrated ${m.hydrated}, splash ${m.splash}, cached home ${m.cached})`);
      const force = new URLSearchParams(location.search).has("perf");
      if (force || Math.random() < 0.2) {
        try { navigator.sendBeacon?.("/api/perf/launch", JSON.stringify(m)); } catch { /* ignore */ }
      }
    };

    // Report once BOTH the Home screen is hydrated and the splash (if it's
    // showing) has lifted. Not on Home (deep link to another tab)? Skip.
    const homeDone = () => w.__atlasHomeReady !== undefined;
    const splashDone = () => !w.__atlasSplashPending || window.__atlasSplashDone !== undefined;
    let done = false;
    const check = () => { if (!done && homeDone() && splashDone()) { done = true; finish(); } };
    window.addEventListener("atlas:home-ready", check);
    window.addEventListener("atlas:splash-done", check);
    // Effects of siblings run in order; give the splash/home effects a tick.
    const t0 = window.setTimeout(check, 0);
    const giveUp = window.setTimeout(() => { done = true; }, 15000);
    return () => {
      window.removeEventListener("atlas:home-ready", check);
      window.removeEventListener("atlas:splash-done", check);
      window.clearTimeout(t0); window.clearTimeout(giveUp);
    };
  }, [slug]);
  return null;
}
