"use client";
/**
 * Lead-magnet audit, step 4 · the preview portal (an instant preview's front desk, /pv-…/desk).
 *
 *   usePreviewProgress  reports the visit (and "verified" when they came from our email's signed
 *                       link), reads { verified, csv, installed } from the venue site
 *   PatientImport       their patient list from a CSV, so the desk shows THEIR patients. The list
 *                       stays in this browser (never uploaded); only "imported, N rows" is reported
 *   TurnOnBar           after the import: a sticky full-width "Turn on the engine →"
 *   FirstLoginVideo     the 45 s explainer, first visit only, muted, captioned, plays in place
 *   InstallNudge        "Put {spa}'s app on your phone", from the second visit on, until installed
 *
 * The skip-ahead ("Turn it on now") is gated in DeskApp on all three of verified, csv, installed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "react-qr-code";
import type { DeskMember, DueRow, Treatment } from "@/lib/desk-api";
import { mapRows, parseCsv, type Mapped } from "@/lib/patient-csv";
import { IcClose, IcNext, IcPeople, IcPhone } from "../icons";
import { Modal } from "./ui";

export type PreviewProgress = { verified: boolean; csv: boolean; installed: boolean };
export type PortalConfig = { apiOrigin: string; walkthroughUrl: string; vsl: { src: string; captions: string | null } | null };

const store = {
  get(k: string): string | null { try { return window.localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } },
  del(k: string) { try { window.localStorage.removeItem(k); } catch { /* fine */ } },
};

async function post(apiOrigin: string, body: Record<string, unknown>): Promise<PreviewProgress | null> {
  try {
    const r = await fetch(`${apiOrigin}/api/preview/progress`, { method: "POST", mode: "cors", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { progress?: PreviewProgress };
    return r.ok && j.progress ? j.progress : null;
  } catch { return null; }
}

/* ───────────── progress + visits ───────────── */

export function usePreviewProgress(slug: string, cfg: PortalConfig | null) {
  const [progress, setProgress] = useState<PreviewProgress>({ verified: false, csv: false, installed: false });
  const [firstVisit, setFirstVisit] = useState(false);
  const [visits, setVisits] = useState(0);

  useEffect(() => {
    if (!cfg) return;
    let off = false;
    // A "session" = this browser tab's visit; the count lives in this browser.
    const vk = `pv-desk-visits:${slug}`;
    let n = Number(store.get(vk) ?? "0") || 0;
    try { if (!window.sessionStorage.getItem(vk)) { n += 1; store.set(vk, String(n)); window.sessionStorage.setItem(vk, "1"); } } catch { n = Math.max(n, 1); }
    setVisits(n);

    (async () => {
      let seen = n > 1;
      try {
        const r = await fetch(`${cfg.apiOrigin}/api/preview/status?slug=${encodeURIComponent(slug)}`, { mode: "cors", cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as { progress?: PreviewProgress; desk_seen?: boolean };
        if (j.progress && !off) setProgress(j.progress);
        if (j.desk_seen) seen = true;
      } catch { /* defaults */ }
      if (off) return;
      setFirstVisit(!seen);
      const after = await post(cfg.apiOrigin, { slug, event: "desk_visit" });
      // Came from our email's signed link: that proves the inbox is theirs.
      const url = new URL(window.location.href);
      const token = url.searchParams.get("v");
      if (token) {
        const v = await post(cfg.apiOrigin, { slug, event: "verified", token });
        url.searchParams.delete("v");
        window.history.replaceState(null, "", url.toString());
        if (v && !off) setProgress(v);
      } else if (after && !off) setProgress(after);
    })();
    return () => { off = true; };
  }, [slug, cfg]);

  const mark = useCallback(async (event: "csv_imported", count: number) => {
    if (!cfg) return;
    setProgress((p) => ({ ...p, csv: true }));
    const p = await post(cfg.apiOrigin, { slug, event, count });
    if (p) setProgress(p);
  }, [slug, cfg]);

  return { progress, firstVisit, visits, mark };
}

/* ───────────── the imported list (this browser only) ───────────── */

export type Imported = { members: DeskMember[]; due: DueRow[]; at: string };
const listKey = (slug: string) => `pv-patients:${slug}`;

export function loadImported(slug: string): Imported | null {
  const raw = store.get(listKey(slug));
  if (!raw) return null;
  try { const v = JSON.parse(raw) as Imported; return Array.isArray(v.members) && v.members.length ? v : null; } catch { return null; }
}

export function PatientImport({ slug, clinicName, treatments, onClose, onDone }: {
  slug: string; clinicName: string; treatments: Treatment[]; onClose: () => void; onDone: (v: Imported) => void;
}) {
  const [result, setResult] = useState<Mapped | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  async function read(f: File) {
    setErr(null); setResult(null);
    if (f.size > 15_000_000) return setErr("That file is over 15 MB. Export just name, phone, email and last visit.");
    const text = await f.text().catch(() => "");
    const rows = parseCsv(text.replace(/^﻿/, ""));
    if (rows.length < 2) return setErr("We couldn't find any rows. Export a CSV from your booking software (Patients → Export).");
    const m = mapRows(rows, treatments);
    if (!m.members.length) return setErr("We couldn't find names, phones or emails in that file. Check the first row has column titles.");
    setResult(m);
  }

  function save() {
    if (!result) return;
    const v: Imported = { members: result.members, due: result.due, at: new Date().toISOString() };
    store.set(listKey(slug), JSON.stringify(v));
    onDone(v);
  }

  return (
    <Modal title="Import your patients" onClose={onClose}>
      <p className="text-[14px] leading-relaxed text-sub">
        Export your patient list as a CSV from your booking software and drop it here. {clinicName}&apos;s desk fills with your own patients and who&apos;s due next.
      </p>
      <p className="mt-2 rounded-[12px] bg-page px-3.5 py-2.5 text-[13px] leading-snug text-sub">
        <b className="text-ink">Your list stays on this computer.</b> It isn&apos;t uploaded, and nothing is sent to a patient. We only note that you imported it.
      </p>
      <input ref={ref} type="file" accept=".csv,text/csv,.tsv,text/tab-separated-values,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f); }} />
      <button type="button" onClick={() => ref.current?.click()} className="mt-4 flex h-24 w-full flex-col items-center justify-center gap-1 rounded-[18px] border-2 border-dashed border-line text-[15px] font-semibold hover:bg-page"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) read(f); }}>
        <IcPeople className="h-6 w-6 text-sub" />Choose or drop a CSV file
      </button>
      {err && <p role="alert" className="mt-3 text-[14px] font-medium text-red-700">{err}</p>}
      {result && (
        <div className="mt-4 rounded-[16px] bg-page p-4">
          <p className="text-[15px] font-semibold">{result.members.length.toLocaleString("en-US")} patients found{result.due.length ? `, ${result.due.length.toLocaleString("en-US")} with a treatment coming due` : ""}.</p>
          <p className="mt-1 text-[13px] text-sub">Read: {result.found.join(", ") || "nothing"}{result.skipped ? ` · ${result.skipped} rows skipped` : ""}</p>
          <button type="button" onClick={save} className="btn-ink mt-4">Import {result.members.length.toLocaleString("en-US")} patients</button>
        </div>
      )}
    </Modal>
  );
}

/** Home card on a preview desk until the list is in. */
export function ImportCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="mb-5 flex flex-col gap-3 rounded-[18px] bg-white p-5 shadow-[0_10px_30px_-26px_rgba(23,27,38,.5)] sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-[16px] font-semibold">See your desk with your own patients</p>
        <p className="mt-0.5 text-[13.5px] text-sub">Import a CSV from your booking software. It stays on this computer.</p>
      </div>
      <button type="button" onClick={onOpen} className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-5 text-[14px] font-semibold text-white">Import patients <IcNext className="h-3.5 w-3.5" strokeWidth={2.4} /></button>
    </section>
  );
}

