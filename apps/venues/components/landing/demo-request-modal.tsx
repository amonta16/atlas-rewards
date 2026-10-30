"use client";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { DemoBooker } from "./demo-booker";

/**
 * In-house "book a demo" dialog — CP-100.
 * Radix Dialog (already a dependency) gives focus-trap, ESC, aria wiring.
 */
/** CP-182: `renderQuiz` swaps in a niche quiz (e.g. /medspa); default is the venue quiz. */
export type QuizRenderer = (source: string, firstFieldRef: RefObject<HTMLInputElement>) => ReactNode;

export function DemoRequestModal({ open, source, onClose, className = "", renderQuiz }: { open: boolean; source: string; onClose: () => void; className?: string; renderQuiz?: QuizRenderer }) {
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => first.current?.focus(), 50);
  }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-[#062a44]/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={`lp-root lp-light ${className} fixed left-1/2 top-1/2 z-[100] w-[calc(100%-1rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#e8dfd1] bg-white p-5 pt-12 sm:p-8 sm:pt-12 text-[#14213d] shadow-[0_30px_80px_-20px_rgba(20,33,61,0.35)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 max-h-[calc(100dvh-1.5rem)] min-h-[min(640px,calc(100dvh-1.5rem))] overflow-y-auto`}
          aria-describedby="demo-desc"
        >
          <Dialog.Title className="sr-only">Build your app and see what it could add to your business</Dialog.Title>
          <Dialog.Description id="demo-desc" className="sr-only">
            A short quiz: six quick questions, then your estimated added revenue and a time to walk through it with us.
          </Dialog.Description>
          <Dialog.Close className="lp-focus absolute right-3 top-3 z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/90 text-slate-600 shadow-sm ring-1 ring-black/5 hover:bg-[#f3ede2] hover:text-[#14213d]" aria-label="Close">
            <X className="h-5 w-5" />
          </Dialog.Close>
          <div className="pt-2">
            {renderQuiz ? renderQuiz(source, first) : <DemoBooker source={source} firstFieldRef={first} />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
