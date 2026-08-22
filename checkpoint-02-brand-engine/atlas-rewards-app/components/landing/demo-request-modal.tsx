"use client";
import { useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { DemoRequestForm } from "./demo-request-form";

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
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-[#04070c]/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={`lp-root ${className} fixed left-1/2 top-1/2 z-[100] w-[calc(100%-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-[#0b1017] p-6 sm:p-8 text-white shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 max-h-[calc(100dvh-2rem)] overflow-y-auto`}
          aria-describedby="demo-desc"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-2xl font-semibold tracking-tight">Book your free demo</Dialog.Title>
              <Dialog.Description id="demo-desc" className="mt-1 text-sm text-zinc-400">
                20 minutes. We&apos;ll show you the app, the front-desk flow, and what it would look like in your brand.
              </Dialog.Description>
            </div>
            <Dialog.Close className="lp-focus -mr-2 -mt-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Close">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="mt-6">
            <DemoRequestForm source={source} firstFieldRef={first} onDone={onClose} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
