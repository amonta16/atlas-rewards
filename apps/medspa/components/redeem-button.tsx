"use client";
import { useState } from "react";
import { useGate } from "./gate";
import { IcClose } from "./icons";
import { formatPhone } from "@/lib/format";
import { Portal } from "./portal";

/** Rewards are redeemed at the desk: staff look the patient up by phone. */
export function RedeemButton({ reward, ready, phone, clinic }: { reward: string; ready: boolean; phone: string | null; clinic: string }) {
  const { require } = useGate();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" disabled={!ready} onClick={() => require(() => setOpen(true))}
        className={`h-9 rounded-full px-4 text-[13.5px] font-semibold ${ready ? "bg-black text-white" : "bg-page text-faint"}`}>
        Redeem
      </button>
      {open && (
        <Portal><div className="fixed inset-0 z-[60] grid animate-fade place-items-center bg-black/45 px-6" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal className="relative w-full max-w-[340px] animate-rise rounded-[24px] bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-page"><IcClose className="h-4 w-4" /></button>
            <p className="eyebrow">Show the front desk</p>
            <h2 className="mt-2 text-[21px] font-semibold leading-tight">{reward}</h2>
            <p className="mt-4 text-[14px] text-sub">Staff at {clinic} will look you up by this number and redeem it for you.</p>
            <p className="mt-3 rounded-[16px] bg-page py-4 text-[26px] font-semibold tabular-nums tracking-wide">{formatPhone(phone)}</p>
          </div>
        </div></Portal>
      )}
    </>
  );
}
