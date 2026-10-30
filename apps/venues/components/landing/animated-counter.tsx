"use client";
import { useEffect, useState } from "react";
import { useInView } from "./reveal";

/**
 * Counts from `from` to `to` when scrolled into view — CP-100.
 * Reduced-motion users see the final value immediately.
 */
export function AnimatedCounter({
  from = 0,
  to,
  duration = 1400,
  prefix = "",
  suffix = "",
  decimals = 0,
  className,
  start,
}: {
  from?: number;
  to: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  /** Optional external trigger; when omitted the counter starts on scroll. */
  start?: boolean;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>({ threshold: 0.4 });
  const go = start ?? inView;
  const [value, setValue] = useState(from);

  useEffect(() => {
    if (!go) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setValue(to);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [go, from, to, duration]);

  const text = value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <span ref={ref} className={className} aria-live="off">
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
