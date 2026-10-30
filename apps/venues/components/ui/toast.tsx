"use client";
/**
 * Minimal toast system — CP-31.
 *
 * Zero-dependency. Provider mounts a fixed-bottom-right region and renders
 * any active toasts. Use anywhere via:
 *
 *   const { toast } = useToast();
 *   toast.success("Saved!");
 *   toast.error("Couldn't reach the server.");
 *
 * Replaces ad-hoc `alert(...)` calls scattered across the agency / manager
 * components. Friendlier UX, dismisses automatically after ~4.5s, and stays
 * out of the way of modals / popups (z-50 so it sits above page chrome but
 * below z-60 dialogs like the offer reveal popup).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Check, AlertTriangle, Info, X } from "lucide-react";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };

type Ctx = {
  toast: {
    success: (m: string) => void;
    error:   (m: string) => void;
    info:    (m: string) => void;
  };
};

const ToastCtx = createContext<Ctx | null>(null);

let _nextId = 1;
const DURATION_MS = 4500;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = _nextId++;
    setItems((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, DURATION_MS);
  }, []);

  // CP-42 hotfix: the value object was being recreated every render,
  // which made every consumer that captured `toast` (e.g. team-members.tsx
  // via useCallback deps) re-fire its effect every render — the source
  // of the "Couldn't load team — not authenticated" toast flood.
  // useMemo + the stable `push` callback gives consumers a stable identity.
  const value: Ctx = useMemo(() => ({
    toast: {
      success: (m: string) => push("success", m),
      error:   (m: string) => push("error",   m),
      info:    (m: string) => push("info",    m),
    },
  }), [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <Toaster items={items} onClose={(id) => setItems((prev) => prev.filter((t) => t.id !== id))} />
    </ToastCtx.Provider>
  );
}

export function useToast(): Ctx {
  const ctx = useContext(ToastCtx);
  // Soft fallback so components don't crash when used outside the provider —
  // they just get a no-op toast (still useful in tests / storybook).
  if (!ctx) {
    return {
      toast: {
        success: (m) => console.info("[toast]", m),
        error:   (m) => console.error("[toast]", m),
        info:    (m) => console.info("[toast]", m),
      },
    };
  }
  return ctx;
}

/* ─────────────────────────── presentation ─────────────────────────── */

function Toaster({ items, onClose }: { items: ToastItem[]; onClose: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-[calc(100%-2rem)]">
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onClose={() => onClose(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  // Tiny slide-in on mount.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOpen(true), 10);
    return () => clearTimeout(t);
  }, []);

  const palette = {
    success: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900", iconBg: "bg-emerald-500", Icon: Check },
    error:   { bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-900",    iconBg: "bg-rose-500",    Icon: AlertTriangle },
    info:    { bg: "bg-zinc-50",    border: "border-zinc-200",    text: "text-zinc-900",    iconBg: "bg-zinc-500",    Icon: Info },
  }[item.kind];

  const Icon = palette.Icon;

  return (
    <div
      role="status"
      className={
        "pointer-events-auto rounded-2xl border shadow-lg p-3 flex items-start gap-3 transition-all duration-200 " +
        palette.bg + " " + palette.border + " " + palette.text + " " +
        (open ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0")
      }
    >
      <div className={"h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-white " + palette.iconBg}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-sm font-medium flex-1 leading-snug pt-1">{item.message}</div>
      <button
        type="button"
        onClick={onClose}
        className="h-6 w-6 rounded-full hover:bg-black/5 flex items-center justify-center shrink-0 text-current/60"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
