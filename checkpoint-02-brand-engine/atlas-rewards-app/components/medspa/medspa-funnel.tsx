"use client";
/**
 * components/medspa/medspa-funnel.tsx — CP-201 · the /medspa funnel, in the brand-site look.
 *
 *   Your app (3 taps, the phone re-skins live) → Your numbers (4 taps) → the estimate
 *   → About you: the qualify form (STEP 1) → POST /api/landing/lead (the server decides)
 *       qualified  → Meta Lead (Pixel + CAPI, one event_id) → Pick a time → booked
 *                    → straight to the pre-call page /medspa/confirm/<token>
 *       not a fit  → a kind "here's your estimate by email" screen. No calendar, no Meta signal.
 *
 * A qualified visitor who leaves before booking can come back to /medspa?lead=<id>
 * (the follow-up email link) or on the same browser and lands on the calendar.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowLeft, ArrowRight, Ban, CalendarDays, Check, ChevronDown, ImagePlus, Loader2, Lock, Mail, MessageSquare, Pipette, ShieldCheck, Smartphone, Sparkles, Ticket, Users, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { optimizedUrl } from "@/lib/img";
import { dominantColorsFromFile, paletteFromColor } from "@/lib/logo-colors";
import { type LiveBrand } from "@/lib/landing/live-app-data";
import { fmtMoney, fmtPct } from "@/lib/landing/quiz-model";
import { CYCLE_SOURCE, RECALL, REBOOK, SCENARIOS, VALUE_BANDS, VISIT_BANDS, estimateMedspa } from "@/lib/landing/medspa-quiz-model";
import { MEDSPA_BOOKING, MEDSPA_HOURS, MEDSPA_MEMBER_NOTE, MEDSPA_OFFER, MEDSPA_REWARDS, PRACTICE_TYPES, type PracticeTypeId } from "@/lib/landing/medspa-data";
import { BOOKING_SYSTEMS, ROLES, STAGES, TREATMENT_OPTIONS } from "@/lib/landing/medspa-funnel";
import { CALL_MINUTES, COMMON_TZS, HOST_TZ, tzLabel } from "@/lib/landing/availability";
import { track } from "@/lib/landing/analytics";
import { LiveApp } from "@/components/landing/live-app/live-app";

const SWATCHES = ["#9f6b53", "#b08968", "#7c5c8e", "#2f6f73", "#c27c88", "#1f2937", "#8a9a5b", "#3b5b8c"];
const QUIZ = ["type", "name", "color", "visits", "value", "rebook", "recall"] as const;
type QuizId = (typeof QUIZ)[number];
type Phase = "quiz" | "results" | "about" | "nurture" | "time";
const LEAD_KEY = "atlas_medspa_lead";

const TITLES: Record<QuizId, { q: string; hint: string }> = {
  type: { q: "What kind of practice do you run?", hint: "We'll start your app with the right treatments and rewards." },
  name: { q: "What's your practice called?", hint: "This goes on your app's home screen." },
  color: { q: "Pick your brand color", hint: "Or drop in your logo and we'll pull the colors from it." },
  visits: { q: "How many patient visits in a typical month?", hint: "A rough guess is perfect." },
  value: { q: "What's a typical visit worth?", hint: "Roughly, across your treatments." },
  rebook: { q: "Of patients due for their next treatment, how many book on time?", hint: "Think about your neurotoxin patients at 3–4 months." },
  recall: { q: "How do you reach patients who are overdue today?", hint: "No wrong answers. This tells us how much room there is to grow." },
};

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

function useCountUp(target: number, run: boolean, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run) { setV(0); return; }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(target); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (now: number) => { const p = Math.min(1, (now - t0) / ms); setV(target * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

/** Meta click ids: the _fbp/_fbc cookies the Pixel sets, or one built from ?fbclid. Sent with the lead for better matching. */
function metaIds() {
  const c = (k: string) => document.cookie.split("; ").find((x) => x.startsWith(`${k}=`))?.split("=")[1] ?? "";
  let fbc = c("_fbc");
  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
  return { fbp: c("_fbp"), fbc };
}
function utms() {
  const p = new URLSearchParams(window.location.search);
  return { utm_source: p.get("utm_source") ?? "", utm_campaign: p.get("utm_campaign") ?? "", utm_content: p.get("utm_content") ?? "" };
}

