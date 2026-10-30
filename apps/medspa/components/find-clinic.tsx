"use client";
/**
 * Find your location: search by name, scan the clinic's QR code, or type a
 * referral / join code. Picking a clinic remembers it, so the app opens
 * straight to it next time.
 */
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ClinicHit } from "@/app/api/clinics/route";
import { rememberClinic } from "@/lib/remember";
import { IcClose, IcNext, IcPin, IcQr } from "./icons";

const Scanner = dynamic(() => import("@yudiel/react-qr-scanner").then((m) => m.Scanner), { ssr: false });

export function FindClinic() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ClinicHit[] | null>(null);
  const [scan, setScan] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/clinics?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal })
        .then((r) => r.json()).then((d: { hits: ClinicHit[] }) => setHits(d.hits)).catch(() => {});
    }, 220);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  function open(slug: string) {
    rememberClinic(slug);
    router.push(`/${slug}`);
  }

  async function byCode(raw: string) {
    setMsg(null);
    const r = await fetch(`/api/clinics?code=${encodeURIComponent(raw)}`).then((x) => x.json()).catch(() => ({ hits: [] }));
    const hit = (r as { hits: ClinicHit[] }).hits[0];
    if (hit) open(hit.slug);
    else setMsg("We couldn't find a clinic with that code.");
  }

  function onScan(text: string) {
    setScan(false);
    try {
      const u = new URL(text);
      const j = u.pathname.match(/^\/j\/([a-z0-9]+)/i);
      if (j) return byCode(j[1]);
      const qr = u.pathname.match(/^\/qr\/([a-z0-9-]+)/i);
      if (qr) return open(qr[1].toLowerCase());
      const slug = u.pathname.split("/").filter(Boolean)[0];
      if (slug) return open(slug.toLowerCase());
    } catch {
      return byCode(text);
    }
    setMsg("That QR code isn't for a clinic.");
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-6" style={{ paddingTop: "calc(3rem + env(safe-area-inset-top, 0px))", paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}>
      <h1 className="mt-[8vh] animate-rise text-center text-[32px] font-semibold tracking-[-0.02em]">Find your location</h1>
      <p className="mx-auto mt-3 max-w-[30ch] animate-rise text-center text-[16.5px] leading-relaxed text-sub">
        Find your location now to shop your favorite services, and start earning rewards!
      </p>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search by name" className="field mt-8" />

      {hits && (
        <ul className="mt-2 animate-rise overflow-hidden rounded-[18px] bg-white shadow-card ring-1 ring-line">
          {hits.length === 0 && <li className="px-5 py-4 text-[15px] text-sub">No clinics match &ldquo;{q}&rdquo;.</li>}
          {hits.map((h) => (
            <li key={h.slug}>
              <button type="button" onClick={() => open(h.slug)} className="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left last:border-0">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-page">
                  {h.logoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={h.logoUrl} alt="" className="h-full w-full object-contain" />
                    : <IcPin className="h-5 w-5 text-sub" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold">{h.name}</span>
                  {h.address && <span className="block truncate text-[13.5px] text-sub">{h.address}</span>}
                </span>
                <IcNext className="h-4 w-4 text-faint" strokeWidth={2.2} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="my-7 flex items-center gap-4 text-[15px] text-sub"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>

      <button type="button" onClick={() => { setMsg(null); setScan(true); }} className="btn-ink gap-2.5 shadow-[0_18px_30px_-18px_rgba(0,0,0,0.6)]">
        <IcQr className="h-6 w-6" /> Scan QR Code
      </button>
      {msg && <p className="mt-4 text-center text-[14px] text-red-600">{msg}</p>}

      <button type="button" onClick={() => setCodeOpen(true)} className="mt-auto pt-10 text-center text-[16.5px]">I have a referral code</button>

      {scan && (
        <div className="fixed inset-0 z-50 flex animate-fade flex-col bg-black">
          <div className="flex items-center justify-between px-5 text-white" style={{ paddingTop: "calc(1rem + env(safe-area-inset-top, 0px))" }}>
            <p className="text-[17px] font-semibold">Scan the clinic&apos;s QR code</p>
            <button type="button" onClick={() => setScan(false)} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full bg-white/15"><IcClose className="h-5 w-5" /></button>
          </div>
          <div className="mx-auto mt-10 w-full max-w-sm overflow-hidden rounded-[24px] px-5">
            <Scanner onScan={(r) => r[0]?.rawValue && onScan(r[0].rawValue)} onError={() => { setScan(false); setMsg("Camera unavailable. Search by name instead."); }} />
          </div>
          <p className="mt-6 px-10 text-center text-[14px] text-white/70">You&apos;ll find it at the front desk or on your appointment card.</p>
        </div>
      )}

      {codeOpen && (
        <div className="fixed inset-0 z-50 animate-fade bg-black/40" onClick={() => setCodeOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => { e.preventDefault(); if (code.trim()) { setCodeOpen(false); byCode(code); } }}
            className="absolute inset-x-0 bottom-0 mx-auto max-w-md animate-sheet rounded-t-[26px] bg-white px-6 pt-3"
            style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
            <h2 className="text-[22px] font-semibold">Enter your code</h2>
            <p className="mt-1 text-[14.5px] text-sub">From a friend&apos;s invite or the clinic&apos;s sign.</p>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. GLOW" autoFocus autoCapitalize="characters" className="field mt-5 tracking-[0.12em]" />
            <button type="submit" disabled={!code.trim()} className="btn-ink mt-4">Continue</button>
          </form>
        </div>
      )}
    </main>
  );
}
