"use client";
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/**
 * Renders overlays at the end of <body>, above sticky bars and the tab bar.
 * Nothing on the server or during hydration; an overlay opened after that
 * renders in the same commit (CP-248: a glide can capture it right away).
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  return client ? createPortal(children, document.body) : null;
}
