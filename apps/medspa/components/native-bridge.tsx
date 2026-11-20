"use client";
/**
 * Mounted once in the root layout. Inside the Android app it listens for
 * notification taps and opens the push's screen; on the web it does nothing.
 */
import { useEffect } from "react";
import { listenForPushTaps } from "@/lib/native";

export function NativeBridge() {
  useEffect(() => {
    listenForPushTaps((path) => {
      if (path !== window.location.pathname + window.location.search) window.location.assign(path);
    });
  }, []);
  return null;
}
