"use client";
/**
 * ScannerListener — CP-30, rewritten CP-98.
 *
 * Most cheap USB QR scanners are HID-class devices: they decode the QR
 * locally and "type" the decoded text as keystrokes, ending with a
 * configurable suffix (Enter by default).
 *
 * CP-30 caught those keystrokes with an invisible always-focused input +
 * a 600ms focus-reclaim poll. That design had a race: any scan that
 * started while focus was elsewhere (right after a button click, a
 * closed dialog, a tab switch) fell into the void until the next poll
 * tick — the front desk experienced it as "I have to scan twice".
 *
 * CP-98: no hidden input, no focus juggling. A window-level capture
 * keydown listener buffers scanner keystrokes NO MATTER what has focus,
 * so a scan can never be dropped. The one exception is unchanged: if a
 * human is typing into a real input/textarea/select/contenteditable, we
 * leave every keystroke alone (the code-entry form and customer search
 * keep working exactly as before).
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
    // Hidden inputs don't count.
    if (el.type === "hidden") return false;
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
  const bufferRef = useRef<string>("");
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the latest onScan without re-binding the window listener.
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

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
      onScanRef.current(code);
    }
  }, []);

  /** Schedule a flush after IDLE_MS of inactivity. */
  const scheduleIdleFlush = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(flush, IDLE_MS);
  }, [flush]);

  // ── window-level capture listeners — focus-independent ──
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Never interfere with shortcuts (Cmd/Ctrl/Alt combos).
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // A human typing into a real field owns the keyboard — untouched.
      if (isUserTyping(document.activeElement)) return;

      if (e.key === "Enter") {
        // Enter is the scanner's "done" suffix — flush if a scan is
        // buffered. A bare Enter (no buffer) stays a normal keypress so
        // buttons/links keep their native behavior.
        if (bufferRef.current.trim().length >= MIN_LEN) {
          e.preventDefault();
          e.stopPropagation();
          flush();
        } else {
          bufferRef.current = "";
        }
        return;
      }
      // Single printable char → append to buffer.
      if (e.key.length === 1) {
        bufferRef.current += e.key;
        scheduleIdleFlush();
      }
    };

    // Some scanners synthesize `paste` instead of keystrokes (composite
    // device modes). Handle that too for completeness.
    const onPaste = (e: ClipboardEvent) => {
      if (isUserTyping(document.activeElement)) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (text) {
        e.preventDefault();
        bufferRef.current = text;
        flush();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("paste", onPaste, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("paste", onPaste, true);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      bufferRef.current = "";
    };
  }, [enabled, flush, scheduleIdleFlush]);

  return null;
}
