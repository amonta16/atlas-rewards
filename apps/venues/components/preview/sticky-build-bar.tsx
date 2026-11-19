"use client";
/**
 * components/preview/sticky-build-bar.tsx — CP-254 · the CTA that follows you down /medspa/app.
 *
 * Hidden while the search box is on screen (one ask at a time). Once it scrolls out of view, a bar
 * slides up from the bottom: "See your med spa's app, free" + [Build my app]. The button scrolls back to
 * the search box and puts the cursor in it. Watches the element with id `targetId` (IntersectionObserver).
 * Reduced motion: it appears without the slide and the scroll back is instant.
 */
import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import { track } from "@/lib/landing/analytics";

export function StickyBuildBar({ targetId, inputId }: { targetId: string; inputId: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || !("IntersectionObserver" in window)) return;
    // Show only once the box has gone off the TOP of the screen (scrolled past), not before it's reached.
    const io = new IntersectionObserver(([e]) => setShow(!!e && !e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  const go = () => {
    track("hero_cta_clicked", { source: "medspa_app:sticky_bar" });
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(targetId)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    window.setTimeout(() => (document.getElementById(inputId) as HTMLInputElement | null)?.focus({ preventScroll: true }), reduce ? 0 : 450);
  };

  return (
    <div aria-hidden={!show} className={`fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-2 transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none ${show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-full opacity-0"}`}>
      <div className="mx-auto flex max-w-[560px] items-center gap-3 rounded-2xl border border-[#0B1B2B]/10 bg-white/90 py-2 pl-4 pr-2 shadow-[0_18px_44px_-18px_rgba(11,27,43,.45)] backdrop-blur-md">
        <span className="min-w-0 flex-1 text-[14.5px] font-semibold leading-tight text-[#0B1B2B]">
          See your med spa&apos;s app<span className="block text-[12.5px] font-medium text-[#6B7A8C]">Free, ready in about a minute</span>
        </span>
        <button type="button" onClick={go} tabIndex={show ? 0 : -1} className="s-btn s-btn-primary s-focus !h-[46px] shrink-0 !px-4 !text-[15px]">
          Build my app <ArrowUp className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
