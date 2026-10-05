"use client";
/**
 * Site motion — CP-196 · GSAP + ScrollTrigger for atlas-engine.app.
 *
 * One hook, mounted once by the page, wires every scroll moment from data
 * attributes, so sections stay plain markup and all motion lives here:
 *
 *   data-gs="parallax"  data-gs-y="40"   drifts with scroll (scrubbed); smaller on phones
 *   data-gs="draw"      data-gs-axis="x|y|auto"  a line that draws as its section scrolls by
 *   data-gs="stagger"   children [data-gs-item] rise in, one after another, once
 *   data-gs="pop"       children [data-gs-pop] scale in with a small overshoot, once
 *
 * Nothing runs under prefers-reduced-motion; elements simply stay in place.
 * Everything is reverted on unmount (gsap.matchMedia context).
 */
import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;
function register() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);
  registered = true;
}

export function useSiteMotion(root: React.RefObject<HTMLElement>) {
  useEffect(() => {
    register();
    const el = root.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add(
      { motion: "(prefers-reduced-motion: no-preference)", phone: "(max-width: 767px)" },
      (ctx) => {
        const { motion, phone } = ctx.conditions as { motion: boolean; phone: boolean };
        if (!motion) return;
        const q = <T extends Element>(sel: string) => gsap.utils.toArray<T>(el.querySelectorAll(sel));

        q<HTMLElement>('[data-gs="parallax"]').forEach((n) => {
          const amt = Number(n.dataset.gsY ?? 40) * (phone ? 0.45 : 1);
          gsap.fromTo(n, { y: amt }, { y: -amt, ease: "none", scrollTrigger: { trigger: n, start: "top bottom", end: "bottom top", scrub: 0.6 } });
        });

        q<HTMLElement>('[data-gs="draw"]').forEach((n) => {
          const axis = n.dataset.gsAxis === "auto" ? (phone ? "y" : "x") : (n.dataset.gsAxis ?? "x");
          gsap.fromTo(n, axis === "x" ? { scaleX: 0 } : { scaleY: 0 }, {
            ...(axis === "x" ? { scaleX: 1 } : { scaleY: 1 }),
            transformOrigin: axis === "x" ? "left center" : "center top",
            ease: "none",
            scrollTrigger: { trigger: n.parentElement ?? n, start: "top 75%", end: "bottom 55%", scrub: 0.5 },
          });
        });

        q<HTMLElement>('[data-gs="stagger"]').forEach((box) => {
          const items = box.querySelectorAll("[data-gs-item]");
          if (!items.length) return;
          gsap.from(items, {
            y: phone ? 18 : 28, autoAlpha: 0, duration: 0.7, ease: "power3.out", stagger: phone ? 0.07 : 0.1,
            scrollTrigger: { trigger: box, start: "top 82%", once: true },
          });
        });

        q<HTMLElement>('[data-gs="pop"]').forEach((box) => {
          const items = box.querySelectorAll("[data-gs-pop]");
          if (!items.length) return;
          gsap.from(items, {
            scale: 0, autoAlpha: 0, duration: 0.45, ease: "back.out(2.2)", stagger: 0.06,
            scrollTrigger: { trigger: box, start: "top 78%", once: true },
          });
        });
      },
    );
    // Fonts and images change heights after first paint; re-measure once they settle.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener("load", refresh);
    const t = window.setTimeout(refresh, 1200);
    return () => { window.removeEventListener("load", refresh); window.clearTimeout(t); mm.revert(); };
  }, [root]);
}

/** Counts the number inside a label ("+$18k", "x2", "4.9", "142") up from zero. */
export function countUp(node: HTMLElement | null, label: string) {
  if (!node || typeof window === "undefined") return;
  const m = label.match(/^([^\d]*)([\d.,]+)(.*)$/);
  if (!m || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { node.textContent = label; return; }
  const [, pre, num, post] = m;
  const target = Number(num.replace(/,/g, ""));
  const decimals = num.includes(".") ? num.split(".")[1].length : 0;
  const o = { v: 0 };
  gsap.killTweensOf(o);
  gsap.to(o, {
    v: target, duration: 1.1, ease: "power2.out",
    onUpdate: () => { node.textContent = `${pre}${o.v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${post}`; },
    onComplete: () => { node.textContent = label; },
  });
}

export { gsap };
