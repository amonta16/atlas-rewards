"use client";
import { createElement, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Scroll-reveal primitive — CP-100.
 * Dependency-free: IntersectionObserver toggles `.lp-in`, CSS does the rest
 * (see globals.css `.lp-reveal`). Respects prefers-reduced-motion via CSS.
 */
export function useInView<T extends HTMLElement>(opts: { once?: boolean; margin?: string; threshold?: number } = {}) {
  const { once = true, margin = "0px 0px -10% 0px", threshold = 0.1 } = opts;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            if (once) io.unobserve(el);
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { rootMargin: margin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once, margin, threshold]);
  return { ref, inView };
}

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "article";
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return createElement(
    Tag,
    {
      ref,
      className: cn("lp-reveal", inView && "lp-in", className),
      style: { transitionDelay: `${delay}ms` },
    },
    children,
  );
}
