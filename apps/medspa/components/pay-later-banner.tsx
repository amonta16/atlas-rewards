"use client";
/** Shop → Browse: the dark "Treat today. Pay later." banner and its "How does it work?" sheet. */
import { useState } from "react";
import { IcClose } from "./icons";
import { Portal } from "./portal";

export function PayLaterBanner({ lenders, clinic }: { lenders: string[]; clinic: string }) {
  const [open, setOpen] = useState(false);
  const names = lenders.join(" or ");
  return (
    <>
      <section className="card-sheen mx-4 rounded-[14px] px-5 py-5 text-center text-white">
        <h3 className="text-[19px] font-semibold leading-[1.25] tracking-[-0.01em]">Treat today. Pay later.<br />Earn rewards.</h3>
        <p className="mt-1.5 text-[13px] text-white/75">Free treatments, exclusive perks.</p>
        <button type="button" onClick={() => setOpen(true)} className="mt-3.5 h-10 rounded-[10px] bg-white px-5 text-[13.5px] font-semibold text-ink">How does it work?</button>
      </section>
      {open && (
        <Portal><div className="fixed inset-0 z-[60] animate-fade bg-black/45" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal onClick={(e) => e.stopPropagation()} className="absolute inset-x-0 bottom-0 mx-auto max-w-md animate-sheet rounded-t-[26px] bg-white px-6 pt-6" style={{ paddingBottom: "calc(1.75rem + env(safe-area-inset-bottom, 0px))" }}>
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.015em]">How pay later works</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-page"><IcClose className="h-4 w-4" /></button>
            </div>
            <ol className="mt-4 space-y-3 text-[14.5px] leading-snug text-sub">
              {[`Pick a package or product in the ${clinic} shop.`, `At checkout, choose ${names}. They show you the plan before you agree.`, "Your order is confirmed right away, and the desk has it ready for you."].map((t, i) => (
                <li key={t} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black text-[12px] font-semibold text-white">{i + 1}</span>{t}</li>
              ))}
            </ol>
            <p className="mt-4 text-[12.5px] leading-snug text-faint">Plans and approval are decided by {names}. Availability depends on your order total.</p>
          </div>
        </div></Portal>
      )}
    </>
  );
}
