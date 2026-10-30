"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { DemoRequestModal, type QuizRenderer } from "./demo-request-modal";
import { VideoModal } from "./video-modal";

/**
 * Landing-wide context — CP-100/101.
 * Any CTA can call `openDemo(source)` or `openVideo(source)`; the single
 * booking modal + single video modal live here.
 */
type Ctx = { openDemo: (source: string) => void; openVideo: (source: string) => void };
const LandingCtx = createContext<Ctx>({ openDemo: () => {}, openVideo: () => {} });

export function useLanding() {
  return useContext(LandingCtx);
}

export function LandingProviders({ children, fontClassName = "", renderQuiz }: { children: ReactNode; fontClassName?: string; renderQuiz?: QuizRenderer }) {
  const [open, setOpen] = useState(false);
  const [video, setVideo] = useState(false);
  const [source, setSource] = useState("unknown");
  const openDemo = useCallback((s: string) => {
    setSource(s);
    setOpen(true);
  }, []);
  const openVideo = useCallback((s: string) => {
    setSource(s);
    setVideo(true);
  }, []);
  return (
    <LandingCtx.Provider value={{ openDemo, openVideo }}>
      {children}
      <DemoRequestModal open={open} source={source} onClose={() => setOpen(false)} className={fontClassName} renderQuiz={renderQuiz} />
      <VideoModal open={video} onClose={() => setVideo(false)} className={fontClassName} />
    </LandingCtx.Provider>
  );
}
