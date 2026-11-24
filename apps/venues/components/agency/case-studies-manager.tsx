"use client";
/**
 * components/agency/case-studies-manager.tsx — CP-275 · Admin → Reviews & Results → Results.
 * One card per clinic: name, headline, two big numbers, what they use, the owner's photo (or a YouTube
 * interview) and an optional logo. New cards start hidden; "Show on site" puts one live on /medspa/app
 * (within about a minute). The page shows up to 4, in this order; empty slots keep their placeholders.
 * Only real results: numbers from the clinic's Atlas dashboard, with the owner's OK.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, ImagePlus, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { shrinkImage } from "@/lib/shrink-image";
import { cn } from "@/lib/utils";
import { CASE_BUCKET, RESULT_USES, type CaseStudyRow } from "@/lib/landing/case-studies";
import type { ResultUse } from "@/lib/landing/medspa-funnel";

const API = "/api/agency/site-results";

async function call<T>(method: string, body?: unknown): Promise<T> {
  const r = await fetch(API, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

export function CaseStudiesManager() {
  const [rows, setRows] = useState<CaseStudyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    call<{ results: CaseStudyRow[] }>("GET").then((d) => setRows(d.results)).catch((e: Error) => { setError(e.message); setRows([]); });
  }, []);

  async function add() {
    setAdding(true); setError(null);
    try { const { result } = await call<{ result: CaseStudyRow }>("POST", { action: "add" }); setRows((r) => [...(r ?? []), result]); }
    catch (e) { setError((e as Error).message); }
    setAdding(false);
  }

  async function move(i: number, d: -1 | 1) {
    if (!rows) return;
    const next = [...rows];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
    try { await call("PATCH", { order: next.map((r) => r.id) }); } catch (e) { setError((e as Error).message); }
  }

  const live = (rows ?? []).filter((r) => r.active).length;

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">
          The Results section on <a href="/medspa/app" target="_blank" rel="noreferrer" className="font-medium text-sky-700 underline">/medspa/app</a> shows
          up to 4 of these, in this order. Empty spots keep their &ldquo;coming soon&rdquo; placeholders. Only put live real numbers from the clinic&apos;s
          Atlas dashboard, with the owner&apos;s OK. <b>{live}</b> live now.
        </p>
        <button type="button" onClick={add} disabled={adding || rows === null}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add a case study
        </button>
      </div>
      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {rows === null ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          No case studies yet. The site shows 4 placeholders until you add one and switch it on.
        </p>
      ) : (
        <div className="mt-5 grid gap-4">
          {rows.map((r, i) => (
            <CaseCard key={r.id} row={r} index={i} count={rows.length} onMove={move}
              onSaved={(n) => setRows((all) => (all ?? []).map((x) => (x.id === n.id ? n : x)))}
              onDeleted={() => setRows((all) => (all ?? []).filter((x) => x.id !== r.id))} />
          ))}
        </div>
      )}
    </div>
  );
}

function CaseCard({ row, index, count, onMove, onSaved, onDeleted }: {
  row: CaseStudyRow; index: number; count: number;
  onMove: (i: number, d: -1 | 1) => void; onSaved: (r: CaseStudyRow) => void; onDeleted: () => void;
}) {
  const [clinic, setClinic] = useState(row.clinic);
  const [headline, setHeadline] = useState(row.headline);
  const [stats, setStats] = useState(() => {
    const s = [...(row.stats ?? [])];
    while (s.length < 2) s.push({ value: "", label: "" });
    return s.slice(0, 2);
  });
  const [uses, setUses] = useState<ResultUse[]>(row.uses ?? []);
  const [youtube, setYoutube] = useState(row.youtube ?? "");
  const [busy, setBusy] = useState<null | "save" | "photo" | "logo" | "toggle" | "delete">(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const photoIn = useRef<HTMLInputElement>(null);
  const logoIn = useRef<HTMLInputElement>(null);

  const dirty = clinic !== row.clinic || headline !== row.headline || youtube !== (row.youtube ?? "")
    || JSON.stringify(stats) !== JSON.stringify((row.stats ?? []).slice(0, 2)) || JSON.stringify(uses) !== JSON.stringify(row.uses ?? []);
  const ready = !!clinic.trim() && !!headline.trim() && stats.every((s) => s.value.trim() && s.label.trim()) && (!!row.photo_url || !!row.youtube);

  async function patch(body: Record<string, unknown>, kind: NonNullable<typeof busy>, ok: string) {
    setBusy(kind); setMsg(null);
    try { const { result } = await call<{ result: CaseStudyRow }>("PATCH", { id: row.id, ...body }); onSaved(result); setMsg({ ok: true, text: ok }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(null);
  }

  async function upload(kind: "photo" | "logo", file: File | undefined) {
    if (!file) return;
    setBusy(kind); setMsg(null);
    try {
      const small = await shrinkImage(file, kind === "photo" ? 1800 : 800, 0.9);
      if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(small.type)) throw new Error("Save it as JPG or PNG first.");
      const { path, token } = await call<{ path: string; token: string }>("POST", { action: "sign", type: small.type });
      const { error } = await createClient().storage.from(CASE_BUCKET).uploadToSignedUrl(path, token, small, { contentType: small.type, cacheControl: "31536000" });
      if (error) throw new Error(error.message);
      const { result } = await call<{ result: CaseStudyRow }>("PATCH", { id: row.id, [`${kind}_path`]: path });
      onSaved(result); setMsg({ ok: true, text: kind === "photo" ? "Photo saved." : "Logo saved." });
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setBusy(null);
  }

  async function remove() {
    if (!window.confirm(`Delete ${row.clinic || "this case study"}? Its photo and logo are deleted too.`)) return;
    setBusy("delete");
    try { await call("DELETE", { id: row.id }); onDeleted(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); setBusy(null); }
  }

  const field = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400";

  return (
    <article className={cn("rounded-2xl border bg-white p-5 shadow-sm", row.active ? "border-emerald-300" : "border-slate-200")}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">#{index + 1}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", row.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{row.active ? "Live on site" : "Hidden"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <IconBtn label="Move up" disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp className="h-4 w-4" /></IconBtn>
          <IconBtn label="Move down" disabled={index === count - 1} onClick={() => onMove(index, 1)}><ArrowDown className="h-4 w-4" /></IconBtn>
          <button type="button" disabled={!!busy || (!row.active && (!ready || dirty))}
            title={!row.active && !ready ? "Fill in the clinic, headline, both numbers and a photo or video first" : !row.active && dirty ? "Save your changes first" : undefined}
            onClick={() => patch({ active: !row.active }, "toggle", row.active ? "Hidden from the site." : "Live on the site within about a minute.")}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50",
              row.active ? "bg-slate-100 text-slate-700 hover:bg-slate-200" : "bg-emerald-600 text-white hover:bg-emerald-700")}>
            {busy === "toggle" ? <Loader2 className="h-4 w-4 animate-spin" /> : row.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {row.active ? "Hide" : "Show on site"}
          </button>
          <IconBtn label="Delete" onClick={remove} disabled={!!busy}>{busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</IconBtn>
        </div>
      </header>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Clinic name
            <input className={field} value={clinic} maxLength={80} placeholder="Spa by the Bay" onChange={(e) => setClinic(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">Headline (bottom of the photo)
            <input className={field} value={headline} maxLength={160} placeholder="See how Spa by the Bay brought back 40 overdue patients in a month" onChange={(e) => setHeadline(e.target.value)} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            {stats.map((s, k) => (
              <div key={k} className="grid gap-1.5 rounded-xl bg-slate-50 p-3">
                <span className="text-xs font-semibold text-slate-600">Big number {k + 1}</span>
                <input className={cn(field, "text-lg font-bold")} value={s.value} maxLength={16} placeholder={k === 0 ? "+38%" : "+$4.2K"}
                  onChange={(e) => setStats((all) => all.map((x, j) => (j === k ? { ...x, value: e.target.value } : x)))} />
                <input className={field} value={s.label} maxLength={60} placeholder={k === 0 ? "Average patient spend" : "Monthly membership revenue"}
                  onChange={(e) => setStats((all) => all.map((x, j) => (j === k ? { ...x, label: e.target.value } : x)))} />
              </div>
            ))}
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-600">What they use</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {RESULT_USES.map((u) => {
                const on = uses.includes(u.id);
                return (
                  <button key={u.id} type="button" onClick={() => setUses((all) => (on ? all.filter((x) => x !== u.id) : [...all, u.id]))}
                    className={cn("rounded-full border px-3 py-1 text-sm font-medium", on ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-sky-300")}>
                    {u.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">YouTube interview (optional; shows instead of the photo)
            <input className={field} value={youtube} placeholder="https://youtu.be/…" onChange={(e) => setYoutube(e.target.value)} />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!dirty || !!busy}
              onClick={() => patch({ clinic, headline, stats, uses, youtube }, "save", "Saved.")}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save
            </button>
            {msg && <span className={cn("text-sm", msg.ok ? "text-emerald-700" : "text-rose-700")}>{msg.text}</span>}
          </div>
        </div>

        <div className="grid content-start gap-3">
          <div>
            <span className="text-xs font-semibold text-slate-600">Owner photo</span>
            <button type="button" onClick={() => photoIn.current?.click()} disabled={!!busy}
              className="relative mt-1.5 grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500 hover:border-sky-400">
              {row.photo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={row.photo_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                : <span className="flex flex-col items-center gap-1.5">{busy === "photo" ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}Upload a photo</span>}
              {row.photo_url && busy === "photo" && <span className="absolute inset-0 grid place-items-center bg-white/70"><Loader2 className="h-5 w-5 animate-spin" /></span>}
            </button>
            <input ref={photoIn} type="file" accept="image/*" hidden onChange={(e) => { void upload("photo", e.target.files?.[0]); e.target.value = ""; }} />
            {row.photo_url && <button type="button" className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600" onClick={() => patch({ photo_path: null }, "photo", "Photo removed.")}><X className="h-3 w-3" />Remove photo</button>}
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-600">Clinic logo (optional; white on the photo)</span>
            <button type="button" onClick={() => logoIn.current?.click()} disabled={!!busy}
              className="mt-1.5 grid h-16 w-full place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-800 text-sm text-slate-300 hover:border-sky-400">
              {row.logo_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={row.logo_url} alt="" className="h-9 w-auto max-w-[80%] object-contain brightness-0 invert" />
                : busy === "logo" ? <Loader2 className="h-5 w-5 animate-spin" /> : "Upload a logo"}
            </button>
            <input ref={logoIn} type="file" accept="image/*" hidden onChange={(e) => { void upload("logo", e.target.files?.[0]); e.target.value = ""; }} />
            {row.logo_url && <button type="button" className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-600" onClick={() => patch({ logo_path: null }, "logo", "Logo removed.")}><X className="h-3 w-3" />Remove logo</button>}
          </div>
        </div>
      </div>
    </article>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">{children}</button>
  );
}
