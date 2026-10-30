"use client";
import { useEffect, type ReactNode } from "react";
import { track } from "@/lib/landing/analytics";
import { useLanding } from "./landing-providers";

/**
 * Opens the quiz popup (the single DemoRequestModal in LandingProviders).
 * `autoOpen` pops it once on arrival — for pages whose only job is the quiz.
 */
export function QuizLauncher({ source, className, children, autoOpen = false }: { source: string; className?: string; children: ReactNode; autoOpen?: boolean }) {
  const { openDemo } = useLanding();
  useEffect(() => {
    if (!autoOpen) return;
    const t = setTimeout(() => openDemo(source), 350);
    return () => clearTimeout(t);
  }, [autoOpen, openDemo, source]);
  return (
    <button type="button" className={className} onClick={() => { track("demo_clicked", { source }); openDemo(source); }}>
      {children}
    </button>
  );
}
