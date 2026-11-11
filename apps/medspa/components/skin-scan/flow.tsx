"use client";
/**
 * AI skin scan, start to finish:
 * intro → what would you like to improve → photo tips + consent →
 * guided camera (or upload) → analyzing → results with the AI preview.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { BookingOptions, MedspaTreatment } from "@/lib/medspa";
import { EDUCATE_SAMPLE } from "@/lib/educate-sample";
import { LEGAL } from "@/lib/legal";
import { lastScanKey, QUIZ_GOALS, simulationFor, type ConcernId, type ScanResult } from "@/lib/skin-scan";
import { cropAround, faceBox, imageLandmarker, loadImage, mockAfter, shoot, type Shot } from "./face";
import { GuidedCamera } from "./camera";
import { ScanResults } from "./results";
import { IcBack, IcCheck, IcClock } from "../icons";

type Step = "intro" | "goals" | "prep" | "camera" | "analyzing" | "results";

const POLL_MS = 2000;
const POLL_LIMIT = 60; // ~2 minutes

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function api<T>(slug: string, init?: { body?: unknown; query?: string }): Promise<T> {
  const res = await fetch(`/api/${slug}/skin-scan${init?.query ? `?${init.query}` : ""}`, init?.body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(init.body) }
    : { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || "Something went wrong. Please try again.");
  return json as T;
}

export function SkinScanFlow({ slug, clinicName, hero, treatments, booking }: {
  slug: string; clinicName: string; hero: string;
  treatments: MedspaTreatment[]; booking: BookingOptions;
}) {
  const [step, setStep] = useState<Step>("intro");
  const [goals, setGoals] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [shot, setShot] = useState<Shot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [afterState, setAfterState] = useState<"loading" | "ready" | "failed">("loading");
  const [scanAt, setScanAt] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const runRef = useRef(0);

  // Keep the last scan for this tab: a refresh or the sign-in round trip ("Save my results") comes straight back to it.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(lastScanKey(slug));
      if (!raw) return;
      const v = JSON.parse(raw) as { at: string; result: ScanResult; goals: string[]; shot: Shot; after: string | null };
      if (Date.now() - new Date(v.at).getTime() > 2 * 3600e3) return;
      setShot(v.shot); setResult(v.result); setGoals(v.goals); setScanAt(v.at);
      setAfter(v.after); setAfterState(v.after ? "ready" : "failed"); setStep("results");
    } catch { /* storage unavailable: start fresh */ }
  }, [slug]);
  useEffect(() => {
    if (step !== "results" || !result || !shot || !scanAt || afterState === "loading") return;
    try { sessionStorage.setItem(lastScanKey(slug), JSON.stringify({ at: scanAt, result, goals, shot, after })); } catch { /* too big or blocked */ }
  }, [step, result, shot, scanAt, after, afterState, goals, slug]);

  const goalConcerns = Array.from(new Set(goals.flatMap((g) => QUIZ_GOALS.find((q) => q.id === g)?.concerns ?? []))) as ConcernId[];

  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  const run = useCallback(async (s: Shot) => {
    const id = ++runRef.current;
    const live = () => runRef.current === id;
    let scored = false;
    setShot(s); setError(null); setResult(null); setAfter(null); setAfterState("loading"); setStep("analyzing");
    try {
      const started = await api<{ mock?: boolean; result?: ScanResult; token?: string; analysisTask?: string }>(slug, { body: { action: "start", image: s.dataUrl, hd: s.hd } });
      let res: ScanResult;
      if (started.mock && started.result) {
        await sleep(3200); // let the scan animation play
        res = started.result;
      } else {
        res = await (async () => {
          for (let i = 0; i < POLL_LIMIT; i++) {
            await sleep(POLL_MS);
            if (!live()) throw new Error("cancelled");
            const p = await api<{ status: string; error?: string; result?: ScanResult }>(slug, { query: `analysis=${encodeURIComponent(started.analysisTask!)}` });
            if (p.status === "success" && p.result) return p.result;
            if (p.status === "error") throw new Error(p.error || "We couldn't read that photo.");
          }
          throw new Error("The scan is taking too long. Please try again.");
        })();
      }
      if (!live()) return;
      setResult(res);
      setScanAt(new Date().toISOString());
      scored = true;
      setStep("results");

      // The AI "after" preview, from the weakest scores + the goals they picked.
      if (res.mock) {
        setAfter(await mockAfter(s.dataUrl)); setAfterState("ready");
        return;
      }
      const sim = simulationFor(res.metrics, goalConcerns);
      const { simulationTask } = await api<{ simulationTask: string }>(slug, { body: { action: "preview", token: started.token, sim } });
      for (let i = 0; i < POLL_LIMIT; i++) {
        await sleep(POLL_MS);
        if (!live()) return;
        const p = await api<{ status: string; url?: string }>(slug, { query: `simulation=${encodeURIComponent(simulationTask)}` });
        if (p.status === "success" && p.url) { setAfter(p.url); setAfterState("ready"); return; }
        if (p.status === "error") break;
      }
      if (live()) setAfterState("failed");
    } catch (e) {
      if (!live() || (e as Error).message === "cancelled") return;
      if (scored) { setAfterState("failed"); return; }
      setError((e as Error).message);
      setStep("prep");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, goals.join(",")]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    try {
      const url = URL.createObjectURL(f);
      const img = await loadImage(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      let crop = { x: 0, y: 0, w, h: Math.min(h, (w * 4) / 3) };
      try {
        const lm = await imageLandmarker();
        const pts = lm.detect(img).faceLandmarks?.[0];
        if (!pts?.length) { setError("We couldn't find a face in that photo. Try a clear, front-facing selfie."); setStep("prep"); return; }
        crop = cropAround(faceBox(pts, w, h), w, h);
      } catch { /* face tracking unavailable: send the photo as is */ }
      const s = shoot(img, crop, false);
      URL.revokeObjectURL(url);
      run(s);
    } catch {
      setError("That photo couldn't be opened. Try a JPG or PNG.");
      setStep("prep");
    }
  };

  const pickFile = () => { setStep("prep"); setTimeout(() => fileRef.current?.click(), 0); };

  return (
    <div className="min-h-[calc(100dvh-5.5rem)] bg-white">
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />

      {step !== "intro" && step !== "camera" && step !== "analyzing" && (
        <header className="sticky top-0 z-30 flex h-[54px] items-center justify-between bg-white px-4" style={{ paddingTop: "env(safe-area-inset-top, 0px)", boxSizing: "content-box" }}>
          <button type="button" onClick={() => { if (step === "results") { try { sessionStorage.removeItem(lastScanKey(slug)); } catch { /* ignore */ } } setStep(step === "results" ? "intro" : step === "prep" ? "goals" : "intro"); }} className="flex items-center gap-0.5 text-[13px] font-medium text-sub">
            <IcBack className="h-4 w-4" strokeWidth={2} />{step === "results" ? "Start over" : "Back"}
          </button>
          <p className="text-[15px] font-semibold">AI skin scan</p>
          <span className="w-14" />
        </header>
      )}

      {step === "intro" && <Intro clinicName={clinicName} hero={hero} onStart={() => setStep("goals")} />}

      {step === "goals" && (
        <section className="animate-rise px-5 pt-4">
          <Progress n={1} />
          <h2 className="mt-5 text-[26px] font-semibold leading-tight tracking-[-0.02em]">What would you like to improve?</h2>
          <p className="mt-1.5 text-[14.5px] text-sub">Pick as many as you like. We&apos;ll focus your preview on them.</p>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {QUIZ_GOALS.map((g) => {
              const on = goals.includes(g.id);
              return (
                <button key={g.id} type="button" aria-pressed={on} onClick={() => setGoals((p) => (on ? p.filter((x) => x !== g.id) : [...p, g.id]))}
                  className={`flex h-[58px] items-center justify-between rounded-[14px] px-4 text-left text-[14.5px] font-semibold transition active:scale-[0.98] ${on ? "bg-ink text-white" : "bg-[#F4F5F6] text-ink"}`}>
                  {g.label}
                  {on && <IcCheck className="h-5 w-5 shrink-0" />}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn-ink mt-7" onClick={() => setStep("prep")}>{goals.length ? "Continue" : "Skip, just scan me"}</button>
        </section>
      )}

      {step === "prep" && (
        <section className="animate-rise px-5 pt-4">
          <Progress n={2} />
          <h2 className="mt-5 text-[26px] font-semibold leading-tight tracking-[-0.02em]">Let&apos;s take your photo</h2>
          <p className="mt-1.5 text-[14.5px] text-sub">For the most accurate scan:</p>
          <ul className="mt-4 grid grid-cols-2 gap-2.5">
            {[["Bare skin", "No makeup if you can"], ["Hair back", "Forehead fully showing"], ["Glasses off", "Nothing covering your face"], ["Even light", "Face a window or lamp"]].map(([t, d]) => (
              <li key={t} className="rounded-[14px] bg-[#F4F5F6] px-3.5 py-3">
                <p className="text-[14px] font-semibold">{t}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-sub">{d}</p>
              </li>
            ))}
          </ul>
          {error && <p role="alert" className="mt-4 rounded-[12px] bg-[#FDECEA] px-4 py-3 text-[14px] font-medium text-[#A3332A]">{error}</p>}
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[14px] p-1">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-black" />
            <span className="text-[13px] leading-snug text-sub">
              I&apos;m 18 or older, this is a photo of me, and I agree to have it analyzed by AI (provided by Perfect Corp) to create my skin scan and preview, as described in the{" "}
              <a href={LEGAL.skinScan} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline">AI Skin Scan &amp; Biometric Notice</a>.{" "}
              {clinicName} and Atlas don&apos;t store the photo. Not medical advice.{" "}
              <a href={LEGAL.privacy} target="_blank" rel="noopener noreferrer" className="underline">Privacy</a> ·{" "}
              <a href={LEGAL.terms} target="_blank" rel="noopener noreferrer" className="underline">Terms</a>
            </span>
          </label>
          <button type="button" className="btn-ink mt-5" disabled={!consent} onClick={() => setStep("camera")}>Open camera</button>
          <button type="button" className="mt-2 h-12 w-full text-[15px] font-semibold text-ink disabled:text-faint" disabled={!consent} onClick={() => fileRef.current?.click()}>Upload a photo instead</button>
        </section>
      )}

      {step === "camera" && <GuidedCamera onShot={run} onClose={() => setStep("prep")} onUpload={pickFile} />}

      {step === "analyzing" && shot && <Analyzing photo={shot.dataUrl} />}

      {step === "results" && result && shot && (
        <ScanResults result={result} before={shot.dataUrl} after={after} afterState={afterState} goals={goalConcerns}
          treatments={treatments} booking={booking} clinicName={clinicName} slug={slug}
          scanAt={scanAt}
          onRescan={() => { runRef.current++; try { sessionStorage.removeItem(lastScanKey(slug)); } catch { /* ignore */ } setStep("prep"); }} />
      )}
    </div>
  );
}

function Progress({ n }: { n: 1 | 2 }) {
  return (
    <div className="flex gap-1.5" aria-label={`Step ${n} of 2`}>
      {[1, 2].map((i) => <span key={i} className={`h-[4px] flex-1 rounded-full ${i <= n ? "bg-ink" : "bg-[#E6E8EA]"}`} />)}
    </div>
  );
}

// Her real "before" scores from the sample scan (lib/educate-sample), placed by the features they measure.
const HERO_CHIPS: { label: string; score: number; at: string; delay: number }[] = EDUCATE_SAMPLE.chips.map((c, i) => ({
  label: c.label, score: c.before, delay: 0.5 + i * 0.6,
  at: ["right-[5%] top-[14%]", "left-[4%] top-[40%]", "right-[6%] top-[58%]"][i] ?? "left-[4%] top-[70%]",
}));

/** Intro: the clinic's hero photo with a scan sweeping over it and a few marker chips popping in. */
function Intro({ clinicName, hero, onStart }: { clinicName: string; hero: string; onStart: () => void }) {
  return (
    <section className="animate-fade">
      <div className="relative aspect-[4/4.2] overflow-hidden bg-tint">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_60%]" />
        <div className="ss-scanline pointer-events-none absolute inset-x-0 h-[22%]" />
        {HERO_CHIPS.map((c) => (
          <span key={c.label} className={`absolute ${c.at} flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[12.5px] font-semibold text-ink shadow-card backdrop-blur`}
            style={{ animation: `rise .5s cubic-bezier(.2,.7,.2,1) ${c.delay}s both` }}>
            <span className="h-2 w-2 rounded-full bg-brand" />{c.label}<span className="tabular-nums text-sub">{c.score}</span>
          </span>
        ))}
        <ScanlineStyle />
      </div>
      <div className="relative -mt-6 rounded-t-[24px] bg-white px-5 pt-6">
        <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-brand">Free skin analysis</span>
        <h1 className="mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-0.025em]">See what treatment could do for your skin</h1>
        <p className="mt-2 text-[15px] leading-snug text-sub">One quick question and a selfie. Get your skin score, 12 skin markers, an AI preview of your results, and treatments from {clinicName} matched to you.</p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[["Skin score", "M4 16a8 8 0 0 1 16 0M12 16l3.5-4M3 20h18"], ["12 markers", "M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 10h.01M15 10h.01M9.5 15c1.5 1 3.5 1 5 0"], ["AI preview", "M12 3.5 13.8 9l5.7 1.9-5.7 1.9L12 18.5l-1.8-5.7L4.5 10.9 10.2 9z"]].map(([label, d]) => (
            <div key={label} className="flex flex-col items-center gap-1.5 rounded-[12px] bg-[#F4F5F6] px-1.5 py-2.5 text-center">
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] text-brand" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
              <span className="text-[13px] font-medium">{label}</span>
            </div>
          ))}
        </div>
        <button type="button" className="btn-ink mt-6" onClick={onStart}>Start my skin scan</button>
        <p className="mt-2.5 flex items-center justify-center gap-1.5 pb-4 text-[13px] text-sub"><IcClock className="h-4 w-4" />About 1 minute · Free · No obligation</p>
      </div>
    </section>
  );
}

const STAGES = ["Mapping your face", "Measuring lines and texture", "Checking pores and tone", "Reading under-eyes and firmness", "Building your skin score"];

function Analyzing({ photo }: { photo: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => Math.min(STAGES.length - 1, n + 1)), 1400);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="fixed inset-0 z-[70] bg-black text-white">
      <div className="relative mx-auto h-full max-w-md overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />
        <div className="ss-scanline pointer-events-none absolute inset-x-0 h-[22%]" />
        <div className="absolute inset-x-0 bottom-0 px-6 text-center" style={{ paddingBottom: "calc(3rem + env(safe-area-inset-bottom, 0px))" }}>
          <div className="mx-auto mb-4 h-1 w-40 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-white transition-all duration-1000" style={{ width: `${((i + 1) / STAGES.length) * 100}%` }} />
          </div>
          <p key={i} className="animate-rise text-[20px] font-semibold">{STAGES[i]}…</p>
          <p className="mt-1 text-[13px] text-white/60">This takes about 15 seconds</p>
        </div>
      </div>
      <ScanlineStyle />
    </div>
  );
}

function ScanlineStyle() {
  return <style>{`.ss-scanline{background:linear-gradient(to bottom,transparent,rgb(var(--p-rgb)/.08) 30%,rgb(var(--p-rgb)/.35) 88%,rgba(255,255,255,.95) 100%);animation:ss-scan 2.2s cubic-bezier(.45,0,.55,1) infinite alternate}@keyframes ss-scan{from{top:-22%}to{top:100%}}`}</style>;
}
