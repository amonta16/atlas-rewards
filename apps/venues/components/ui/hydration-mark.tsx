"use client";
/**
 * CP-218: tells the boot watchdog (components/ui/boot-watchdog.tsx) that
 * React is running, and removes its card if it appeared on a slow-but-
 * successful boot. Mounted once in the root layout.
 */
import { useEffect } from "react";

export function HydrationMark() {
  useEffect(() => {
    (window as unknown as { __atlasHydrated?: boolean }).__atlasHydrated = true;
    document.getElementById("atlas-boot-stuck")?.remove();
  }, []);
  return null;
}
