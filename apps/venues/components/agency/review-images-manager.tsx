"use client";
/**
 * components/agency/review-images-manager.tsx — CP-240 · Admin → Reviews.
 * Drop review screenshots (files or a whole folder), choose where each shows,
 * drag to reorder, hide or delete. Files are shrunk in the browser, then go
 * straight to storage through signed upload URLs (no size limit from Vercel).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, FolderUp, GripVertical, ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { shrinkImage } from "@/lib/shrink-image";
import { cn } from "@/lib/utils";
import { REVIEW_BUCKET, REVIEW_PLACEMENTS, type ReviewImageRow, type ReviewPlacement } from "@/lib/landing/review-images";

const API = "/api/agency/site-reviews";
const OK_TYPE = /^image\/(png|jpe?g|webp|gif|avif|heic|heif)$/i;
const PAGE_LINKS: Record<ReviewPlacement, string> = { medspa: "/medspa/app", general: "/", venues: "/venues" };

async function call<T>(method: string, body?: unknown): Promise<T> {
  const r = await fetch(API, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Request failed (${r.status})`);
  return j as T;
}

async function size(file: File): Promise<{ width: number | null; height: number | null }> {
  try { const b = await createImageBitmap(file); const out = { width: b.width, height: b.height }; b.close?.(); return out; }
  catch { return { width: null, height: null }; }
}

/** Files from a drop, including everything inside dropped folders. */
async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items ?? []).map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean) as FileSystemEntry[];
  if (!entries.length) return Array.from(dt.files ?? []);
  const out: File[] = [];
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) { out.push(await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej))); return; }
    if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const c of batch) await walk(c);
      }
    }
  };
  for (const e of entries) await walk(e).catch(() => null);
  return out;
}

