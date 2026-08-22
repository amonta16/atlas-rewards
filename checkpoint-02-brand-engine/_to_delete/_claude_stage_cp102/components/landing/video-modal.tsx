"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { VideoPlayer } from "./video-player";
import { VSL } from "@/lib/landing/config";

/**
 * VSL modal — CP-101. Opened by every "Watch the demo" CTA. The player
 * inside is the same VideoPlayer (external embed / mp4 / placeholder), so
 * pasting one URL into lib/landing/config.ts updates both places.
 */
export function VideoModal({ open, onClose, className = "" }: { open: boolean; onClose: () => void; className?: string }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-[#14213d]/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content className={`lp-root ${className} fixed left-1/2 top-1/2 z-[100] w-[calc(100%-1.5rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-transparent p-0 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95`}>
          <Dialog.Title className="sr-only">{VSL.title}</Dialog.Title>
          <Dialog.Description className="sr-only">Atlas Engine product demo video</Dialog.Description>
          <Dialog.Close className="lp-light lp-focus absolute -top-11 right-0 grid h-9 w-9 place-items-center rounded-lg bg-white/90 text-[#14213d] hover:bg-white" aria-label="Close video">
            <X className="h-5 w-5" />
          </Dialog.Close>
          {open && <VideoPlayer autoStart />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
