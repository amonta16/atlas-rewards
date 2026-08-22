"use client";
import { useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { BookingCalendar } from "./booking-calendar";

/**
 * In-house "book a demo" dialog — CP-100.
 * Radix Dialog (already a dependency) gives focus-trap, ESC, aria wiring.
 */
export function DemoRequestModal({ open, source, onClose, className = "" }: { open: boolean; source: string; onClose: () => void; className?: string }) {
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => first.current?.focus(), 50);
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-[#062a44]/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={`lp-root lp-light ${className} fixed left-1/2 top-1/2 z-[100] w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#e8dfd1] bg-white p-6 sm:p-8 text-[#14213d] shadow-[0_30px_80px_-20px_rgba(20,33,61,0.35)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 max-h-[calc(100dvh-2rem)] overflow-y-auto`}
          aria-describedby="demo-desc"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-2xl font-semibold tracking-tight text-[#14213d]">Pick a time for your free demo</Dialog.Title>
              <Dialog.Description id="demo-desc" className="mt-1 text-sm text-slate-600">
                20 minutes. We&apos;ll show you the app, the front-desk flow, and what it would look like in your brand.
              </Dialog.Description>
            </div>
            <Dialog.Close className="lp-focus -mr-2 -mt-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-[#f3ede2] hover:text-[#14213d]" aria-label="Close">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="mt-6">
            <BookingCalendar source={source} firstFieldRef={first} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