export function MedspaFunnel({ source, firstFieldRef }: { source: string; firstFieldRef?: RefObject<HTMLInputElement> }) {
  const [phase, setPhase] = useState<Phase>("quiz");
  const [step, setStep] = useState(0);
  const [type, setType] = useState<PracticeTypeId>("medspa");
  const [typeChosen, setTypeChosen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [logo, setLogo] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [valueId, setValueId] = useState<string | null>(null);
  const [rebookId, setRebookId] = useState<string | null>(null);
  const [recallId, setRecallId] = useState<string | null>(null);
  const [showMath, setShowMath] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const started = useRef(false);
  const headRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A qualified lead coming back (follow-up email link, or same browser) goes straight to the calendar.
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("lead");
      const stored = JSON.parse(localStorage.getItem(LEAD_KEY) ?? "null") as { id: string; at: number; booked?: boolean; first?: string } | null;
      const id = fromUrl && /^[0-9a-f-]{36}$/i.test(fromUrl) ? fromUrl : stored && !stored.booked && Date.now() - stored.at < 14 * 864e5 ? stored.id : null;
      if (id) { setLeadId(id); setFirstName(stored?.id === id ? stored.first ?? "" : ""); setPhase("time"); }
    } catch { /* private mode: start fresh */ }
  }, []);

  useEffect(() => () => { if (logo) URL.revokeObjectURL(logo); }, [logo]);
  useEffect(() => () => { if (advance.current) clearTimeout(advance.current); }, []);

  const id: QuizId | null = phase === "quiz" ? QUIZ[step] : null;
  const venue = PRACTICE_TYPES.find((v) => v.id === type) ?? PRACTICE_TYPES[0];
  const brand: LiveBrand = useMemo(() => {
    const p = paletteFromColor(color);
    return { name: name.trim() || "Your Med Spa", logoUrl: logo, primary: p.primary, secondary: mix(p.primary, "#ffffff", 0.45), accent: p.secondary, heroUrl: venue.hero };
  }, [name, color, logo, venue.hero]);

  const visits = VISIT_BANDS.find((b) => b.id === visitId);
  const value = VALUE_BANDS.find((b) => b.id === valueId);
  const rebook = REBOOK.find((r) => r.id === rebookId);
  const recall = RECALL.find((r) => r.id === recallId);
  const est = useMemo(() => (visits && value && rebook && recall ? estimateMedspa(visits.mid, value.mid, rebook.lapse, recall.factor) : null), [visits, value, rebook, recall]);
  const likely = useCountUp(est?.likely ?? 0, phase === "results");

  useEffect(() => {
    if (id === "name") nameRef.current?.focus({ preventScroll: true });
    else headRef.current?.focus({ preventScroll: true });
  }, [id, phase]);

  useEffect(() => {
    if (phase === "results" && est) track("quiz_completed", { source, niche: "medspa", type, est_likely: est.likely, est_low: est.low, est_high: est.high });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const touch = () => { if (!started.current) { started.current = true; track("quiz_started", { source, niche: "medspa" }); } };
  const go = (to: number) => { if (advance.current) clearTimeout(advance.current); if (to >= QUIZ.length) setPhase("results"); else { setPhase("quiz"); setStep(Math.max(0, to)); } };
  function pick(set: () => void, stepId: QuizId, label: string, next: number) {
    touch(); set(); track("quiz_step", { source, step: stepId, answer: label });
    if (advance.current) clearTimeout(advance.current);
    advance.current = setTimeout(() => go(next), 260);
  }
  async function onLogo(f: File | undefined) {
    if (!f) return;
    touch();
    if (logo) URL.revokeObjectURL(logo);
    setLogo(URL.createObjectURL(f)); setLogoName(f.name);
    const cols = await dominantColorsFromFile(f, 3);
    if (cols[0]) setColor(cols[0]);
  }

  // Funnel stage chips across the top
  const stage = phase === "quiz" ? (step < 3 ? 0 : 1) : phase === "results" ? 1 : phase === "about" || phase === "nurture" ? 2 : 3;
  const quizPct = phase === "quiz" ? Math.round((step / QUIZ.length) * 100) : 100;
  const showPhone = phase === "quiz" || phase === "results";

  return (
    <div className={cn("grid gap-8 lg:items-start", showPhone && "lg:grid-cols-[minmax(0,1fr)_250px]")}>
      <div className="min-w-0">
        <ol className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-2 text-[12.5px] font-semibold" aria-label="Your progress">
          {["Your app", "Your numbers", "About you", "Pick a time"].map((t, i) => (
            <li key={t} className="flex items-center gap-2">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1", i < stage ? "bg-[var(--s-ice)] text-[var(--s-ocean-deep)]" : i === stage ? "bg-[var(--s-ocean)] text-white" : "bg-[#F1F4F8] text-[var(--s-ink-3)]")} aria-current={i === stage ? "step" : undefined}>
                {i < stage ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span className="tabular-nums">{i + 1}</span>}{t}
              </span>
              {i < 3 && <span aria-hidden className="h-px w-3 bg-[var(--s-line)]" />}
            </li>
          ))}
        </ol>
        {phase === "quiz" && (
          <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-[var(--s-ice)]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={quizPct} aria-label="Questions answered">
            <div className="h-full rounded-full bg-gradient-to-r from-[var(--s-sky)] to-[var(--s-ocean)] transition-[width] duration-500" style={{ width: `${Math.max(4, quizPct)}%` }} />
          </div>
        )}

        <div key={`${phase}-${step}`} className="animate-in fade-in slide-in-from-right-4 duration-300 motion-reduce:animate-none">
          {id && (
            <>
              <p className="text-[12px] font-semibold text-[var(--s-ocean)]">Question {step + 1} of {QUIZ.length}</p>
              <h3 ref={headRef} tabIndex={-1} className="mt-1 text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none sm:text-[1.85rem]">{TITLES[id].q}</h3>
              <p className="mt-2 text-[15px] text-[var(--s-ink-3)]">{TITLES[id].hint}</p>
            </>
          )}

          {id === "type" && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Practice type">
              {PRACTICE_TYPES.map((v) => {
                const sel = typeChosen && v.id === type;
                return (
                  <button key={v.id} type="button" role="radio" aria-checked={sel} onClick={() => pick(() => { setType(v.id); setTypeChosen(true); }, "type", v.label, 1)}
                    className={cn("s-focus group relative aspect-[4/3] overflow-hidden rounded-2xl border-2 text-left transition", sel ? "border-[var(--s-ocean)] ring-4 ring-[var(--s-ocean)]/15" : "border-transparent hover:border-[var(--s-ocean)]/40")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={optimizedUrl(v.hero, 480)} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <span className="absolute inset-0 bg-gradient-to-t from-[#06318F]/85 via-[#06318F]/15 to-transparent" />
                    <span className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[15px] font-bold text-white">{v.label}{sel && <span className="grid h-5 w-5 place-items-center rounded-full bg-white text-[var(--s-ocean)]"><Check className="h-3 w-3" aria-hidden /></span>}</span>
                  </button>
                );
              })}
            </div>
          )}

          {id === "name" && (
            <form className="mt-6" onSubmit={(e) => { e.preventDefault(); touch(); track("quiz_step", { source, step: "name", answer: name.trim() ? "named" : "skipped" }); go(2); }}>
              <input ref={nameRef} value={name} onChange={(e) => { touch(); setName(e.target.value.slice(0, 40)); }} placeholder="e.g. Luma Aesthetics" autoComplete="organization" className={cn(FIELD, "h-14 text-lg")} />
              <div className="mt-5 flex items-center gap-4">
                <button type="submit" className="s-btn s-btn-primary s-focus !h-12">Continue <ArrowRight className="h-4 w-4" aria-hidden /></button>
                {!name.trim() && <button type="button" onClick={() => go(2)} className="s-focus rounded text-sm text-[var(--s-ink-3)] hover:text-[var(--s-ink)]">Skip for now</button>}
              </div>
            </form>
          )}

          {id === "color" && (
            <div className="mt-6">
              <div className="flex flex-wrap items-center gap-3">
                {SWATCHES.map((c) => <button key={c} type="button" aria-label={`Color ${c}`} aria-pressed={c === color} onClick={() => { touch(); setColor(c); }} className={cn("s-focus h-11 w-11 rounded-full ring-offset-2 transition-transform hover:scale-110", c === color && "ring-2 ring-[var(--s-ink)]")} style={{ background: c }} />)}
                <label className="s-focus relative grid h-11 w-11 cursor-pointer place-items-center rounded-full border border-dashed border-[var(--s-ink-3)]/50 text-[var(--s-ink-3)]" title="Custom color">
                  <Pipette className="h-4 w-4" aria-hidden /><span className="sr-only">Custom color</span>
                  <input type="color" value={color} onChange={(e) => { touch(); setColor(e.target.value); }} className="absolute inset-0 cursor-pointer opacity-0" />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="s-focus inline-flex h-11 items-center gap-2 rounded-full border border-[var(--s-line)] bg-white px-4 text-sm font-semibold text-[var(--s-ink)] hover:border-[var(--s-ocean)]/40"><ImagePlus className="h-4 w-4 text-[var(--s-ocean)]" aria-hidden />{logoName ? "Change logo" : "Drop in your logo"}</button>
                {logoName && <button type="button" onClick={() => { if (logo) URL.revokeObjectURL(logo); setLogo(null); setLogoName(null); }} className="s-focus inline-flex h-11 items-center gap-1 rounded-lg px-2 text-xs text-[var(--s-ink-3)] hover:text-[var(--s-ink)]"><X className="h-3.5 w-3.5" aria-hidden /> Remove</button>}
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
              </div>
              <p className="mt-2 text-xs text-[var(--s-ink-3)]">Your logo stays in your browser. We only pull the colors.</p>
              <button type="button" onClick={() => { track("quiz_step", { source, step: "color", answer: logoName ? "logo" : color }); go(3); }} className="s-btn s-btn-primary s-focus mt-6 !h-12">Looks good <ArrowRight className="h-4 w-4" aria-hidden /></button>
            </div>
          )}

          {id === "visits" && <Options icon={Users} items={VISIT_BANDS} value={visitId} onPick={(b) => pick(() => setVisitId(b.id), "visits", b.label, 4)} />}
          {id === "value" && <Options icon={Wallet} items={VALUE_BANDS} value={valueId} onPick={(b) => pick(() => setValueId(b.id), "value", b.label, 5)} />}
          {id === "rebook" && <Options icon={CalendarDays} items={REBOOK} value={rebookId} onPick={(r) => pick(() => setRebookId(r.id), "rebook", r.label, 6)} />}
          {id === "recall" && (
            <Options items={RECALL.map((r) => ({ id: r.id, label: r.label, sub: r.sub, icon: r.id === "nothing" ? Ban : r.id === "manual" ? MessageSquare : r.id === "auto" ? Ticket : Smartphone }))}
              value={recallId} onPick={(r) => pick(() => setRecallId(r.id), "recall", r.label, 7)} />
          )}

          {phase === "results" && est && (
            <div>
              <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--s-ice)] px-3 py-1 text-xs font-bold text-[var(--s-ocean-deep)]"><Sparkles className="h-3.5 w-3.5" aria-hidden /> Your app is ready</p>
              <h3 ref={headRef} tabIndex={-1} className="mt-3 text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none sm:text-[1.85rem]">
                Here&apos;s what {brand.name === "Your Med Spa" ? "patient recall" : `${brand.name}${/s$/i.test(brand.name) ? "'" : "'s"} app`} could win back.
              </h3>
              <div className="s-ocean relative mt-5 overflow-hidden rounded-[24px] p-6 shadow-[0_26px_50px_-22px_rgba(11,95,214,.6)]">
                <div className="s-ocean-img opacity-60" aria-hidden />
                <div className="relative">
                  <div className="text-[13px] font-semibold text-white/80">Estimated recovered revenue, year one</div>
                  <div className="mt-1 text-5xl font-extrabold tabular-nums tracking-tight text-white sm:text-6xl" aria-label={`${fmtMoney(est.likely)} per year`}>{fmtMoney(likely)}</div>
                  <div className="mt-1.5 text-sm text-white/80">about {fmtMoney(est.perMonth)} a month · range {fmtMoney(est.low)} to {fmtMoney(est.high)} · roughly <b className="text-white">+{fmtPct(est.likelyPct)}</b></div>
                  <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                    {[[est.lapsedVisits.toLocaleString(), "due visits missed a year"], [est.recovered.toLocaleString(), "visits won back"], [`+${fmtPct(est.likelyPct)}`, "more revenue"]].map(([n, l]) => (
                      <div key={l} className="rounded-2xl bg-white/12 px-2 py-3 ring-1 ring-white/20 backdrop-blur"><div className="text-xl font-extrabold tabular-nums text-white sm:text-2xl">{n}</div><div className="mt-0.5 text-[11px] leading-tight text-white/75">{l}</div></div>
                    ))}
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => setShowMath((v) => !v)} aria-expanded={showMath} className="s-focus mt-4 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-[var(--s-ocean)] hover:underline">How we worked this out <ChevronDown className={cn("h-4 w-4 transition-transform", showMath && "rotate-180")} aria-hidden /></button>
              {showMath && (
                <div className="mt-2 rounded-2xl bg-[var(--s-paper)] p-4 text-[13px] leading-relaxed text-[var(--s-ink-2)] ring-1 ring-[var(--s-line)]">
                  <p>Neurotoxin lasts about 3–4 months ({CYCLE_SOURCE.replace(/ \(.*\)$/, "")}). You told us about <b>{Math.round((rebook?.lapse ?? 0) * 100)}%</b> of due visits don&apos;t happen on time, so roughly <b>{est.lapsedVisits.toLocaleString()}</b> visits a year slip.</p>
                  <p className="mt-2">Likely case: reminders, win-backs and membership offers recover <b>{Math.round(SCENARIOS.likely * 100)}%</b> of those{recall && recall.factor < 1 ? `, trimmed because you already use: ${recall.label.toLowerCase()}` : ""}. Low {Math.round(SCENARIOS.low * 100)}%, high {Math.round(SCENARIOS.high * 100)}%. These are planning assumptions, not measured results, and they leave out membership dues.</p>
                </div>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => { track("quiz_book_clicked", { source, est_likely: est.likely }); setPhase("about"); }} className="s-btn s-btn-primary s-focus">Walk me through it <ArrowRight className="h-4 w-4" aria-hidden /></button>
                <button type="button" onClick={() => go(0)} className="s-focus rounded text-sm text-[var(--s-ink-3)] hover:text-[var(--s-ink)]">Start over</button>
              </div>
              <p className="mt-3 text-[13px] text-[var(--s-ink-3)]">A 20-minute video call with Andrew, who&apos;ll bring this app and these numbers. Month to month, no pressure.</p>
            </div>
          )}

          {phase === "about" && (
            <AboutYou headRef={headRef} firstFieldRef={firstFieldRef} source={source} practice={name.trim()}
              answers={{ practice_type: venue.label, visit_band: visitId, value_band: valueId, rebook: rebookId, recall: recallId, estimate_likely: est?.likely ?? null, app_color: brand.primary }}
              onBack={() => setPhase("results")}
              onResult={(r) => {
                setFirstName(r.first);
                if (r.qualified && r.leadId) {
                  setLeadId(r.leadId);
                  try { localStorage.setItem(LEAD_KEY, JSON.stringify({ id: r.leadId, at: Date.now(), first: r.first })); } catch { /* ignore */ }
                  setPhase("time");
                } else setPhase("nurture");
              }} />
          )}

          {phase === "nurture" && (
            <div className="py-2">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--s-ice)] text-[var(--s-ocean)]"><Mail className="h-6 w-6" aria-hidden /></span>
              <h3 ref={headRef} tabIndex={-1} className="mt-4 text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none">Thanks{firstName ? `, ${firstName}` : ""}. Your estimate is on its way.</h3>
              <p className="mt-3 max-w-[34rem] text-[15px] leading-relaxed text-[var(--s-ink-2)]">From what you told us, a live walkthrough isn&apos;t the right next step yet. Walkthroughs are for owners and managers of practices that are open today. We&apos;ve emailed you your recall estimate and the demo app, so you can share it with whoever makes the call.</p>
              <p className="mt-3 max-w-[34rem] text-[15px] leading-relaxed text-[var(--s-ink-2)]">If that changes, reply to the email and Andrew will set up a time.</p>
              <a href="#demo" className="s-btn s-btn-quiet s-focus mt-6">Tap around the demo app</a>
            </div>
          )}

          {phase === "time" && leadId && <TimePicker leadId={leadId} firstName={firstName} source={source} headRef={headRef} extraNotes={est ? `Estimate: ${fmtMoney(est.likely)}/yr likely (${fmtMoney(est.low)}–${fmtMoney(est.high)}) · ${visits?.label} visits/mo · ${value?.label} per visit · rebook: ${rebook?.label} · recall today: ${recall?.label}${logoName ? ` · has a logo (${logoName}), ask them to email it` : ""}` : undefined} />}
        </div>

        {phase === "quiz" && step > 0 && (
          <button type="button" onClick={() => go(step - 1)} className="s-focus mt-8 inline-flex items-center gap-1.5 rounded text-sm text-[var(--s-ink-3)] hover:text-[var(--s-ink)]"><ArrowLeft className="h-4 w-4" aria-hidden /> Back</button>
        )}
      </div>

      {showPhone && (
        <div className={cn("lg:sticky lg:top-6", phase === "results" ? "block" : "hidden lg:block")}>
          <div className="relative mx-auto h-[522px] w-[246px]">
            <div className="absolute left-0 top-0 origin-top-left scale-[0.82]">
              <LiveApp brand={brand} categories={MEDSPA_BOOKING} rewards={MEDSPA_REWARDS} hours={MEDSPA_HOURS} offer={MEDSPA_OFFER} memberNote={MEDSPA_MEMBER_NOTE} guest="Alex" />
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-[var(--s-ink-3)]">{phase === "results" ? "Your app on day one. Tap it, it works." : "Your app updates as you answer."}</p>
        </div>
      )}
    </div>
  );
}

