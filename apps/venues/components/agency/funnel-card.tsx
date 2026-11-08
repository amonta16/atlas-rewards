"use client";
/**
 * FunnelCard — CP-235 · one funnel on Admin → Funnels.
 * The thumbnail is the real page in a scaled, sandboxed iframe (no scripts run, so the
 * Meta Pixel and analytics never fire from the admin). Pages on other hosts get a plain card.
 */
import { useState } from "react";
import { Check, Copy, ExternalLink, Smartphone } from "lucide-react";

export function FunnelCard({ name, what, href, thumbPath, adLink, stat }: {
  name: string; what: string; href: string; thumbPath: string | null; adLink: string | null;
  stat: { label: string; value: number | null } | null;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!adLink) return;
    try { await navigator.clipboard.writeText(adLink); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard blocked */ }
  };
  const shown = href.replace(/^https?:\/\//, "");

  return (
    <div className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <a href={href} target="_blank" rel="noreferrer" className="relative block h-[220px] overflow-hidden border-b border-slate-100 bg-slate-50" aria-label={`Open ${name}`}>
        {thumbPath ? (
          <iframe
            src={thumbPath}
            title={`${name} preview`}
            loading="lazy"
            sandbox=""
            tabIndex={-1}
            className="pointer-events-none absolute left-0 top-0 h-[880px] w-[1280px] origin-top-left scale-[0.3] border-0 bg-white sm:scale-[0.32] xl:scale-[0.3]"
          />
        ) : (
          <div className="grid h-full place-items-center bg-gradient-to-br from-slate-50 to-slate-100">
            <Smartphone className="h-10 w-10 text-slate-300" aria-hidden />
          </div>
        )}
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-700 opacity-0 shadow-sm transition group-hover:opacity-100">
          Open <ExternalLink className="h-3 w-3" aria-hidden />
        </span>
      </a>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-slate-900 hover:underline">{name}</a>
          {stat && (
            <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
              {stat.value ?? "–"} {stat.label}
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-slate-400">{shown}</div>
        <p className="mt-2 text-sm leading-snug text-slate-600">{what}</p>
        {adLink && (
          <button type="button" onClick={copy} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copied ? "Copied" : "Copy ad link"}
          </button>
        )}
      </div>
    </div>
  );
}
