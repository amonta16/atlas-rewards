"use client";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { ANCHORS, DEMO_BOOKING_TARGET } from "@/lib/landing/config";
import { track, type LandingEvent } from "@/lib/landing/analytics";
import { useLanding } from "./landing-providers";

const base =
  "lp-focus inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em] transition-all duration-200 select-none whitespace-nowrap";
const sizes = {
  md: "h-11 px-5 text-[15px]",
  lg: "h-[52px] px-7 text-base",
  xl: "h-14 px-8 text-[17px]",
};

/** Primary conversion action — ONE objective across the whole page. */
export function DemoCta({
  source,
  event = "demo_clicked",
  size = "lg",
  className,
  children = "Book a free demo",
}: {
  source: string;
  event?: LandingEvent;
  size?: keyof typeof sizes;
  className?: string;
  children?: React.ReactNode;
}) {
  const { openDemo } = useLanding();
  const cls = cn(base, sizes[size], "lp-cta-primary bg-[#14213d] text-white hover:bg-[#1f5f8b] active:translate-y-px", className);
  if (DEMO_BOOKING_TARGET !== "modal") {
    return (
      <Link href={DEMO_BOOKING_TARGET} className={cls} onClick={() => track(event, { source })} target="_blank" rel="noopener">
        {children} <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={cls}
      onClick={() => {
        track(event, { source });
        openDemo(source);
      }}
      data-track={event}
    >
      {children} <ArrowRight className="h-4 w-4" aria-hidden />
    </button>
  );
}

/** Secondary action — outlined, scrolls to the app picker. */
export function PreviewCta({
  source,
  size = "lg",
  className,
  children = "Preview your app",
}: {
  source: string;
  size?: keyof typeof sizes;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={`#${ANCHORS.demo}`}
      className={cn(base, sizes[size], "border border-[#14213d]/20 bg-white text-[#14213d] hover:border-[#14213d]/50 hover:bg-[#f3f7fb]", className)}
      onClick={() => track("demo_clicked", { source, kind: "preview" })}
    >
      {children}
    </a>
  );
}

/** Tertiary — opens the video modal. */
export function WatchCta({
  source,
  size = "lg",
  className,
  tone = "light",
  children = "Watch the 2-minute demo",
}: {
  source: string;
  size?: keyof typeof sizes;
  className?: string;
  /** "dark" when placed on a navy surface. */
  tone?: "light" | "dark";
  children?: React.ReactNode;
}) {
  const { openVideo } = useLanding();
  return (
    <button
      type="button"
      className={cn(
        base,
        sizes[size],
        tone === "dark"
          ? "border border-white/30 bg-white/10 text-white hover:border-white/60 hover:bg-white/20"
          : "border border-[#14213d]/20 bg-white text-[#14213d] hover:border-[#14213d]/50 hover:bg-[#f3f7fb]",
        className,
      )}
      onClick={() => {
        track("demo_clicked", { source, kind: "watch" });
        openVideo(source);
      }}
    >
      <span className={cn("grid h-6 w-6 place-items-center rounded-full", tone === "dark" ? "bg-white/20 text-white" : "bg-[#1f5f8b]/10 text-[#1f5f8b]")}>
        <Play className="h-3 w-3 fill-current" aria-hidden />
      </span>
      {children}
    </button>
  );
}

// CP-145: light redesign — navy pill primary, outlined secondary. PreviewCta added.