const FIELD = "s-focus h-12 w-full rounded-xl border border-[var(--s-line)] bg-white px-3.5 text-[15px] text-[var(--s-ink)] placeholder:text-[var(--s-ink-3)]/70 focus:border-[var(--s-ocean)]/60";

/* ───────────── STEP 1: the qualify form ───────────── */
function AboutYou({ headRef, firstFieldRef, source, practice, answers, onBack, onResult }: {
  headRef: RefObject<HTMLHeadingElement>; firstFieldRef?: RefObject<HTMLInputElement>; source: string; practice: string;
  answers: Record<string, string | number | null>;
  onBack: () => void; onResult: (r: { qualified: boolean; leadId: string | null; first: string }) => void;
}) {
  const [role, setRole] = useState<string>("");
  const [stage, setStage] = useState<string>("");
  const [treatments, setTreatments] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    if (!role || !stage) { setError("Pick your role and where your practice is today."); return; }
    if ((fd.phone ?? "").replace(/\D/g, "").length < 10) { setError("Please enter a mobile number with area code."); return; }
    setState("sending"); setError(null);
    track("lead_submitted", { source });
    try {
      const r = await fetch("/api/landing/lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fd, role, stage, treatments, ...answers, source, path: window.location.pathname, ...utms(), ...metaIds() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
      const first = String(fd.name ?? "").trim().split(/\s+/)[0] ?? "";
      if (j.qualified) track("lead_qualified", { source, event_id: j.event_id });
      else track("lead_unqualified", { source });
      onResult({ qualified: !!j.qualified, leadId: j.lead_id ?? null, first });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <button type="button" onClick={onBack} className="s-focus inline-flex items-center gap-1 rounded text-xs text-[var(--s-ink-3)] hover:text-[var(--s-ink)]"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to my results</button>
      <h3 ref={headRef} tabIndex={-1} className="mt-2 text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none sm:text-[1.85rem]">A few quick things before we pick a time.</h3>
      <p className="mt-2 text-[15px] text-[var(--s-ink-3)]">So Andrew comes to the call with your app built around your menu. About 30 seconds.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Your name"><input ref={firstFieldRef} name="name" required autoComplete="name" className={FIELD} placeholder="Maria Lopez" /></Field>
        <Field label="Practice name"><input name="business" required autoComplete="organization" defaultValue={practice || undefined} className={FIELD} placeholder="Luma Aesthetics" /></Field>
      </div>

      <Chips label="Your role" options={ROLES.map((r) => ({ id: r.id, label: r.label }))} value={role} onChange={setRole} />
      <Chips label="Where's your practice today?" options={STAGES.map((s) => ({ id: s.id, label: s.label }))} value={stage} onChange={setStage} />

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Email"><input name="email" type="email" required autoComplete="email" className={FIELD} placeholder="you@practice.com" /></Field>
        <Field label="Mobile"><input name="phone" type="tel" required autoComplete="tel" className={FIELD} placeholder="(805) 555-0123" /></Field>
        <Field label="Website or Instagram"><input name="website" autoComplete="url" className={FIELD} placeholder="lumaaesthetics.com or @luma" /></Field>
        <Field label="Booking software">
          <select name="booking_system" defaultValue="" className={cn(FIELD, "appearance-none")}>
            <option value="" disabled>Choose one</option>
            {BOOKING_SYSTEMS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      <fieldset className="mt-5">
        <legend className="text-[14px] font-semibold text-[var(--s-ink)]">Treatments you offer <span className="font-normal text-[var(--s-ink-3)]">(tap all that apply)</span></legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {TREATMENT_OPTIONS.map((t) => {
            const on = treatments.includes(t);
            return <button key={t} type="button" aria-pressed={on} onClick={() => setTreatments((v) => (on ? v.filter((x) => x !== t) : [...v, t]))} className={cn("s-focus inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors", on ? "border-[var(--s-ocean)] bg-[var(--s-ocean)] text-white" : "border-[var(--s-line)] bg-white text-[var(--s-ink-2)] hover:border-[var(--s-ocean)]/40")}>{on && <Check className="h-3.5 w-3.5" aria-hidden />}{t}</button>;
          })}
        </div>
      </fieldset>

      <Field label="What would make this worth it for you?" optional className="mt-5">
        <textarea name="worth_it" rows={2} className={cn(FIELD, "h-auto py-3")} placeholder="e.g. Get toxin patients back at 12 weeks, sell 30 memberships" />
      </Field>
      <input name="website_url_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      {error && <p role="alert" className="mt-4 text-sm font-medium text-rose-600">{error}</p>}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-[var(--s-ink-3)]"><Lock className="h-3.5 w-3.5" aria-hidden /> Used only to set up your call. No spam, no list selling.</p>
        <button type="submit" disabled={state === "sending"} className="s-btn s-btn-primary s-focus disabled:opacity-60">{state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}See open times <ArrowRight className="h-4 w-4" aria-hidden /></button>
      </div>
    </form>
  );
}

function Field({ label, optional, className, children }: { label: string; optional?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={cn("grid gap-1.5", className)}><span className="text-[14px] font-semibold text-[var(--s-ink)]">{label}{optional && <span className="font-normal text-[var(--s-ink-3)]"> (optional)</span>}</span>{children}</label>;
}

function Chips({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset className="mt-5">
      <legend className="text-[14px] font-semibold text-[var(--s-ink)]">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = o.id === value;
          return <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.id)} className={cn("s-focus inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-[14px] font-semibold transition-colors", on ? "border-[var(--s-ocean)] bg-[var(--s-ice)] text-[var(--s-ocean-deep)] ring-2 ring-[var(--s-ocean)]/20" : "border-[var(--s-line)] bg-white text-[var(--s-ink-2)] hover:border-[var(--s-ocean)]/40")}>{on && <Check className="h-3.5 w-3.5" aria-hidden />}{o.label}</button>;
        })}
      </div>
    </fieldset>
  );
}

