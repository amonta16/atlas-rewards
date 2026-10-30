"use client";
/**
 * CP-211 · render-from-cache for the customer Home
 *
 *  <HomeSnapshotWriter> — on every Home render, keeps a tiny "last known"
 *    snapshot on the phone (first name, points, brand). See lib/device-cache.
 *
 *  <CachedHomeOrLoading> — the route loading screen. It's in the first bytes
 *    of HTML the server streams (before any JavaScript runs). A tiny inline
 *    script fills it from that snapshot, so a returning customer sees their
 *    card and points the instant the page starts — and the boot splash steps
 *    aside for it. The fresh Home streams in and replaces it (it's marked
 *    "Updating…", aria-busy). No snapshot, or not on Home → the branded loader,
 *    exactly as before.
 *
 * The cached shell is plain HTML (not React-managed) so the pre-paint script
 * can fill it without a hydration mismatch, and values are written with
 * textContent / validated colors only (nothing from storage is parsed as HTML).
 */
import { useEffect, useState } from "react";
import { StallNotice } from "@/components/ui/stall-notice";
import { BrandedLoading } from "@/components/ui/branded-loading";
import { saveHomeSnapshot, type HomeSnapshot } from "@/lib/device-cache";

export function HomeSnapshotWriter(props: Omit<HomeSnapshot, "savedAt">) {
  const { slug, business, firstName, points, pointsLabel, primary, secondary } = props;
  useEffect(() => {
    saveHomeSnapshot({ slug, business, firstName, points, pointsLabel, primary, secondary, savedAt: Date.now() });
  }, [slug, business, firstName, points, pointsLabel, primary, secondary]);
  return null;
}

const SHELL = `
<div id="atlas-cached-home" aria-busy="true" aria-label="Loading your rewards" style="display:none;max-width:28rem;margin:0 auto;min-height:100vh;background:#fafafa;font-family:inherit">
  <div data-k="hero" style="position:relative;height:14rem;overflow:hidden">
    <div style="position:absolute;inset:0;background:rgba(0,0,0,.15)"></div>
    <div style="position:relative;padding:1rem">
      <div data-k="business" style="color:rgba(255,255,255,.85);font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase"></div>
      <div data-k="greet" style="color:#fff;font-size:1.25rem;font-weight:700;line-height:1.25;margin-top:.25rem"></div>
    </div>
  </div>
  <div style="padding:0 1rem;margin-top:-1.75rem;position:relative">
    <div style="border-radius:1.5rem;background:#fff;padding:1.25rem;box-shadow:0 10px 25px -10px rgba(0,0,0,.2);border:1px solid rgba(0,0,0,.05)">
      <div data-k="label" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#a1a1aa"></div>
      <div data-k="points" style="margin-top:.25rem;font-size:2.25rem;font-weight:900;font-variant-numeric:tabular-nums"></div>
      <div style="margin-top:.5rem;display:flex;align-items:center;gap:.4rem;font-size:12px;color:#a1a1aa"><span data-k="dot" style="height:6px;width:6px;border-radius:9999px;animation:atlas-dot 1s ease-in-out infinite"></span>Updating…</div>
    </div>
  </div>
  <div style="padding:0 1rem;margin-top:1.25rem;display:grid;gap:.75rem">
    <div style="height:6rem;border-radius:1rem;background:#e4e4e7"></div><div style="height:6rem;border-radius:1rem;background:#e4e4e7"></div><div style="height:6rem;border-radius:1rem;background:#e4e4e7"></div>
  </div>
  <style>@keyframes atlas-dot{50%{opacity:.3}}</style>
</div>
<script>(function(){try{
  var p=location.pathname; if(!/^(\\/[^\\/]+)?\\/app\\/?$/.test(p)) return;
  var slug=p.indexOf("/app")===0?null:p.split("/")[1];
  var raw=(slug&&localStorage.getItem("atlas-home-"+slug))||localStorage.getItem("atlas-home-last"); if(!raw) return;
  var s=JSON.parse(raw); if(!s||Date.now()-s.savedAt>2592e6) return;
  var hex=/^#[0-9a-f]{3,8}$/i, pr=hex.test(s.primary)?s.primary:"#0a3d62", se=hex.test(s.secondary)?s.secondary:pr;
  var r=document.getElementById("atlas-cached-home"); if(!r) return;
  var q=function(k){return r.querySelector('[data-k="'+k+'"]')};
  q("hero").style.background="linear-gradient(135deg,"+pr+" 0%,"+se+" 100%)";
  q("business").textContent=String(s.business||"");
  q("greet").textContent="Welcome back, "+String(s.firstName||"there")+"!";
  q("label").textContent=String(s.pointsLabel||"Your points");
  q("points").textContent=Number(s.points||0).toLocaleString(); q("points").style.color=pr;
  q("dot").style.background=pr;
  r.style.display="block";
  var l=document.getElementById("atlas-branded-loading"); if(l) l.style.display="none";
  // Real content beats a logo: the splash steps aside for the cached Home.
  var sp=document.getElementById("atlas-boot-splash"); if(sp){sp.style.display="none";}
  document.documentElement.classList.add("atlas-splash-done");
  window.__atlasCachedShell=performance.now();
}catch(e){}})();</script>`;

export function CachedHomeOrLoading({ title }: { title?: string }) {
  return (
    <>
      <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: SHELL }} />
      <div id="atlas-branded-loading"><BrandedLoading title={title} /></div>
      <CachedShellStall />
    </>
  );
}

/**
 * CP-218: the cached Home says "Updating…" — and before this it said so
 * forever when the fresh Home never arrived (dead connection). When the
 * cached shell is the thing on screen, a slow/stuck load gets the same
 * message + Try again as every other loading screen, as a bottom card.
 */
function CachedShellStall() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = document.getElementById("atlas-cached-home");
    setShown(!!el && el.style.display === "block");
  }, []);
  if (!shown) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}>
      <div className="pointer-events-auto flex w-full max-w-sm justify-center rounded-2xl bg-white/95 px-4 pb-4 shadow-xl ring-1 ring-black/5 empty:hidden">
        <StallNotice tone="onLight" />
      </div>
    </div>
  );
}
