"use client";
/**
 * "Subscribe now!" that really charges: sign-in gate → Stripe Checkout on
 * the clinic's own Stripe account. If the clinic hasn't connected Stripe
 * (or Stripe is down), it falls back to the book / text / call sheet so the
 * patient can still join.
 */
import { useState } from "react";
import type { BookingOptions } from "@/lib/medspa";
import { useGate } from "./gate";
import { ContactSheet, type SheetCopy } from "./action-sheet";
import { Portal } from "./portal";

export function SubscribeButton({ slug, planId, label, fallbackSheet, options }: {
  slug: string; planId: string; label: string; fallbackSheet: SheetCopy; options: BookingOptions;
}) {
  const { require } = useGate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);

  async function start() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/${slug}/checkout`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; fallback?: boolean; error?: string };
      if (data.url) { window.location.href = data.url; return; }
      if (data.fallback) setFallback(true);
      else setError(data.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("No connection. Please try again.");
    }
    setBusy(false);
  }

  return (
    <>
      <button type="button" className="btn-ink" disabled={busy} onClick={() => require(start)}>
        {busy ? "Opening secure checkout…" : label}
      </button>
      {error && <p className="text-center text-[13.5px] text-red-600">{error}</p>}
      {fallback && <Portal><ContactSheet copy={fallbackSheet} options={options} onClose={() => setFallback(false)} /></Portal>}
    </>
  );
}

/** Profile row: Stripe's billing portal (card, receipts, cancel). Falls back to calling the clinic. */
export function ManageMembershipRow({ slug, phone, children }: { slug: string; phone: string | null; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function open() {
    setBusy(true); setNote(null);
    try {
      const res = await fetch(`/api/${slug}/portal`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      if (data.url) { window.location.href = data.url; return; }
    } catch { /* fall through */ }
    setBusy(false);
    setNote(phone ? "To change or cancel your membership, call the clinic." : "To change or cancel your membership, ask the front desk.");
  }

  return (
    <li>
      <button type="button" onClick={open} disabled={busy} className="flex w-full items-center gap-3.5 px-4 py-4 text-left">
        {children}
      </button>
      {note && <p className="-mt-2 px-4 pb-3 pl-[3.1rem] text-[13px] text-sub">{note}</p>}
    </li>
  );
}