function Options<T extends { id: string; label: string; sub?: string; icon?: React.ComponentType<{ className?: string }> }>({ items, value, onPick, icon: Default }: { items: T[]; value: string | null; onPick: (item: T) => void; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="mt-6 grid gap-2.5" role="radiogroup">
      {items.map((it) => {
        const Icon = it.icon ?? Default;
        const sel = it.id === value;
        return (
          <button key={it.id} type="button" role="radio" aria-checked={sel} onClick={() => onPick(it)}
            className={cn("s-focus flex items-center gap-4 rounded-2xl border-2 bg-white px-4 py-3.5 text-left transition", sel ? "border-[var(--s-ocean)] bg-[var(--s-ice)]/60 ring-4 ring-[var(--s-ocean)]/10" : "border-[var(--s-line)] hover:border-[var(--s-ocean)]/40 hover:bg-[var(--s-paper)]")}>
            {Icon && <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", sel ? "bg-[var(--s-ocean)] text-white" : "bg-[var(--s-ice)] text-[var(--s-ocean)]")}><Icon className="h-5 w-5" aria-hidden /></span>}
            <span className="min-w-0 flex-1"><span className="block text-[16px] font-bold text-[var(--s-ink)]">{it.label}</span>{it.sub && <span className="block text-[13px] text-[var(--s-ink-3)]">{it.sub}</span>}</span>
            <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", sel ? "border-[var(--s-ocean)] bg-[var(--s-ocean)] text-white" : "border-[var(--s-ink-3)]/40")}>{sel && <Check className="h-3.5 w-3.5" aria-hidden />}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── the calendar (qualified leads only) ───────────── */
function TimePicker({ leadId, firstName, source, headRef, extraNotes }: { leadId: string; firstName: string; source: string; headRef: RefObject<HTMLHeadingElement>; extraNotes?: string }) {
  const [slots, setSlots] = useState<Date[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tz, setTz] = useState(HOST_TZ);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Date | null>(null);
  const [state, setState] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { try { const d = Intl.DateTimeFormat().resolvedOptions().timeZone; if (d) setTz(d); } catch { /* keep host */ } }, []);
  useEffect(() => {
    let off = false;
    fetch("/api/landing/availability", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: { slots: string[] }) => { if (!off) setSlots(j.slots.map((s) => new Date(s))); })
      .catch(() => { if (!off) { setSlots([]); setFailed(true); } });
    return () => { off = true; };
  }, []);

  const dayFmt = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }), [tz]);
  const days = useMemo(() => {
    const m = new Map<string, Date[]>();
    for (const s of slots ?? []) { const k = dayFmt.format(s); (m.get(k) ?? m.set(k, []).get(k)!).push(s); }
    return Array.from(m.entries()).slice(0, 14);
  }, [slots, dayFmt]);
  useEffect(() => { if (!day && days[0]) setDay(days[0][0]); }, [days, day]);
  const times = days.find(([k]) => k === day)?.[1] ?? [];
  const fTime = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
  const fDay = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d);
  const fNum = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(d);
  const fLong = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(d);

  async function book() {
    if (!slot) return;
    setState("sending"); setError(null);
    try {
      const r = await fetch("/api/landing/demo-request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, source, path: window.location.pathname, slot_start: slot.toISOString(), timezone: tz, preferred_time: `${fLong(slot)} ${fTime(slot)} (${tz})`, notes: extraNotes, ...metaIds() }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 409 && !/already have a call/i.test(j.error ?? "")) {
        setSlots((s) => (s ?? []).filter((x) => x.getTime() !== slot.getTime())); setSlot(null);
        throw new Error(j.error || "That time was just taken. Please pick another.");
      }
      if (!r.ok) throw new Error(j.error || "Something went wrong.");
      track("demo_requested", { source, industry: "Med spa", slot: slot.toISOString(), calendar: j.calendar ?? "", event_id: j.event_id ?? undefined, qualified_lead: true });
      try { localStorage.setItem(LEAD_KEY, JSON.stringify({ id: leadId, at: Date.now(), booked: true })); } catch { /* ignore */ }
      window.location.assign(j.confirm_token ? `/medspa/confirm/${j.confirm_token}` : "/medspa");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  }

  return (
    <div>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--s-ice)] px-3 py-1 text-xs font-bold text-[var(--s-ocean-deep)]"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> You qualify for a walkthrough</p>
      <h3 ref={headRef} tabIndex={-1} className="mt-3 text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none sm:text-[1.85rem]">Pick a time{firstName ? `, ${firstName}` : ""}.</h3>
      <p className="mt-2 text-[15px] text-[var(--s-ink-3)]">{CALL_MINUTES} minutes on video with Andrew. He&apos;ll bring your app and your numbers.</p>

      {slots === null ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-[var(--s-ink-3)]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking Andrew&apos;s calendar…</p>
      ) : days.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-[var(--s-paper)] p-4 text-sm text-[var(--s-ink-2)] ring-1 ring-[var(--s-line)]">{failed ? "We couldn't load the calendar just now." : "No open times in the next two weeks."} Email <a className="font-semibold text-[var(--s-ocean)]" href="mailto:andrew@atlas-engine.app">andrew@atlas-engine.app</a> with two times that work and he&apos;ll send the invite.</p>
      ) : (
        <>
          <div className="mt-6 flex snap-x gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="radiogroup" aria-label="Choose a day">
            {days.map(([k, list]) => {
              const on = k === day;
              return (
                <button key={k} type="button" role="radio" aria-checked={on} onClick={() => { setDay(k); setSlot(null); }}
                  className={cn("s-focus flex w-[76px] shrink-0 snap-start flex-col items-center rounded-2xl border py-3 transition-colors", on ? "border-[var(--s-ocean)] bg-[var(--s-ocean)] text-white" : "border-[var(--s-line)] bg-white text-[var(--s-ink)] hover:border-[var(--s-ocean)]/40")}>
                  <span className={cn("text-[12px] font-semibold", on ? "text-white/80" : "text-[var(--s-ink-3)]")}>{fDay(list[0])}</span>
                  <span className="text-[15px] font-bold">{fNum(list[0])}</span>
                  <span className={cn("mt-1 text-[11px]", on ? "text-white/80" : "text-[var(--s-ocean)]")}>{list.length} open</span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Choose a time">
            {times.map((t) => {
              const on = slot?.getTime() === t.getTime();
              return <button key={t.toISOString()} type="button" role="radio" aria-checked={on} onClick={() => setSlot(t)} className={cn("s-focus h-11 rounded-xl border text-[14px] font-semibold transition-colors", on ? "border-[var(--s-ocean)] bg-[var(--s-ice)] text-[var(--s-ocean-deep)] ring-2 ring-[var(--s-ocean)]/25" : "border-[var(--s-line)] bg-white text-[var(--s-ink)] hover:border-[var(--s-ocean)]/50")}>{fTime(t)}</button>;
            })}
          </div>
          <label className="mt-4 flex items-center gap-2 text-xs text-[var(--s-ink-3)]">
            <span>Times shown in</span>
            <select value={tz} onChange={(e) => { setTz(e.target.value); setDay(null); setSlot(null); }} className="s-focus h-8 rounded-lg border border-[var(--s-line)] bg-white px-2 text-xs text-[var(--s-ink-2)]">
              {Array.from(new Set([tz, ...COMMON_TZS])).map((z) => <option key={z} value={z}>{tzLabel(z)}</option>)}
            </select>
          </label>
        </>
      )}

      {error && <p role="alert" className="mt-4 text-sm font-medium text-rose-600">{error}</p>}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--s-ink-3)]">{slot ? <>You picked <b className="text-[var(--s-ink)]">{fLong(slot)} at {fTime(slot)}</b>.</> : "Pick a day, then a time."}</p>
        <button type="button" onClick={book} disabled={!slot || state === "sending"} className="s-btn s-btn-primary s-focus disabled:opacity-50">{state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarDays className="h-4 w-4" aria-hidden />}Book this time</button>
      </div>
    </div>
  );
}
