"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Renders overlays at the end of <body>, above sticky bars and the tab bar. */
export function Portal({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}
