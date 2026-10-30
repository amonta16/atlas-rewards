"use client";
import { cn } from "@/lib/utils";

/**
 * Realistic iPhone-style frame for previewing the customer-facing PWA.
 * Renders a Dynamic Island notch, side buttons, rounded corners, and a status bar.
 * Pure CSS — no images needed.
 */
export function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative mx-auto", className)} style={{ width: 320 }}>
      {/* Side buttons */}
      <div className="absolute -left-[3px] top-24 h-8 w-[3px] rounded-l-sm bg-zinc-700" />
      <div className="absolute -left-[3px] top-40 h-14 w-[3px] rounded-l-sm bg-zinc-700" />
      <div className="absolute -left-[3px] top-60 h-14 w-[3px] rounded-l-sm bg-zinc-700" />
      <div className="absolute -right-[3px] top-32 h-20 w-[3px] rounded-r-sm bg-zinc-700" />

      {/* Outer frame */}
      <div className="rounded-[2.75rem] bg-zinc-900 p-2 shadow-2xl ring-1 ring-zinc-800">
        {/* Inner bezel */}
        <div className="rounded-[2.25rem] bg-black p-1">
          {/* Screen */}
          <div className="relative overflow-hidden rounded-[2rem] bg-white" style={{ aspectRatio: "9/19.5" }}>
            {/* Status bar */}
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 pt-3 pb-1 text-[10px] font-semibold text-zinc-900">
              <span>9:41</span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded-sm border border-zinc-900" />
                <span className="inline-block h-2 w-3 rounded-sm border border-zinc-900" />
                <span className="inline-block h-2 w-5 rounded-sm bg-zinc-900" />
              </span>
            </div>

            {/* Dynamic Island */}
            <div className="absolute left-1/2 top-1.5 z-20 -translate-x-1/2 h-6 w-24 rounded-full bg-black" />

            {/* Content (scrollable, scrollbar hidden) */}
            <div className="absolute inset-0 overflow-y-auto pt-7 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
