"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { DemoRequestModal } from "./demo-request-modal";

/**
 * Landing-wide context — CP-100.
 * Any CTA can call `openDemo(source)`; the single modal lives here so the
 * page never mounts more than one dialog.
 */
type Ctx = { openDemo: (source: string) => void };
const LandingCtx = createContext<Ctx>({ openDemo: () => {} });

export function useLanding() {
  return useContext(LandingCtx);
}

export function LandingProviders({ children, fontClassName = "" }: { children: ReactNode; fontClassName?: string }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("unknown");
  const openDemo = useCallback((s: string) => {
    setSource(s);
    setOpen(true);
  }, []);
  return (
    <LandingCtx.Provider value={{ openDemo }}>
      {children}
      <DemoRequestModal open={open} source={source} onClose={() => setOpen(false)} className={fontClassName} />
    </LandingCtx.Provider>
  );
}
