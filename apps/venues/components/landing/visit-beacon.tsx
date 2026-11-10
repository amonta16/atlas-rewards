"use client";
/**
 * <VisitBeacon path="/medspa/app" /> — CP-238 · counts one visit per tab session
 * for Admin → Lead funnel. A random visitor id lives in localStorage so repeat
 * visits by the same browser count as one visitor. No cookies, no names.
 */
import { useEffect } from "react";

export function VisitBeacon({ path }: { path: string }) {
  useEffect(() => {
    try {
      const key = `atlas-visit:${path}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
      let vid = localStorage.getItem("atlas-vid");
      if (!vid) {
        vid = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
        localStorage.setItem("atlas-vid", vid);
      }
      const q = new URLSearchParams(window.location.search);
      const body = JSON.stringify({
        path, vid,
        utm_source: q.get("utm_source"), utm_campaign: q.get("utm_campaign"), utm_content: q.get("utm_content"),
        ref: document.referrer || null,
      });
      if (!navigator.sendBeacon?.("/api/landing/visit", new Blob([body], { type: "application/json" }))) {
        fetch("/api/landing/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    } catch { /* storage blocked: skip counting */ }
  }, [path]);
  return null;
}
