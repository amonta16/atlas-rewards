"use client";
/**
 * The buttons that do something (Subscribe, Book, Redeem). Guests hit the
 * sign-in gate first; signed-in patients get a sheet with the clinic's
 * ways to finish: book online, call, or text with a prefilled message.
 */
import { useState } from "react";
import type { BookingOptions } from "@/lib/medspa";
import { useGate } from "./gate";
import { IcCalendar, IcChat, IcClose, IcPhone } from "./icons";
import { Portal } from "./portal";
import { formatPhone } from "@/lib/format";

export type SheetCopy = { title: string; body: string };

export function ActionButton({ label, sheet, options, className = "btn-ink", children }: {
  label: string; sheet: SheetCopy; options: BookingOptions; className?: string; children?: React.ReactNode;
}) {
  const { require } = useGate();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => require(() => setOpen(true))}>{children ?? label}</button>
      {open && <Portal><ContactSheet copy={sheet} options={options} onClose={() => setOpen(false)} /></Portal>}
    </>
  );
}

export function ContactSheet({ copy, options, onClose }: { copy: SheetCopy; options: BookingOptions; onClose: () => void }) {
  const sms = options.sms ? `sms:${options.sms}${/iPhone|iPad/.test(typeof navigator === "undefined" ? "" : navigator.userAgent) ? "&" : "?"}body=${encodeURIComponent(options.message)}` : null;
  const rows = [
    options.url && { href: options.url, label: "Book online", sub: "Pick a time that works", Icon: IcCalendar, external: true },
    sms && { href: sms, label: "Text the clinic", sub: "We'll reply with times", Icon: IcChat, external: false },
    options.phone && { href: `tel:${options.phone}`, label: "Call the clinic", sub: formatPhone(options.phone), Icon: IcPhone, external: false },
  ].filter(Boolean) as { href: string; label: string; sub: string; Icon: typeof IcPhone; external: boolean }[];

  return (
    <div className="fixed inset-0 z-[60] animate-fade bg-black/40" onClick={onClose}>
      <div
        role="dialog" aria-modal
        className="absolute inset-x-0 bottom-0 mx-auto max-w-md animate-sheet rounded-t-[26px] bg-white px-5 pt-3"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[21px] font-semibold tracking-[-0.01em]">{copy.title}</h2>
            <p className="mt-1 text-[14.5px] leading-snug text-sub">{copy.body}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-page"><IcClose className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 space-y-2.5">
          {rows.length === 0 && <p className="rounded-card bg-page p-4 text-[14.5px] text-sub">Ask the front desk on your next visit.</p>}
          {rows.map(({ href, label, sub, Icon, external }) => (
            <a key={label} href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}
              className="flex items-center gap-3.5 rounded-card bg-page px-4 py-3.5 transition active:scale-[0.99]">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink shadow-card"><Icon className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block text-[16px] font-semibold">{label}</span>
                <span className="block truncate text-[13.5px] text-sub">{sub}</span>
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
