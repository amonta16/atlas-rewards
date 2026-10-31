"use client";
/** A saved gift's desk code: QR (the redeem code, as the venue desk scanner expects) + the code in big type. */
import { useState } from "react";
import QRCode from "react-qr-code";
import { IcClose, IcGift } from "./icons";
import { Portal } from "./portal";

export function GiftCodeModal({ title, code, expiresAt, onClose }: { title: string; code: string | null; expiresAt: string | null; onClose: () => void }) {
  return (
    <Portal><div className="fixed inset-0 z-[60] grid animate-fade place-items-center bg-black/45 px-6" onClick={onClose}>
      <div role="dialog" aria-modal className="relative w-full max-w-[340px] animate-rise rounded-[24px] bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-page"><IcClose className="h-4 w-4" /></button>
        <p className="eyebrow">Your gift</p>
        <h2 className="mt-2 text-[21px] font-semibold leading-tight">{title}</h2>
        {code ? (
          <>
            <div className="mx-auto mt-5 w-fit rounded-[18px] bg-white p-3 ring-1 ring-line"><QRCode value={code} size={168} fgColor="#0a0a0a" bgColor="#ffffff" /></div>
            <p className="mt-4 font-mono text-[26px] font-semibold tracking-[0.18em]">{code}</p>
            <p className="mt-2 text-[13px] text-sub">Show this at the front desk.{expiresAt ? ` Use by ${new Date(expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.` : ""}</p>
          </>
        ) : (
          <p className="mt-4 text-[14px] text-sub">Mention this gift at the front desk and they&apos;ll apply it.</p>
        )}
      </div>
    </div></Portal>
  );
}

export function GiftRow({ title, code, expiresAt }: { title: string; code: string | null; expiresAt: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3.5 rounded-card bg-white p-4 text-left shadow-card">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[12px] bg-tint text-brand"><IcGift className="h-6 w-6" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15.5px] font-semibold">{title}</span>
          <span className="block text-[13px] text-sub">Gift{code ? ` · ${code}` : ""}</span>
        </span>
        <span className="rounded-full bg-black px-3.5 py-2 text-[13px] font-semibold text-white">Show</span>
      </button>
      {open && <GiftCodeModal title={title} code={code} expiresAt={expiresAt} onClose={() => setOpen(false)} />}
    </>
  );
}