export function ReviewImagesManager() {
  const [rows, setRows] = useState<ReviewImageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [defaults, setDefaults] = useState<ReviewPlacement[]>(["medspa", "general"]);
  const [over, setOver] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try { setRows((await call<{ images: ReviewImageRow[] }>("GET")).images); setError(null); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 3500); return () => clearTimeout(t); }, [notice]);
  // The folder picker attribute isn't in React's types.
  useEffect(() => { folderRef.current?.setAttribute("webkitdirectory", ""); folderRef.current?.setAttribute("directory", ""); }, []);

  async function upload(list: File[]) {
    const files = list.filter((f) => OK_TYPE.test(f.type) && !f.name.startsWith("."));
    const skipped = list.length - files.length;
    if (!files.length) { setError(skipped ? "None of those were images (PNG, JPG, WebP, GIF, AVIF or HEIC)." : null); return; }
    setError(null);
    setProgress({ done: 0, total: files.length });
    const supabase = createClient();
    const added: ReviewImageRow[] = [];
    const failed: string[] = [];
    // Small batches: shrink → sign → upload → save, so a big folder shows up as it goes.
    for (let i = 0; i < files.length; i += 6) {
      const shrunk = await Promise.all(files.slice(i, i + 6).map(async (f) => {
        const small = await shrinkImage(f, 1800, 0.9);
        return { file: small, name: f.name, ...(await size(small)) };
      }));
      // HEIC the browser couldn't convert stays HEIC: storage won't take it.
      const chunk = shrunk.filter((c) => /^image\/(png|jpeg|webp|gif|avif)$/.test(c.file.type));
      failed.push(...shrunk.filter((c) => !chunk.includes(c)).map((c) => `${c.name} (save it as JPG first)`));
      if (!chunk.length) { setProgress({ done: Math.min(files.length, i + 6), total: files.length }); continue; }
      try {
        const { uploads } = await call<{ uploads: { path: string; token: string }[] }>("POST", { action: "sign", files: chunk.map((c) => ({ name: c.name, type: c.file.type })) });
        const ok = await Promise.all(chunk.map(async (c, k) => {
          const u = uploads[k];
          const { error: e } = await supabase.storage.from(REVIEW_BUCKET).uploadToSignedUrl(u.path, u.token, c.file, { contentType: c.file.type, cacheControl: "31536000" });
          if (e) { failed.push(c.name); return null; }
          return { path: u.path, width: c.width, height: c.height, show_on: defaults, alt: "" };
        }));
        const items = ok.filter(Boolean);
        if (items.length) {
          const { images } = await call<{ images: ReviewImageRow[] }>("POST", { action: "add", items });
          added.push(...images);
          setRows((r) => [...r, ...images]);
        }
      } catch (e) {
        failed.push(...chunk.map((c) => c.name));
        setError((e as Error).message);
      }
      setProgress({ done: Math.min(files.length, i + 6), total: files.length });
    }
    setProgress(null);
    if (failed.length) setError(`Couldn't upload ${failed.length}: ${failed.slice(0, 4).join(", ")}${failed.length > 4 ? "…" : ""}`);
    if (added.length) setNotice(`Added ${added.length} review${added.length === 1 ? "" : "s"}${skipped ? ` (skipped ${skipped} non-image file${skipped === 1 ? "" : "s"})` : ""}.`);
  }

  async function patch(id: string, change: Partial<Pick<ReviewImageRow, "active" | "alt" | "show_on">>) {
    const before = rows;
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...change } : x)));
    try { await call("PATCH", { id, ...change }); }
    catch (e) { setRows(before); setError((e as Error).message); }
  }

  async function remove(id: string) {
    const before = rows;
    setConfirmDel(null);
    setRows((r) => r.filter((x) => x.id !== id));
    try { await call("DELETE", { id }); setNotice("Deleted."); }
    catch (e) { setRows(before); setError((e as Error).message); }
  }

  async function saveOrder(next: ReviewImageRow[]) {
    setRows(next);
    try { await call("PATCH", { order: next.map((r) => r.id) }); }
    catch (e) { setError((e as Error).message); refresh(); }
  }
  const move = (id: string, by: number) => {
    const i = rows.findIndex((r) => r.id === id), j = i + by;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const next = [...rows]; [next[i], next[j]] = [next[j], next[i]];
    saveOrder(next);
  };
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const next = rows.filter((r) => r.id !== dragId);
    const at = next.findIndex((r) => r.id === targetId);
    next.splice(at, 0, rows.find((r) => r.id === dragId)!);
    setDragId(null);
    saveOrder(next);
  };

  const live = rows.filter((r) => r.active);
  const toggleDefault = (p: ReviewPlacement) => setDefaults((d) => (d.includes(p) ? (d.length > 1 ? d.filter((x) => x !== p) : d) : [...d, p]));

  return (
    <div className="mt-6 space-y-6">
      {/* Upload */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div
          onDragOver={(e) => { if (dragId) return; e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={async (e) => { if (dragId) return; e.preventDefault(); setOver(false); upload(await filesFromDrop(e.dataTransfer)); }}
          className={cn("grid place-items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors", over ? "border-sky-500 bg-sky-50" : "border-slate-300 bg-slate-50/60")}
        >
          {progress ? (
            <div className="w-full max-w-sm">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-sky-600" />
              <p className="mt-3 text-sm font-medium text-slate-700">Uploading {progress.done} of {progress.total}…</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-sky-600 transition-[width]" style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
            </div>
          ) : (
            <>
              <UploadCloud className="h-9 w-9 text-sky-600" />
              <p className="mt-3 text-[15px] font-semibold text-slate-900">Drop review screenshots or a whole folder here</p>
              <p className="mt-1 text-sm text-slate-500">PNG, JPG, WebP, GIF or HEIC. Big screenshots are shrunk automatically.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => filesRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"><ImagePlus className="h-4 w-4" />Choose images</button>
                <button type="button" onClick={() => folderRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50"><FolderUp className="h-4 w-4" />Choose a folder</button>
              </div>
            </>
          )}
          <input ref={filesRef} type="file" accept="image/*" multiple hidden onChange={(e) => { upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
          <input ref={folderRef} type="file" multiple hidden onChange={(e) => { upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-slate-600">New uploads show on:</span>
          {REVIEW_PLACEMENTS.map((p) => (
            <Chip key={p.id} on={defaults.includes(p.id)} onClick={() => toggleDefault(p.id)} title={p.hint}>{p.label}</Chip>
          ))}
        </div>
      </section>

      {(error || notice) && (
        <p role={error ? "alert" : "status"} className={cn("rounded-xl px-4 py-3 text-sm font-medium", error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700")}>{error ?? notice}</p>
      )}

      {/* Library */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500">Your reviews</h2>
            <p className="mt-1 text-sm text-slate-600">
              {rows.length ? `${live.length} live of ${rows.length}. ` : ""}Drag to reorder: the strip plays them in this order.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {REVIEW_PLACEMENTS.map((p) => {
              const n = live.filter((r) => r.show_on.includes(p.id)).length;
              return <a key={p.id} href={PAGE_LINKS[p.id]} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:border-slate-300">{p.label}: <b>{n}</b> ↗</a>;
            })}
          </div>
        </div>

        {loading ? (
          <div className="mt-6 grid place-items-center py-16 text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">No reviews yet. Until there are, the sites keep their current review section.</p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((r, i) => (
              <li
                key={r.id} draggable onDragStart={() => setDragId(r.id)} onDragEnd={() => setDragId(null)}
                onDragOver={(e) => { if (dragId) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); dropOn(r.id); }}
                className={cn("flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition", dragId === r.id ? "opacity-40" : "", r.active ? "border-slate-200" : "border-dashed border-slate-300")}
              >
                <div className={cn("relative grid h-56 place-items-center bg-slate-100 p-3", !r.active && "opacity-50")}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.url} alt={r.alt || "Review"} className="max-h-full max-w-full rounded-lg object-contain shadow-sm" loading="lazy" draggable={false} />
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-1.5 py-1 text-xs font-semibold text-slate-600 shadow-sm"><GripVertical className="h-3.5 w-3.5" />{i + 1}</span>
                  {!r.active && <span className="absolute right-2 top-2 rounded-md bg-slate-900/80 px-2 py-1 text-xs font-semibold text-white">Hidden</span>}
                </div>
                <div className="flex flex-1 flex-col gap-3 p-3">
                  <div className="flex flex-wrap gap-1.5">
                    {REVIEW_PLACEMENTS.map((p) => {
                      const on = r.show_on.includes(p.id);
                      return <Chip key={p.id} small on={on} title={p.hint} onClick={() => { const next = on ? r.show_on.filter((x) => x !== p.id) : [...r.show_on, p.id]; if (next.length) patch(r.id, { show_on: next }); }}>{p.label}</Chip>;
                    })}
                  </div>
                  <input
                    defaultValue={r.alt} placeholder="Describe it (for screen readers), e.g. Google review from Dana"
                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== r.alt) patch(r.id, { alt: v }); }}
                    className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
                  />
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <div className="flex gap-1">
                      <IconBtn label="Move earlier" onClick={() => move(r.id, -1)} disabled={i === 0}><ArrowLeft className="h-4 w-4" /></IconBtn>
                      <IconBtn label="Move later" onClick={() => move(r.id, 1)} disabled={i === rows.length - 1}><ArrowRight className="h-4 w-4" /></IconBtn>
                    </div>
                    <div className="flex gap-1">
                      <button type="button" onClick={() => patch(r.id, { active: !r.active })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        {r.active ? <><EyeOff className="h-3.5 w-3.5" />Hide</> : <><Eye className="h-3.5 w-3.5" />Show</>}
                      </button>
                      {confirmDel === r.id ? (
                        <>
                          <button type="button" onClick={() => remove(r.id)} className="h-8 rounded-lg bg-red-600 px-2.5 text-xs font-semibold text-white hover:bg-red-700">Delete</button>
                          <button type="button" onClick={() => setConfirmDel(null)} className="h-8 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700">Keep</button>
                        </>
                      ) : (
                        <IconBtn label="Delete" onClick={() => setConfirmDel(r.id)}><Trash2 className="h-4 w-4 text-red-600" /></IconBtn>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Chip({ on, onClick, children, title, small = false }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string; small?: boolean }) {
  return (
    <button type="button" onClick={onClick} title={title} aria-pressed={on}
      className={cn("inline-flex items-center gap-1 rounded-full border font-semibold transition-colors", small ? "h-7 px-2.5 text-[11.5px]" : "h-8 px-3 text-[13px]", on ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400")}>
      {on && <Check className={small ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={3} />}{children}
    </button>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-30">
      {children}
    </button>
  );
}
