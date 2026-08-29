"use client";
/**
 * hq-ui.tsx — CP-111
 *
 * Shared primitives for the Founder Headquarters + Revenue Analytics
 * command-center surfaces. One place defines the "refined Stark" look:
 * deep navy canvas, glass panels with thin cyan hairlines, amber reserved
 * for warnings, red only for destructive actions.
 */
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ───────────────────────────── Tokens ───────────────────────────── */

export const HQ = {
  canvas: "linear-gradient(180deg, #061a32 0%, #04132a 50%, #020c1c 100%)",
  panel: {
    background: "linear-gradient(180deg, rgba(56,189,248,0.07), rgba(255,255,255,0.02))",
    border: "1px solid rgba(56,189,248,0.16)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 30px -12px rgba(0,0,0,0.6)",
  } as React.CSSProperties,
  panelSoft: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
  } as React.CSSProperties,
  cyan: "#38bdf8",
  amber: "#fbbf24",
  emerald: "#34d399",
  rose: "#fb7185",
};

/** Standard input styling on the dark canvas. */
export const fieldCls =
  "w-full h-10 rounded-lg bg-white/5 border border-white/10 px-3 text-sm text-white " +
  "placeholder:text-sky-200/30 outline-none focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20";

export const areaCls =
  "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white " +
  "placeholder:text-sky-200/30 outline-none focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20 min-h-[72px]";

export const selectCls =
  "w-full h-10 rounded-lg bg-white/5 border border-white/10 px-2.5 text-sm text-white " +
  "outline-none focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/20 [&>option]:bg-slate-800";

/* ───────────────────────────── Panels ───────────────────────────── */

export function GlassPanel({
  id, title, subtitle, icon, right, children, className,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("relative rounded-2xl p-5 overflow-hidden scroll-mt-24", className)} style={HQ.panel}>
      <div className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full blur-3xl opacity-20"
        style={{ background: HQ.cyan }} />
      <div className="relative flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2.5 min-w-0">
          {icon && (
            <span className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-sky-400/15 border border-sky-400/20 flex items-center justify-center text-sky-300">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white tracking-tight">{title}</h2>
            {subtitle && <p className="text-[12px] text-sky-200/50 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

/** Small pill-shaped status/priority chip. */
export function Chip({ tone = "sky", children, className }: {
  tone?: "sky" | "amber" | "emerald" | "rose" | "slate" | "violet";
  children: React.ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    sky:     "bg-sky-400/12 text-sky-200 border-sky-400/25",
    amber:   "bg-amber-400/12 text-amber-200 border-amber-400/30",
    emerald: "bg-emerald-400/12 text-emerald-200 border-emerald-400/25",
    rose:    "bg-rose-400/12 text-rose-200 border-rose-400/25",
    slate:   "bg-white/8 text-sky-100/70 border-white/12",
    violet:  "bg-violet-400/12 text-violet-200 border-violet-400/25",
  };
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
      tones[tone], className)}>
      {children}
    </span>
  );
}

/* ───────────────────────────── Buttons ──────────────────────────── */

export function HqButton({
  kind = "primary", className, type = "button", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "primary" | "ghost" | "outline" | "danger";
}) {
  const kinds: Record<string, string> = {
    primary: "bg-sky-400 text-slate-900 hover:bg-sky-300 font-semibold shadow-[0_0_18px_-6px_rgba(56,189,248,0.8)]",
    outline: "border border-sky-400/30 text-sky-100 hover:bg-sky-400/10",
    ghost:   "text-sky-200/70 hover:text-white hover:bg-white/8",
    danger:  "bg-rose-500/90 text-white hover:bg-rose-500 font-semibold",
  };
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg h-9 px-3.5 text-sm transition-colors",
        "disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/50",
        kinds[kind], className)}
      {...props}
    />
  );
}

/* ───────────────────────────── Modal ────────────────────────────── */

/**
 * Dark modal shell used by every HQ editor. Closes on Escape and on
 * backdrop click; traps initial focus on the panel.
 */
export function HqModal({
  title, subtitle, onClose, children, wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog" aria-modal="true" aria-label={title}
    >
      <div
        ref={ref} tabIndex={-1}
        className={cn("w-full rounded-2xl overflow-hidden outline-none my-4", wide ? "max-w-2xl" : "max-w-lg")}
        style={{
          background: "linear-gradient(180deg, #0a2340 0%, #061a32 100%)",
          border: "1px solid rgba(56,189,248,0.25)",
          boxShadow: "0 24px 80px -20px rgba(0,0,0,0.9), 0 0 40px -18px rgba(56,189,248,0.5)",
        }}
      >
        <div className="px-5 pt-4 pb-3 flex items-start justify-between border-b border-white/10">
          <div>
            <h2 className="text-base font-bold text-white">{title}</h2>
            {subtitle && <p className="text-[12px] text-sky-200/50 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose} aria-label="Close"
            className="h-8 w-8 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center text-sky-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/** Labeled field wrapper for modal forms. */
export function Field({ label, required, hint, error, children }: {
  label: string; required?: boolean; hint?: string; error?: string | null; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-widest text-sky-200/60 mb-1.5">
        {label}{required && <span className="text-sky-300"> *</span>}
      </span>
      {children}
      {error
        ? <span className="block text-[11px] text-amber-300 mt-1">{error}</span>
        : hint && <span className="block text-[11px] text-sky-200/35 mt-1">{hint}</span>}
    </label>
  );
}

/** Consistent empty-state block. */
export function EmptyState({ icon, title, hint, action }: {
  icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-8 text-center">
      {icon && <div className="mx-auto mb-2 h-10 w-10 rounded-full bg-sky-400/10 border border-sky-400/20 flex items-center justify-center text-sky-300">{icon}</div>}
      <div className="text-sm font-semibold text-white">{title}</div>
      {hint && <div className="text-[12px] text-sky-200/50 mt-1 max-w-sm mx-auto">{hint}</div>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}
