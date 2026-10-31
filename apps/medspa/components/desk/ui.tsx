"use client";
/** Shared desk building blocks (soft cards, modal, empty state). */
import { useEffect } from "react";
import { IcCalendar, IcClose } from "../icons";

export function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] grid animate-fade place-items-center bg-black/35 px-4" onClick={onClose}>
      <div role="dialog" aria-modal className={`max-h-[calc(100dvh-2rem)] w-full ${wide ? "max-w-[640px]" : "max-w-[420px]"} animate-rise overflow-y-auto rounded-[26px] bg-white p-6 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-[19px] font-semibold">{title}</h3><button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-page"><IcClose className="h-4 w-4" /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-[24px] bg-white p-5 shadow-[0_10px_30px_-24px_rgba(23,27,38,.45)] ${className}`}>
      <h3 className="mb-3.5 text-[16px] font-semibold">{title}</h3>
      {children}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="rounded-[24px] bg-white px-6 py-10 text-center text-[15px] text-sub shadow-[0_10px_30px_-24px_rgba(23,27,38,.45)]"><IcCalendar className="mx-auto mb-3 h-7 w-7 text-faint" />{text}</div>;
}
