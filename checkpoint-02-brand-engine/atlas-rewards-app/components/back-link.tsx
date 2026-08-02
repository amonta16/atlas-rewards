"use client";
/**
 * BackLink — CP-96.1
 *
 * "← Back" affordance for the /legal and /support pages. Crucial inside
 * the native app: the webview has NO browser chrome, so without this a
 * customer who opens Terms from their Profile tab would be stranded on
 * the page. Uses history.back() so it returns to exactly where they were
 * (their business's app), and hides itself when there's no history to go
 * back to (e.g. the page was opened directly from a link).
 */
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

export function BackLink() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { setShow(window.history.length > 1); } catch { /* ignore */ }
  }, []);
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-zinc-900"
      aria-label="Go back"
    >
      <ArrowLeft className="h-4 w-4" /> Back
    </button>
  );
}
