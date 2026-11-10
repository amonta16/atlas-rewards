"use client";
/**
 * Skin scan results: overall score + skin age, the AI "after" preview
 * (drag to compare), a face map of each concern, every score, and the
 * clinic's own treatments for the weakest areas.
 */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { optimizedUrl } from "@atlas/core/img";
import type { BookingOptions, MedspaTreatment } from "@/lib/medspa";
import { fromPrice } from "@/lib/plans";
import {
  concernDef, demoScansKey, matchTreatments, scoreWord, WEAK_BELOW, ZONES,
  type ConcernId, type SavedScan, type ScanMetric, type ScanResult,
} from "@/lib/skin-scan";
import { ActionButton } from "../action-sheet";
import { useGate } from "../gate";
import { IcDown, IcNext, IcRefresh, IcSpark } from "../icons";

export function ScanResults({ result, before, after, afterState, goals, treatments, booking, clinicName, slug, scanAt, onRescan }: {
  result: ScanResult;
  /** The photo as taken (what the "after" was generated from). */
  before: string;
  after: string | null;
  afterState: "loading" | "ready" | "failed";
  goals: ConcernId[];
  treatments: MedspaTreatment[];
  booking: BookingOptions;
  clinicName: string;
  slug: string;
  /** When this scan finished: saving is once per scan. */
  scanAt: string;
  onRescan: () => void;
}) {
  const sorted = useMemo(() => [...result.metrics].sort((a, b) => a.score - b.score), [result.metrics]);
  const matches = useMemo(() => matchTreatments(treatments, result.metrics, goals), [treatments, result.metrics, goals]);
  const focus = sorted.filter((m) => m.score < WEAK_BELOW).slice(0, 3);

  return (
    <div className="animate-fade pb-6">
      {/* Score */}
      <section className="px-5 pt-6 text-center">
        <p className="eyebrow">Your skin score</p>
        <ScoreRing score={result.overall} />
        <p className="mt-1 text-[17px] font-semibold">{scoreWord(result.overall)}</p>
        <div className="mx-auto mt-4 grid max-w-[340px] grid-cols-2 gap-2.5">
          <Stat label="Skin age" value={result.skinAge ? `${result.skinAge}` : "-"} />
          <Stat label="Skin markers" value={`${result.metrics.length}`} />
        </div>
        {focus.length > 0 && (
          <p className="mx-auto mt-4 max-w-[32ch] text-[14.5px] leading-snug text-sub">
            Your biggest opportunities: <span className="font-semibold text-ink">{focus.map((m) => concernDef(m.id).label.toLowerCase()).join(", ")}</span>.
          </p>
        )}
        {result.mock && <p className="mx-auto mt-3 w-fit rounded-full bg-[#FFF4D6] px-3 py-1 text-[11.5px] font-semibold text-[#7A5A00]">Demo mode: sample scores, no AI key set</p>}
      </section>

      {/* AI preview */}
      <section className="mt-8 px-4">
        <div className="flex items-baseline justify-between px-1">
          <h3 className="text-[19px] font-semibold tracking-[-0.015em]">Your AI preview</h3>
          <span className="text-[12px] font-medium text-sub">Drag to compare</span>
        </div>
        <BeforeAfter before={before} after={after} state={afterState} />
        <p className="mt-2 px-1 text-[11.5px] leading-snug text-faint">A simulation of what treating {focus.length ? "these areas" : "your skin"} could look like. Not a promise of results. Your provider will talk you through what to expect.</p>
      </section>

      {/* Recommended */}
      <section className="mt-8 px-4">
        <h3 className="px-1 text-[19px] font-semibold tracking-[-0.015em]">Recommended for you</h3>
        <p className="mt-0.5 px-1 text-[13px] text-sub">From the {clinicName} menu, matched to your scan.</p>
        <div className="mt-3 flex flex-col gap-2.5">
          {matches.map(({ treatment: t, concerns, zones }) => (
            <Link key={t.id} href={`/${slug}/shop/treatment/${t.id}`} className="flex items-center gap-3.5 rounded-[16px] bg-white p-3 shadow-card ring-1 ring-line transition active:scale-[0.99]">
              <div className="h-[68px] w-[68px] shrink-0 overflow-hidden rounded-[12px] bg-tint">
                {t.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={optimizedUrl(t.image_url, 200)} alt="" className="h-full w-full object-cover" loading="lazy" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{t.name}</p>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-sub">
                  Targets {[...zones.map((z) => ZONES.find((d) => d.id === z)!.label.toLowerCase()), ...concerns.map((c) => concernDef(c).label.toLowerCase())].slice(0, 3).join(", ")}
                </p>
                <p className="mt-1 text-[12.5px] font-semibold">{fromPrice(t)}</p>
              </div>
              <IcNext className="h-4 w-4 shrink-0 text-faint" strokeWidth={2.2} />
            </Link>
          ))}
          {matches.length === 0 && (
            <p className="rounded-[16px] bg-[#F4F5F6] p-4 text-[14px] leading-snug text-sub">Your skin is in great shape. A consultation is the best next step to keep it that way.</p>
          )}
        </div>
        <div className="mt-4">
          <ActionButton label="Book a consultation" options={booking}
            sheet={{ title: "Book a consultation", body: `Bring your scan to ${clinicName}. Choose how you'd like to book.` }} />
        </div>
      </section>

      <SaveCard result={result} goals={goals} treatments={matches.map((m) => m.treatment.name)} slug={slug} clinicName={clinicName} scanAt={scanAt} />

      {/* Face map + all scores */}
      <FaceMap result={result} before={before} />

      <section className="mt-8 px-4">
        <h3 className="px-1 text-[19px] font-semibold tracking-[-0.015em]">Every marker</h3>
        <div className="mt-3 divide-y divide-line overflow-hidden rounded-[16px] bg-white ring-1 ring-line">
          {sorted.map((m) => <MetricRow key={m.id} m={m} />)}
        </div>
      </section>

      <div className="mt-6 px-4">
        <button type="button" onClick={onRescan} className="btn-ghost gap-2"><IcRefresh className="h-5 w-5" />Scan again</button>
        <p className="mt-3 text-center text-[11.5px] leading-snug text-faint">Skin analysis by Perfect Corp AI. For cosmetic guidance only, not a medical diagnosis.</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] bg-[#F4F5F6] px-3 py-2.5">
      <p className="text-[20px] font-semibold tabular-nums leading-tight">{value}</p>
      <p className="text-[12px] text-sub">{label}</p>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto mt-3 h-[148px] w-[148px]">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#ECEEF0" strokeWidth="9" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(var(--p-rgb))" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.2,.7,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-[44px] font-semibold tabular-nums tracking-[-0.03em]">{score}</span>
      </div>
    </div>
  );
}

function bar(score: number) {
  return score >= WEAK_BELOW ? "bg-brand" : score >= 60 ? "bg-[#E7A33C]" : "bg-[#D9544A]";
}

function MetricRow({ m }: { m: ScanMetric }) {
  const [open, setOpen] = useState(false);
  const d = concernDef(m.id);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[14.5px] font-semibold">{d.label}</span>
            <span className="text-[14px] font-semibold tabular-nums">{m.score}</span>
          </span>
          <span className="mt-1.5 block h-[6px] overflow-hidden rounded-full bg-[#ECEEF0]">
            <span className={`block h-full rounded-full ${bar(m.score)}`} style={{ width: `${m.score}%` }} />
          </span>
        </span>
        <IcDown className={`h-4 w-4 shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2} />
      </button>
      {open && (
        <div className="animate-fade px-4 pb-4 text-[13px] leading-snug text-sub">
          <p>{d.what}</p>
          {m.zones && m.zones.length > 0 && (
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              {m.zones.map((z) => (
                <div key={z.id} className="flex items-center justify-between rounded-[10px] bg-[#F4F5F6] px-2.5 py-1.5">
                  <span className="truncate text-[12.5px] text-ink">{ZONES.find((x) => x.id === z.id)!.label}</span>
                  <span className={`ml-2 text-[12.5px] font-semibold tabular-nums ${z.score < WEAK_BELOW ? "text-[#C0473E]" : "text-ink"}`}>{z.score}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Drag-to-reveal: before on the left of the handle, AI after on the right. */
function BeforeAfter({ before, after, state }: { before: string; after: string | null; state: "loading" | "ready" | "failed" }) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div ref={box} className="relative mt-3 aspect-[3/4] touch-none select-none overflow-hidden rounded-[18px] bg-ink"
      onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); move(e.clientX); }}
      onPointerMove={(e) => { if (e.buttons) move(e.clientX); }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={before} alt="Before" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      {after && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={after} alt="AI preview" className="absolute inset-0 h-full w-full object-cover" draggable={false}
          style={{ clipPath: `inset(0 0 0 ${pos}%)` }} />
      )}
      {state === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-black/35 backdrop-blur-[2px]">
          <div className="flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-[13.5px] font-semibold text-ink">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />Creating your preview…
          </div>
        </div>
      )}
      {state === "failed" && (
        <div className="absolute inset-x-3 bottom-3 rounded-[12px] bg-white/95 px-3 py-2 text-center text-[12.5px] font-medium text-ink">The preview couldn&apos;t be made for this photo. Your scores are below.</div>
      )}
      {after && (
        <>
          <div className="pointer-events-none absolute inset-y-0 w-[2px] bg-white shadow-[0_0_12px_rgba(0,0,0,.35)]" style={{ left: `calc(${pos}% - 1px)` }}>
            <span className="absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow-card">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 7 4 12l5 5M15 7l5 5-5 5" /></svg>
            </span>
          </div>
          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">Before</span>
          <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink"><IcSpark className="h-3.5 w-3.5" />AI preview</span>
        </>
      )}
    </div>
  );
}

/** The analyzed photo with one concern's detection mask on top. */
function FaceMap({ result, before }: { result: ScanResult; before: string }) {
  const withMasks = result.metrics.filter((m) => m.masks.length > 0).sort((a, b) => a.score - b.score);
  const [sel, setSel] = useState<ConcernId | null>(withMasks[0]?.id ?? null);
  if (!withMasks.length) return null;
  const m = withMasks.find((x) => x.id === sel) ?? withMasks[0];
  const photo = result.photoUrl ?? before;
  return (
    <section className="mt-8">
      <h3 className="px-5 text-[19px] font-semibold tracking-[-0.015em]">Your skin map</h3>
      <p className="mt-0.5 px-5 text-[13px] text-sub">Tap a marker to see where the AI found it.</p>
      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {withMasks.map((x) => (
          <button key={x.id} type="button" onClick={() => setSel(x.id)}
            className={`shrink-0 rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${x.id === m.id ? "bg-ink text-white" : "bg-[#F1F2F3] text-ink"}`}>
            {concernDef(x.id).label} <span className="tabular-nums opacity-70">{x.score}</span>
          </button>
        ))}
      </div>
      <div className="relative mx-4 mt-3 aspect-[3/4] overflow-hidden rounded-[18px] bg-ink">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo} alt="Your photo" className="absolute inset-0 h-full w-full object-cover" />
        {m.masks.slice(0, 1).map((u) => (
          // Perfect Corp masks: PNG with alpha, or a JPG on black (screen-blended so only the marks show).
          // eslint-disable-next-line @next/next/no-img-element
          <img key={u} src={u} alt="" className="absolute inset-0 h-full w-full animate-fade object-cover"
            style={/\.jpe?g(\?|$)/i.test(u) ? { mixBlendMode: "screen" } : undefined} />
        ))}
      </div>
    </section>
  );
}

/**
 * Signed in: the scan is saved to their profile so the clinic can follow up.
 * Guests: one card to sign in and save (they come straight back to these results).
 */
function SaveCard({ result, goals, treatments, slug, clinicName, scanAt }: {
  result: ScanResult; goals: ConcernId[]; treatments: string[]; slug: string; clinicName: string; scanAt: string;
}) {
  const { signedIn, require } = useGate();
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const flag = `atlas-skin-scan-saved:${slug}:${scanAt}`;
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!signedIn || !scanAt) return;
    try { if (sessionStorage.getItem(flag)) { setState("saved"); return; } } catch { /* ignore */ }
    // Once per scan, even when React runs this effect twice.
    if (sent.current === flag) return;
    sent.current = flag;
    setState("saving");
    fetch(`/api/${slug}/skin-scan`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save", scan: { overall: result.overall, skinAge: result.skinAge, metrics: result.metrics.map((m) => ({ id: m.id, score: m.score })), goals, treatments } }),
    }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error();
      if (j.saved === "local" && j.row) {
        // Demo / instant preview: keep it in this browser for the demo desk.
        try {
          const list = JSON.parse(localStorage.getItem(demoScansKey(slug)) || "[]") as SavedScan[];
          localStorage.setItem(demoScansKey(slug), JSON.stringify([j.row, ...list].slice(0, 20)));
        } catch { /* ignore */ }
      }
      try { sessionStorage.setItem(flag, "1"); } catch { /* ignore */ }
      setState("saved");
    }).catch(() => setState("error"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, scanAt]);

  if (signedIn) {
    return (
      <p className="mx-4 mt-4 flex items-center justify-center gap-1.5 text-center text-[12.5px] text-sub">
        {state === "saved" ? <>Saved to your profile. {clinicName} will use it to plan your visit.</> : state === "error" ? "Couldn't save your results this time." : "Saving your results…"}
      </p>
    );
  }
  return (
    <section className="mx-4 mt-6 rounded-[16px] bg-[#F4F5F6] p-4">
      <p className="text-[15px] font-semibold">Keep your results</p>
      <p className="mt-0.5 text-[13px] leading-snug text-sub">Sign in to save your scan to your profile, so {clinicName} can build your plan before you come in.</p>
      <button type="button" onClick={() => require(() => {})} className="btn-ink mt-3 h-11 text-[15px]">Save my results</button>
    </section>
  );
}
