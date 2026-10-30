"use client";
/**
 * HomeReady — CP-211 · marks "the Home screen is hydrated and tappable".
 * Rendered at the END of the Home page (regular + med spa) so its effect
 * runs only once the Home content above it has hydrated. LaunchTimer
 * waits for this (and for the splash) before reporting open → interactive.
 */
import { useEffect } from "react";

export function HomeReady() {
  useEffect(() => {
    const w = window as unknown as { __atlasHomeReady?: number };
    if (w.__atlasHomeReady === undefined) {
      w.__atlasHomeReady = performance.now();
      window.dispatchEvent(new Event("atlas:home-ready"));
    }
  }, []);
  return null;
}
