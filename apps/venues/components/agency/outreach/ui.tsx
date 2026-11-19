"use client";
/**
 * components/agency/outreach/ui.tsx — CP-250 · small shared pieces for Admin → Outreach.
 */
import { useState } from "react";
import { STATUS_LABEL, STATUS_TINT, type LeadStatus } from "@/lib/outreach/shared";

export const card = "rounded-xl border border-slate-200 bg-white";
export const inputBase = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200";
export const input = `${inputBase} w-full`;
export const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed";
export const btnPrimary = `${btn} bg-sky-600 text-white hover:bg-sky-700`;
export const btnGhost = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;
export const btnDanger = `${btn} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`;

export type ApiResult<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; error: string };

export async function api<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  try {
    const r = await fetch("/api/agency/outreach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: (j as { error?: string }).error ?? `Failed (${r.status}).` };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export function StatusPill({ status }: { status: LeadStatus }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TINT[status] ?? "bg-slate-100 text-slate-700"}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function Note({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={`text-sm ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>;
}

export function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return { busy, setBusy, msg, setMsg };
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 0) {
    const f = -s;
    if (f < 3600) return `in ${Math.max(1, Math.round(f / 60))} min`;
    if (f < 86400) return `in ${Math.round(f / 3600)} h`;
    return `in ${Math.round(f / 86400)} d`;
  }
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className={`${card} p-10 text-center`}>
      <p className="font-medium text-slate-800">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  );
}
