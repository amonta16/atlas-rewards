"use client";
/** "Hurray! You just earned 280 points": full-screen, confetti, one button to the points. */
import Link from "next/link";
import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { Portal } from "./portal";

export function EarnedOverlay({ points, clinic, href, onDone }: { points: number; clinic: string; href?: string; onDone?: () => void }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!open || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    confetti({ particleCount: 120, spread: 110, startVelocity: 34, origin: { y: 0.24 }, zIndex: 90 });
    const t = setTimeout(() => confetti({ particleCount: 70, spread: 130, startVelocity: 24, origin: { y: 0.18 }, zIndex: 90 }), 500);
    return () => clearTimeout(t);
  }, [open]);
  if (!open || points <= 0) return null;
  const close = () => { setOpen(false); onDone?.(); };
  return (
    <Portal>
      <div role="dialog" aria-modal className="fixed inset-0 z-[80] mx-auto flex max-w-md animate-fade flex-col bg-black px-7 text-center text-white">
        <div className="flex flex-1 flex-col items-center justify-center pb-10">
          <p className="text-[18px] font-semibold leading-snug">Hurray!<br />You just earned</p>
          <p className="mt-2 text-[92px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{points.toLocaleString("en-US")}</p>
          <p className="mt-2 text-[16px] font-semibold">{clinic} points</p>
        </div>
        <div className="pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
          {href
            ? <Link href={href} onClick={close} className="flex h-[52px] w-full items-center justify-center rounded-[14px] bg-white text-[16px] font-semibold text-ink">See my points</Link>
            : <button type="button" onClick={close} className="h-[52px] w-full rounded-[14px] bg-white text-[16px] font-semibold text-ink">See my points</button>}
        </div>
      </div>
    </Portal>
  );
}
