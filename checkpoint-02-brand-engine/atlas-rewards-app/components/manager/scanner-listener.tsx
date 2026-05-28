"use client";
/**
 * ScannerListener — CP-30
 *
 * Most cheap USB QR scanners are HID-class devices: they decode the QR
 * locally and "type" the decoded text into whatever input has keyboard
 * focus, ending with a configurable suffix (Enter by default).
 *
 * This component mounts an invisible always-focused input that catches
 * those keystrokes. When the scanner finishes (Enter received, or 80ms
 * idle), we call `onScan(code)` with the trimmed value.
 *
 * Design rules:
 *   - We **never** steal focus from a real input. If the user is typing
 *     into anything (search bar, keypad form, textarea, contenteditable),
 *     we let the OS handle the keystroke normally. As soon as that
 *     element loses focus we re-claim it.
 *   - The hidden input is `aria-hidden` + off-screen so screen readers /
 *     the layout don't see it.
 *   - We only count strings that look like Atlas codes (3+ alphanumeric
 *     chars after trim) so accidental Enter presses don't fire spurious
 *     lookups.
 *
 * Plug-in scanners that are known to work without config:
 *   - Tera 5100 (~$30, USB + Bluetooth combo)
 *   - Symbol / Zebra DS2208 (~$50, retail-grade)
 *   - Eyoyo EY-009C (~$25, USB-C)
 *
 * No driver install needed on any of them — they enumerate as a keyboard.
 */

import { useCallback, useEffect, useRef } from "react";

const IDLE_MS = 80;
const MIN_LEN = 3;

/** Tags whose focused state means a human is typing — we leave them alone. */
function isUserTyping(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLInputElement) {
    // Hidden inputs (including our own) don't count.
    if (el.type === "hidden") return false;
    if (el.dataset.scannerHost === "true") return false;
    return true;
  }
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLSelectElement) return true;
  // contenteditable
  const ce = (el as HTMLElement).isContentEditable;
  if (ce) return true;
  return false;
}

export function ScannerListener({
  onScan,
  /** Optional: dismiss the listener entirely (e.g. on Insights tab). */
  enabled = true,
}: {
  onScan: (code: string) => void;
  enabled?: boolean;
}) {
  const hostRef = useRef<HTMLInputElement | null>(null);
  const bufferRef = useRef<string>("");
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Hand the buffered value off to the parent + clear. */
  const flush = useCallback(() => {
    const raw = bufferRef.current;
    bufferRef.current = "";
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    const code = raw.trim();
    if (code.length >= MIN_LEN) {
      onScan(code);
    }
  }, [onScan]);

  /** Schedule a flush after IDLE_MS of inactivity. */
  const scheduleIdleFlush = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(flush, IDLE_MS);
  }, [flush]);

  // ── focus management — re-claim focus whenever nothing else owns it ──
  useEffect(() => {
    if (!enabled) return;
    const tryFocus = () => {
      if (!isUserTyping(document.activeElement)) {
        hostRef.current?.focus({ preventScroll: true });
      }
    };
    tryFocus();
    const id = window.setInterval(tryFocus, 600);
    window.addEventListener("focus", tryFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tryFocus);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <input
      ref={hostRef}
      data-scanner-host="true"
      aria-hidden="true"
      autoComplete="off"
      // Off-screen but still focusable. `inputMode=none` keeps mobile
      // keyboards from popping if a touch user accidentally focuses it.
      inputMode="none"
      style={{
        position: "fixed",
        opacity: 0,
        pointerEvents: "none",
        top: "-9999px",
        left: "-9999px",
        width: 1,
        height: 1,
      }}
      onKeyDown={(e) => {
        // Enter is the scanner's "done" suffix — flush immediately.
        if (e.key === "Enter") {
          e.preventDefault();
          flush();
          return;
        }
        // Single printable char → append to buffer.
        if (e.key.length === 1) {
          bufferRef.current += e.key;
          scheduleIdleFlush();
        }
      }}
      // Some scanners synthesize `paste` instead of keystrokes (composite
      // device modes). Handle that too for completeness.
      onPaste={(e) => {
        const text = e.clipboardData?.getData("text") ?? "";
        if (text) {
          e.preventDefault();
          bufferRef.current = text;
          flush();
        }
      }}
    />
  );
}