/* ───────────── the bar, the video, the install nudge ───────────── */

export function TurnOnBar({ href }: { href: string }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[55] lg:left-[256px]">
      <a href={href} className="flex h-14 w-full items-center justify-center gap-2 bg-brand pb-[env(safe-area-inset-bottom,0px)] text-[16px] font-semibold text-white shadow-[0_-10px_30px_-18px_rgba(23,27,38,.6)]">
        Turn on the engine <IcNext className="h-4 w-4" strokeWidth={2.4} />
      </a>
    </div>
  );
}

export function FirstLoginVideo({ src, captions, onClose }: { src: string; captions: string | null; onClose: () => void }) {
  return (
    <section className="relative mb-5 overflow-hidden rounded-[18px] bg-black">
      <video className="block aspect-video w-full" src={src} autoPlay muted playsInline controls preload="auto" crossOrigin="anonymous" onEnded={onClose}>
        {captions && <track kind="captions" src={captions} srcLang="en" label="English" default />}
      </video>
      <button type="button" onClick={onClose} aria-label="Close video" className="absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white"><IcClose className="h-4 w-4" /></button>
    </section>
  );
}

export function InstallNudge({ clinicName, appUrl, onClose }: { clinicName: string; appUrl: string; onClose: () => void }) {
  return (
    <section className="relative mb-5 flex items-center gap-4 rounded-[18px] bg-white p-4 pr-12 shadow-[0_10px_30px_-26px_rgba(23,27,38,.5)]">
      <button type="button" onClick={onClose} aria-label="Not now" className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-full text-sub hover:bg-page"><IcClose className="h-3.5 w-3.5" /></button>
      <div className="hidden shrink-0 rounded-[12px] bg-white p-2 ring-1 ring-line sm:block"><QRCode value={appUrl} size={96} level="M" /></div>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[16px] font-semibold"><IcPhone className="h-4 w-4" />Put {clinicName}&apos;s app on your phone</p>
        <p className="mt-1 text-[13.5px] leading-snug text-sub">
          <span className="hidden sm:inline">Scan the code with your phone&apos;s camera, then </span>
          <a href={appUrl} className="font-semibold text-brand sm:hidden">Open the app</a><span className="sm:hidden">, then </span>
          tap Share → Add to Home Screen (iPhone) or Install (Android). See it the way your patients will.
        </p>
      </div>
    </section>
  );
}
