"use client";
/**
 * PWABootSplash — CP-42 → CP-211
 *
 * The branded cold-boot screen: the business logo on its brand color.
 *
 * CP-211 (cold start): it used to mount AFTER hydration and then hold for a
 * fixed 900 ms + 350 ms fade — so the app, already rendered underneath, was
 * hidden for 1.25 s on every first open. Now:
 *   • it's in the server HTML, so it covers the screen from the very first
 *     paint while the app's JavaScript boots (that's the job of a splash);
 *   • it lifts the moment the app has hydrated (taps work), with a short
 *     fade — no fixed hold;
 *   • a tiny inline script removes it before paint when it has already
 *     played this session (same once-per-session rule as before).
 * It's never interactive (pointer-events: none), so it can't block taps.
 *
 * CP-218 (Oct 24 incident — "stuck on the loading screen"): every
 * router.refresh() re-rendered this layout and the splash HTML was put back
 * into the page AFTER it had already played — and nothing lifted it again.
 * Signup, login, signing the waiver and many in-app actions call refresh(),
 * so a new customer who tapped Create account (or an existing one who
 * redeemed something) got the logo + shimmer over the app for good, while
 * their taps went through, unseen, to the app underneath. Closing the app
 * "fixed" it until the next refresh. Two guards now:
 *   1. once the splash has played (or was skipped) in this page lifetime,
 *      this component renders NOTHING — any re-render or remount is empty;
 *   2. the "done" class on <html> hides it with !important (the old rule
 *      lost to the element's own inline display:flex, so it never worked).
 */
import { useEffect } from "react";

const SHOWN_FLAG = "atlas-boot-splash-shown";
/** CP-218: true once the splash has played or been skipped in this page lifetime. */
let played = false;
const FADE_MS = 220;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function PWABootSplash({ primary, name, logoUrl }: { primary: string; name: string; logoUrl?: string | null }) {
  useEffect(() => {
    const el = document.getElementById("atlas-boot-splash");
    const w = window as unknown as { __atlasSplashPending?: boolean; __atlasSplashDone?: number; __atlasHomeReady?: number };
    if (played) { el?.remove(); return; } // CP-218: never twice in one page lifetime
    if (!el || document.documentElement.classList.contains("atlas-splash-done")) {
      played = true; el?.remove(); return; // already played this session (removed before paint)
    }
    w.__atlasSplashPending = true;
    let lifted = false;
    const lift = () => {
      if (lifted) return; lifted = true; played = true;
      // Next frame = the hydrated content is committed and painted underneath.
      requestAnimationFrame(() => {
        el.style.opacity = "0";
        document.documentElement.classList.add("atlas-splash-done");
        w.__atlasSplashDone = performance.now();
        window.dispatchEvent(new Event("atlas:splash-done"));
        window.setTimeout(() => el.remove(), FADE_MS);
      });
    };
    // On Home, lift straight onto the live Home (no loader flash in between),
    // but never wait more than 1.2 s for it. Anywhere else, lift now.
    const onHome = /^(\/[^/]+)?\/app\/?$/.test(window.location.pathname);
    if (!onHome || (w as { __atlasHomeReady?: number }).__atlasHomeReady !== undefined) { lift(); return; }
    window.addEventListener("atlas:home-ready", lift, { once: true });
    const cap = window.setTimeout(lift, 1200);
    return () => { window.clearTimeout(cap); window.removeEventListener("atlas:home-ready", lift); };
  }, []);

  const initials = (name || "").split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "•";
  const color = /^#[0-9a-f]{3,8}$/i.test(primary) ? primary : "#0a3d62";
  const mark = logoUrl
    ? `<div style="height:7rem;width:7rem;border-radius:1.5rem;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 25px 50px -12px rgba(0,0,0,.25)"><img src="${esc(logoUrl)}" alt="" style="height:100%;width:100%;object-fit:contain;padding:1rem"></div>`
    : `<div style="height:7rem;width:7rem;border-radius:1.5rem;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:2.25rem">${esc(initials)}</div>`;

  // Plain HTML (not React-managed) so the pre-paint script can remove it
  // without a hydration mismatch.
  const html = `
<style>
  html.atlas-splash-done #atlas-boot-splash{display:none!important}
  @keyframes atlas-boot-pop{0%{opacity:0;transform:scale(.85)}60%{opacity:1;transform:scale(1.05)}100%{opacity:1;transform:scale(1)}}
  @keyframes atlas-boot-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
</style>
<div id="atlas-boot-splash" aria-hidden="true" style="position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;pointer-events:none;background:${color} radial-gradient(120% 80% at 50% -10%,rgba(255,255,255,.22),rgba(0,0,0,.2) 90%);transition:opacity ${FADE_MS}ms ease-out">
  <div style="display:flex;flex-direction:column;align-items:center;gap:1.25rem">
    <div style="animation:atlas-boot-pop 700ms cubic-bezier(.22,1,.36,1)">${mark}</div>
    <div style="height:.25rem;width:6rem;border-radius:9999px;overflow:hidden;background:rgba(255,255,255,.25)"><div style="height:100%;width:40%;border-radius:9999px;background:#fff;animation:atlas-boot-shimmer 1.2s ease-in-out infinite"></div></div>
  </div>
</div>
<script>try{if(sessionStorage.getItem("${SHOWN_FLAG}")){var s=document.getElementById("atlas-boot-splash");s&&s.remove();document.documentElement.classList.add("atlas-splash-done")}else{sessionStorage.setItem("${SHOWN_FLAG}","1")}}catch(e){}</script>`;

  // CP-218: after it has played, re-renders (router.refresh) get an empty
  // wrapper instead of a fresh copy of the splash.
  return <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: typeof window !== "undefined" && played ? "" : html }} />;
}
