"use client";
import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEMO_BOOKING_TARGET, ANCHORS } from "@/lib/landing/config";
import { track, type LandingEvent } from "@/lib/landing/analytics";
import { useLanding } from "./landing-providers";

const base =
  "lp-focus inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-[-0.01em] transition-all duration-200 select-none whitespace-nowrap";
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
  const cls = cn(
    base,
    sizes[size],
    "lp-cta-primary text-[#06101a] bg-white hover:bg-cyan-50 active:translate-y-px",
    className,
  );
  const onClick = () => {
    track(event, { source });
    if (DEMO_BOOKING_TARGET === "modal") openDemo(source);
  };
  if (DEMO_BOOKING_TARGET !== "modal") {
    return (
      <Link href={DEMO_BOOKING_TARGET} className={cls} onClick={() => track(event, { source })} target="_blank" rel="noopener">
        {children} <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick} data-track={event}>
      {children} <ArrowRight className="h-4 w-4" aria-hidden />
    </button>
  );
}

/** Secondary action — scrolls to the VSL. */
export function WatchCta({
  source,
  size = "lg",
  className,
  children = "Watch the 2-minute demo",
}: {
  source: string;
  size?: keyof typeof sizes;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <a
      href={`#${ANCHORS.vsl}`}
      className={cn(
        base,
        sizes[size],
        "text-white border border-white/15 bg-white/[0.04] hover:bg-white/[0.09] hover:border-white/25 backdrop-blur-sm",
        className,
      )}
      onClick={() => track("demo_clicked", { source, kind: "watch" })}
    >
      <span className="grid h-6 w-6 place-items-center rounded-full bg-cyan-400/15 text-cyan-300">
        <Play className="h-3 w-3 fill-current" aria-hidden />
      </span>
      {children}
    </a>
  );
}
