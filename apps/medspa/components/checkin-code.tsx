"use client";
/** "Check-in code": the patient's QR for the front desk (it opens their profile at the desk). */
import { useState } from "react";
import QRCode from "react-qr-code";
import { IcClose, IcQr } from "./icons";
import { Portal } from "./portal";

export function CheckinCode({ code, name, clinic, variant = "pill" }: { code: string; name: string | null; clinic: string; variant?: "pill" | "row" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "pill" ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-semibold text-ink"><IcQr className="h-[18px] w-[18px]" />Check-in code</button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3.5 px-4 py-4 text-left">
          <IcQr className="h-5 w-5 text-sub" /><span className="flex-1 text-[15.5px] font-medium">My check-in code</span><span className="font-mono text-[13px] text-faint">{code}</span>
        </button>
      )}
      {open && (
        <Portal><div className="fixed inset-0 z-[60] grid animate-fade place-items-center bg-black/45 px-6" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal className="relative w-full max-w-[340px] animate-rise rounded-[24px] bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-page"><IcClose className="h-4 w-4" /></button>
            <p className="eyebrow">Check in at {clinic}</p>
            <h2 className="mt-2 text-[21px] font-semibold leading-tight">{name ?? "Your code"}</h2>
            <div className="mx-auto mt-5 w-fit rounded-[18px] bg-white p-3 ring-1 ring-line"><QRCode value={code} size={176} fgColor="#0a0a0a" bgColor="#ffffff" /></div>
            <p className="mt-4 font-mono text-[24px] font-semibold tracking-[0.18em]">{code}</p>
            <p className="mt-2 text-[13px] text-sub">Show this at the front desk to earn points for your visit.</p>
          </div>
        </div></Portal>
      )}
    </>
  );
}
