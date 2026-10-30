"use client";
/**
 * lib/landing/ab.ts — CP-202 · sticky A/B arms for the landing pages.
 * URL wins (?<param>=arm, so a Meta ad can force an arm), then the arm this
 * browser already saw, then a fair coin. Stored in localStorage; if storage is
 * blocked the visitor just gets a fresh coin flip.
 */
import { useEffect, useState } from "react";

export function useArm<T extends string>(test: string, arms: readonly T[], param = test): T | null {
  const [arm, setArm] = useState<T | null>(null);
  useEffect(() => {
    const key = `atlas_ab_${test}`;
    const fromUrl = new URLSearchParams(window.location.search).get(param) as T | null;
    let saved: T | null = null;
    try { saved = localStorage.getItem(key) as T | null; } catch { /* blocked */ }
    const pick = fromUrl && arms.includes(fromUrl) ? fromUrl : saved && arms.includes(saved) ? saved : arms[Math.floor(Math.random() * arms.length)];
    try { localStorage.setItem(key, pick); } catch { /* blocked */ }
    setArm(pick);
  }, [test, param, arms]);
  return arm;
}

/** Carries the current query string (UTMs, fbclid) onto another funnel URL, plus extras. */
export function withQuery(path: string, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  q.delete("lead");
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
