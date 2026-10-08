"use client";
/**
 * components/medspa/medspa-funnel.tsx — the /medspa funnel, in the brand-site look.
 *
 *   Your app (type, name, color: a live app icon, no phone) → Your numbers (4 taps)
 *   → the estimate → About you: one compact form (STEP 1) → POST /api/landing/lead
 *       qualified  → Meta Lead (Pixel + CAPI, one event_id) → Pick a time (Calendly layout)
 *                    → booked → the pre-call page /medspa/confirm/<token>
 *       not a fit  → a kind "here's your estimate by email" screen. No calendar, no Meta signal.
 *
 * CP-201 built it; CP-202 Calendly booking + A/B arm; CP-203 cleaner questions
 * (lettered answer tiles, keyboard A–E), an estimate that shows its math, a
 * condensed About form, and no phone preview.
 *
 * A qualified visitor who leaves before booking can come back to /medspa/start?lead=<id>
 * (the follow-up email link) or on the same browser and lands on the calendar.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Globe, ImagePlus, Loader2, Lock, Mail, Pencil, Pipette, ShieldCheck, Sparkles, Video, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { optimizedUrl } from "@/lib/img";
import { dominantColorsFromFile, paletteFromColor } from "@/lib/logo-colors";
import { fmtMoney } from "@/lib/landing/quiz-model";
import { CYCLE_SOURCE, RECALL, REBOOK, SCENARIOS, VALUE_BANDS, VISIT_BANDS, estimateMedspa } from "@/lib/landing/medspa-quiz-model";
import { PRACTICE_TYPES, type PracticeTypeId } from "@/lib/landing/medspa-data";
import { BOOKING_SYSTEMS, ROLES, STAGES, TREATMENT_OPTIONS } from "@/lib/landing/medspa-funnel";
import { CALL_MINUTES, COMMON_TZS, HOST_TZ, tzLabel } from "@/lib/landing/availability";
import { track } from "@/lib/landing/analytics";

const SWATCHES = ["#9f6b53", "#b08968", "#7c5c8e", "#2f6f73", "#c27c88", "#1f2937", "#8a9a5b", "#3b5b8c"];
const QUIZ = ["type", "name", "color", "visits", "value", "rebook", "recall"] as const;
type QuizId = (typeof QUIZ)[number];
type Phase = "quiz" | "results" | "about" | "nurture" | "time";
const LEAD_KEY = "atlas_medspa_lead";
const LETTERS = "ABCDEFGH";

/** Which section each question belongs to, and its number inside that section. */
const SECTION: Record<QuizId, { name: "Your app" | "Your numbers"; n: number; of: number }> = {
  type: { name: "Your app", n: 1, of: 3 }, name: { name: "Your app", n: 2, of: 3 }, color: { name: "Your app", n: 3, of: 3 },
  visits: { name: "Your numbers", n: 1, of: 4 }, value: { name: "Your numbers", n: 2, of: 4 }, rebook: { name: "Your numbers", n: 3, of: 4 }, recall: { name: "Your numbers", n: 4, of: 4 },
};

const TITLES: Record<QuizId, { q: string; hint: string }> = {
  type: { q: "What kind of practice do you run?", hint: "We'll start your app with the right treatments and rewards." },
  name: { q: "What's your practice called?", hint: "It goes on your app's icon and home screen." },
  color: { q: "Pick your brand color", hint: "Or drop in your logo and we'll pull the colors from it." },
  visits: { q: "Patient visits in a typical month?", hint: "A rough guess is perfect." },
  value: { q: "What's a typical visit worth?", hint: "Roughly, across your treatments." },
  rebook: { q: "How many due patients book on time?", hint: "Think of your neurotoxin patients at 3–4 months." },
  recall: { q: "How do you reach overdue patients today?", hint: "No wrong answers. It tells us how much room there is to grow." },
};

/** Short labels for the "your answers" recap on the results screen. */
const RECAP = { rebook: { most: "80%+ rebook on time", half: "About half rebook", few: "Under half rebook", unknown: "Rebook rate unknown" } as Record<string, string> };

function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
const initials = (n: string) => (n.trim() ? n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") : "YM");

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

export function MedspaFunnel({ source, firstFieldRef, variant }: { source: string; firstFieldRef?: RefObject<HTMLInputElement>; variant?: string }) {
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
  const primary = useMemo(() => paletteFromColor(color).primary, [color]);
  const practice = name.trim() || "Your Med Spa";

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

  const choices = id === "visits" ? VISIT_BANDS : id === "value" ? VALUE_BANDS : id === "rebook" ? REBOOK : id === "recall" ? RECALL : null;
  const chosen = id === "visits" ? visitId : id === "value" ? valueId : id === "rebook" ? rebookId : id === "recall" ? recallId : null;
  const choose = (c: { id: string; label: string }) => {
    if (!id) return;
    const set = id === "visits" ? setVisitId : id === "value" ? setValueId : id === "rebook" ? setRebookId : setRecallId;
    pick(() => set(c.id), id, c.label, step + 1);
  };
  // Keyboard: A–E picks an answer on the choice questions (Typeform style).
  useEffect(() => {
    if (!choices) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest("input,textarea,select")) return;
      const i = LETTERS.indexOf(e.key.toUpperCase());
      if (i >= 0 && i < choices.length) { e.preventDefault(); choose(choices[i]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices, step]);

  const stage = phase === "quiz" ? (step < 3 ? 0 : 1) : phase === "results" ? 1 : phase === "about" || phase === "nurture" ? 2 : 3;
  const sec = id ? SECTION[id] : null;

  return (
    <div className={cn("mx-auto", phase === "time" ? "max-w-none" : "max-w-[720px]")}>
      {/* Where you are in the funnel */}
      <ol className="mb-7 flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-[12.5px] font-semibold" aria-label="Your progress">
        {["Your app", "Your numbers", "About you", "Pick a time"].map((t, i) => (
          <li key={t} className="flex items-center gap-2">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1", i < stage ? "bg-[var(--s-ice)] text-[var(--s-ocean-deep)]" : i === stage ? "bg-[var(--s-ocean)] text-white" : "bg-[#F1F4F8] text-[var(--s-ink-3)]")} aria-current={i === stage ? "step" : undefined}>
              {i < stage ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span className="tabular-nums">{i + 1}</span>}{t}
            </span>
            {i < 3 && <span aria-hidden className="h-px w-3 bg-[var(--s-line)]" />}
          </li>
        ))}
      </ol>

      <div key={`${phase}-${step}`} className="animate-in fade-in slide-in-from-right-4 duration-300 motion-reduce:animate-none">
        {id && sec && (
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--s-ocean)]">{sec.name} · {sec.n} of {sec.of}</span>
              <span className="flex flex-1 gap-1" aria-hidden>
                {Array.from({ length: sec.of }).map((_, i) => <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i < sec.n ? "bg-[var(--s-ocean)]" : "bg-[var(--s-ice)]")} />)}
              </span>
            </div>
            <h3 ref={headRef} tabIndex={-1} className="mt-4 text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none sm:text-[1.9rem]">{TITLES[id].q}</h3>
            <p className="mt-1.5 text-[15px] text-[var(--s-ink-3)]">{TITLES[id].hint}</p>
          </div>
        )}

        {id === "type" && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Practice type">
            {PRACTICE_TYPES.map((v) => {
              const sel = typeChosen && v.id === type;
              return (
                <button key={v.id} type="button" role="radio" aria-checked={sel} onClick={() => pick(() => { setType(v.id); setTypeChosen(true); }, "type", v.label, 1)}
                  className={cn("s-focus group relative aspect-[4/3] overflow-hidden rounded-2xl border-2 bg-[var(--s-ice)] text-left transition", sel ? "border-[var(--s-ocean)] ring-4 ring-[var(--s-ocean)]/15" : "border-transparent hover:border-[var(--s-ocean)]/40")}>
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
          <form onSubmit={(e) => { e.preventDefault(); touch(); track("quiz_step", { source, step: "name", answer: name.trim() ? "named" : "skipped" }); go(2); }}>
            <input ref={nameRef} value={name} onChange={(e) => { touch(); setName(e.target.value.slice(0, 40)); }} placeholder="e.g. Luma Aesthetics" autoComplete="organization" className={cn(FIELD, "h-14 text-lg")} />
            <div className="mt-5 flex items-center gap-4">
              <button type="submit" className="s-btn s-btn-primary s-focus !h-12">Continue <ArrowRight className="h-4 w-4" aria-hidden /></button>
              {!name.trim() && <button type="button" onClick={() => go(2)} className="s-focus rounded text-sm text-[var(--s-ink-3)] hover:text-[var(--s-ink)]">Skip for now</button>}
            </div>
          </form>
        )}

        {id === "color" && (
          <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
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
            <AppIcon name={practice} color={primary} logo={logo} />
          </div>
        )}

        {choices && id && <Choices items={choices} value={chosen} onPick={choose} />}

        {phase === "results" && est && visits && value && rebook && recall && (
          <div>
            <div className="flex items-center gap-3">
              <AppIcon name={practice} color={primary} logo={logo} size="sm" />
              <div>
                <p className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--s-ocean)]"><Sparkles className="h-3.5 w-3.5" aria-hidden /> {practice}&apos;s app is ready</p>
                <h3 ref={headRef} tabIndex={-1} className="mt-0.5 text-[1.45rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none sm:text-[1.7rem]">Here&apos;s what patient recall could win back.</h3>
              </div>
            </div>

            <div className="s-ocean relative mt-6 overflow-hidden rounded-[24px] p-6 shadow-[0_26px_50px_-22px_rgba(11,95,214,.6)] sm:p-7">
              <div className="s-ocean-img opacity-60" aria-hidden />
              <div className="relative">
                <div className="text-[13px] font-semibold text-white/80">Estimated recovered revenue, year one</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                  <span className="text-5xl font-extrabold tabular-nums tracking-tight text-white sm:text-6xl" aria-label={`${fmtMoney(est.likely)} per year`}>{fmtMoney(likely)}</span>
                  <span className="text-[15px] font-semibold text-white/85">about {fmtMoney(est.perMonth)} a month</span>
                </div>
                {/* The math, as a row: missed → won back → value */}
                <ol className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
                  <MathTile big={est.lapsedVisits.toLocaleString()} small="due visits slip a year" />
                  <Op>→</Op>
                  <MathTile big={est.recovered.toLocaleString()} small={`won back (${Math.round(SCENARIOS.likely * 100 * recall.factor)}%)`} />
                  <Op>×</Op>
                  <MathTile big={fmtMoney(value.mid)} small="per visit" />
                </ol>
                <p className="mt-4 text-[12.5px] text-white/70">Range {fmtMoney(est.low)} to {fmtMoney(est.high)}. A planning estimate, not a promise.</p>
              </div>
            </div>

            {/* What they told us, with a way back */}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
              {[`${visits.label} visits/mo`, `${value.label} a visit`, RECAP.rebook[rebook.id] ?? rebook.label, recall.label].map((t) => <span key={t} className="rounded-full bg-[var(--s-paper)] px-3 py-1 font-medium text-[var(--s-ink-2)] ring-1 ring-[var(--s-line)]">{t}</span>)}
              <button type="button" onClick={() => go(3)} className="s-focus inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-[var(--s-ocean)] hover:underline"><Pencil className="h-3.5 w-3.5" aria-hidden />Edit</button>
            </div>

            <button type="button" onClick={() => setShowMath((v) => !v)} aria-expanded={showMath} className="s-focus mt-3 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-[var(--s-ocean)] hover:underline">Where these numbers come from <ChevronDown className={cn("h-4 w-4 transition-transform", showMath && "rotate-180")} aria-hidden /></button>
            {showMath && (
              <div className="mt-2 rounded-2xl bg-[var(--s-paper)] p-4 text-[13px] leading-relaxed text-[var(--s-ink-2)] ring-1 ring-[var(--s-line)]">
                <p>About {visits.mid.toLocaleString()} visits a month is {(visits.mid * 12).toLocaleString()} a year. You said about <b>{Math.round(rebook.lapse * 100)}%</b> of due visits don&apos;t happen on time, so roughly <b>{est.lapsedVisits.toLocaleString()}</b> slip. Neurotoxin lasts about 3–4 months ({CYCLE_SOURCE.replace(/ \(.*\)$/, "")}).</p>
                <p className="mt-2">Likely case: reminders, win-backs and membership offers bring back <b>{Math.round(SCENARIOS.likely * 100)}%</b> of those{recall.factor < 1 ? `, trimmed because you already use: ${recall.label.toLowerCase()}` : ""}. Low {Math.round(SCENARIOS.low * 100)}%, high {Math.round(SCENARIOS.high * 100)}%. These are planning assumptions, not measured results, and they leave out membership dues.</p>
              </div>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => { track("quiz_book_clicked", { source, est_likely: est.likely }); setPhase("about"); }} className="s-btn s-btn-primary s-focus">Walk me through it <ArrowRight className="h-4 w-4" aria-hidden /></button>
              <button type="button" onClick={() => go(0)} className="s-focus rounded text-sm text-[var(--s-ink-3)] hover:text-[var(--s-ink)]">Start over</button>
            </div>
            <p className="mt-3 text-[13px] text-[var(--s-ink-3)]">A 20-minute video call with Andrew, who&apos;ll bring your app and these numbers. Month to month, no pressure.</p>
          </div>
        )}

        {phase === "about" && (
          <AboutYou headRef={headRef} firstFieldRef={firstFieldRef} source={source} practice={name.trim()}
            answers={{ variant: variant ?? null, practice_type: venue.label, visit_band: visitId, value_band: valueId, rebook: rebookId, recall: recallId, estimate_likely: est?.likely ?? null, app_color: primary }}
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
          <div className="py-2 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--s-ice)] text-[var(--s-ocean)]"><Mail className="h-6 w-6" aria-hidden /></span>
            <h3 ref={headRef} tabIndex={-1} className="mt-4 text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none">Thanks{firstName ? `, ${firstName}` : ""}. Your estimate is on its way.</h3>
            <p className="mx-auto mt-3 max-w-[34rem] text-[15px] leading-relaxed text-[var(--s-ink-2)]">From what you told us, a live walkthrough isn&apos;t the right next step yet. Walkthroughs are for owners and managers of practices that are open today. We&apos;ve emailed you your recall estimate and the demo app, so you can share it with whoever makes the call.</p>
            <p className="mx-auto mt-3 max-w-[34rem] text-[15px] leading-relaxed text-[var(--s-ink-2)]">If that changes, reply to the email and Andrew will set up a time.</p>
            <a href="/medspa#demo" className="s-btn s-btn-quiet s-focus mt-6">Tap around the demo app</a>
          </div>
        )}

        {phase === "time" && leadId && <TimePicker leadId={leadId} firstName={firstName} practice={name.trim()} source={source} headRef={headRef} extraNotes={est ? `Estimate: ${fmtMoney(est.likely)}/yr likely (${fmtMoney(est.low)}–${fmtMoney(est.high)}) · ${visits?.label} visits/mo · ${value?.label} per visit · rebook: ${rebook?.label} · recall today: ${recall?.label}${logoName ? ` · has a logo (${logoName}), ask them to email it` : ""}` : undefined} />}
      </div>

      {phase === "quiz" && step > 0 && (
        <button type="button" onClick={() => go(step - 1)} className="s-focus mt-8 inline-flex items-center gap-1.5 rounded text-sm text-[var(--s-ink-3)] hover:text-[var(--s-ink)]"><ArrowLeft className="h-4 w-4" aria-hidden /> Back</button>
      )}
    </div>
  );
}

/** The practice's app icon, as it'll sit on a patient's home screen. Replaces the full phone preview. */
function AppIcon({ name, color, logo, size = "lg" }: { name: string; color: string; logo: string | null; size?: "lg" | "sm" }) {
  const lg = size === "lg";
  return (
    <figure className={cn("flex shrink-0 flex-col items-center", lg && "mx-auto rounded-[28px] bg-[var(--s-paper)] px-8 py-6 ring-1 ring-[var(--s-line)]")}>
      <span className={cn("grid place-items-center overflow-hidden text-white shadow-[0_14px_30px_-12px_rgba(0,0,0,.45)]", lg ? "h-24 w-24 rounded-[26px] text-[2rem]" : "h-14 w-14 rounded-[16px] text-[1.1rem]")}
        style={{ background: `linear-gradient(145deg, ${mix(color, "#ffffff", 0.18)}, ${color} 55%, ${mix(color, "#000000", 0.25)})` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt="" className="h-full w-full bg-white object-contain p-2" /> : <span className="font-extrabold tracking-tight">{initials(name)}</span>}
      </span>
      {lg && <figcaption className="mt-3 max-w-[9rem] truncate text-center text-[13px] font-semibold text-[var(--s-ink)]">{name}</figcaption>}
      {lg && <span className="mt-0.5 text-[11px] text-[var(--s-ink-3)]">on her home screen</span>}
    </figure>
  );
}

function MathTile({ big, small }: { big: string; small: string }) {
  return <li className="rounded-2xl bg-white/12 px-4 py-3 ring-1 ring-white/20 backdrop-blur"><div className="text-[1.5rem] font-extrabold tabular-nums leading-none text-white">{big}</div><div className="mt-1.5 text-[12px] leading-tight text-white/75">{small}</div></li>;
}
function Op({ children }: { children: React.ReactNode }) {
  return <li aria-hidden className="hidden place-items-center px-1 text-[1.3rem] font-bold text-white/70 sm:grid">{children}</li>;
}

const FIELD = "s-focus h-12 w-full rounded-xl border border-[var(--s-line)] bg-white px-3.5 text-[15px] text-[var(--s-ink)] placeholder:text-[var(--s-ink-3)]/70 focus:border-[var(--s-ocean)]/60";
const FIELD_SM = "s-focus h-11 w-full rounded-xl border border-[var(--s-line)] bg-white px-3 text-[15px] text-[var(--s-ink)] placeholder:text-[var(--s-ink-3)]/70 focus:border-[var(--s-ocean)]/60";

/* ───────────── STEP 1: the qualify form, condensed (CP-203) ─────────────
 * Six required fields in three rows, two optional ones, and the extras
 * (treatments, "what would make it worth it") folded behind one link. */
function AboutYou({ headRef, firstFieldRef, source, practice, answers, onBack, onResult }: {
  headRef: RefObject<HTMLHeadingElement>; firstFieldRef?: RefObject<HTMLInputElement>; source: string; practice: string;
  answers: Record<string, string | number | null>;
  onBack: () => void; onResult: (r: { qualified: boolean; leadId: string | null; first: string }) => void;
}) {
  const [treatments, setTreatments] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [state, setState] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    if (!fd.name?.trim() || !fd.business?.trim()) { setError("Please add your name and your practice's name."); return; }
    if (!fd.role || !fd.stage) { setError("Pick your role and where your practice is today."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fd.email ?? "")) { setError("Please enter a valid email."); return; }
    if ((fd.phone ?? "").replace(/\D/g, "").length < 10) { setError("Please enter a mobile number with area code."); return; }
    setState("sending"); setError(null);
    track("lead_submitted", { source });
    try {
      const r = await fetch("/api/landing/lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fd, treatments, ...answers, source, path: window.location.pathname, ...utms(), ...metaIds() }),
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
      <h3 ref={headRef} tabIndex={-1} className="mt-2 text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none sm:text-[1.85rem]">Where should Andrew send the invite?</h3>
      <p className="mt-1.5 text-[15px] text-[var(--s-ink-3)]">30 seconds. Then pick a time.</p>

      <div className="mt-6 grid gap-x-3 gap-y-4 sm:grid-cols-2">
        <Field label="Your name"><input ref={firstFieldRef} name="name" required autoComplete="name" className={FIELD_SM} placeholder="Maria Lopez" /></Field>
        <Field label="Practice name"><input name="business" required autoComplete="organization" defaultValue={practice || undefined} className={FIELD_SM} placeholder="Luma Aesthetics" /></Field>
        <Field label="Your role">
          <Select name="role" placeholder="Choose your role" options={ROLES.map((r) => [r.id, r.label])} />
        </Field>
        <Field label="Your practice today">
          <Select name="stage" placeholder="Choose one" options={STAGES.map((s) => [s.id, s.label])} />
        </Field>
        <Field label="Email"><input name="email" type="email" required autoComplete="email" className={FIELD_SM} placeholder="you@practice.com" /></Field>
        <Field label="Mobile"><input name="phone" type="tel" required autoComplete="tel" className={FIELD_SM} placeholder="(805) 555-0123" /></Field>
        <Field label="Website or Instagram" optional><input name="website" autoComplete="url" className={FIELD_SM} placeholder="lumaaesthetics.com or @luma" /></Field>
        <Field label="Booking software" optional>
          <Select name="booking_system" placeholder="Choose one" options={BOOKING_SYSTEMS.map((s) => [s, s])} />
        </Field>
      </div>

      {!more ? (
        <button type="button" onClick={() => setMore(true)} className="s-focus mt-4 inline-flex items-center gap-1.5 rounded text-[13.5px] font-semibold text-[var(--s-ocean)] hover:underline">+ Tell Andrew more (optional)</button>
      ) : (
        <div className="mt-5 grid gap-4 rounded-2xl bg-[var(--s-paper)] p-4 ring-1 ring-[var(--s-line)]">
          <fieldset>
            <legend className="text-[13.5px] font-semibold text-[var(--s-ink)]">Treatments you offer</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TREATMENT_OPTIONS.map((t) => {
                const on = treatments.includes(t);
                return <button key={t} type="button" aria-pressed={on} onClick={() => setTreatments((v) => (on ? v.filter((x) => x !== t) : [...v, t]))} className={cn("s-focus inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold transition-colors", on ? "border-[var(--s-ocean)] bg-[var(--s-ocean)] text-white" : "border-[var(--s-line)] bg-white text-[var(--s-ink-2)] hover:border-[var(--s-ocean)]/40")}>{on && <Check className="h-3 w-3" aria-hidden />}{t}</button>;
              })}
            </div>
          </fieldset>
          <Field label="What would make this worth it for you?"><textarea name="worth_it" rows={2} className={cn(FIELD_SM, "h-auto py-2.5")} placeholder="e.g. Get toxin patients back at 12 weeks, sell 30 memberships" /></Field>
        </div>
      )}
      <input name="website_url_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      {error && <p role="alert" className="mt-4 text-sm font-medium text-rose-600">{error}</p>}
      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[var(--s-line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5 text-xs text-[var(--s-ink-3)]"><Lock className="h-3.5 w-3.5" aria-hidden /> Only used to set up your call. No spam.</p>
        <button type="submit" disabled={state === "sending"} className="s-btn s-btn-primary s-focus disabled:opacity-60">{state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}See open times <ArrowRight className="h-4 w-4" aria-hidden /></button>
      </div>
    </form>
  );
}

function Field({ label, optional, className, children }: { label: string; optional?: boolean; className?: string; children: React.ReactNode }) {
  return <label className={cn("grid gap-1.5", className)}><span className="text-[13.5px] font-semibold text-[var(--s-ink)]">{label}{optional && <span className="font-normal text-[var(--s-ink-3)]"> (optional)</span>}</span>{children}</label>;
}

function Select({ name, placeholder, options }: { name: string; placeholder: string; options: [string, string][] }) {
  return (
    <span className="relative block">
      <select name={name} defaultValue="" className={cn(FIELD_SM, "appearance-none pr-9 invalid:text-[var(--s-ink-3)]")} required>
        <option value="" disabled>{placeholder}</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--s-ink-3)]" />
    </span>
  );
}

/** Answer tiles with a letter key (press A–E), two columns on wider screens. */
function Choices<T extends { id: string; label: string; sub?: string }>({ items, value, onPick }: { items: T[]; value: string | null; onPick: (item: T) => void }) {
  return (
    <div className={cn("grid gap-2.5", items.length > 3 && "sm:grid-cols-2")} role="radiogroup">
      {items.map((it, i) => {
        const sel = it.id === value;
        return (
          <button key={it.id} type="button" role="radio" aria-checked={sel} onClick={() => onPick(it)}
            className={cn("s-focus group flex items-center gap-3.5 rounded-2xl border bg-white px-4 py-3.5 text-left transition", sel ? "border-[var(--s-ocean)] bg-[var(--s-ice)]/70 ring-2 ring-[var(--s-ocean)]/25" : "border-[var(--s-line)] hover:border-[var(--s-ocean)]/50 hover:bg-[var(--s-paper)]",
              items.length % 2 === 1 && i === items.length - 1 && items.length > 3 && "sm:col-span-2")}>
            <kbd className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg border font-sans text-[12px] font-bold transition-colors", sel ? "border-[var(--s-ocean)] bg-[var(--s-ocean)] text-white" : "border-[var(--s-line)] bg-[var(--s-paper)] text-[var(--s-ink-3)] group-hover:border-[var(--s-ocean)]/40 group-hover:text-[var(--s-ocean)]")}>{sel ? <Check className="h-3.5 w-3.5" aria-hidden /> : LETTERS[i]}</kbd>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-bold leading-tight text-[var(--s-ink)]">{it.label}</span>
              {it.sub && <span className="mt-0.5 block text-[13px] leading-snug text-[var(--s-ink-3)]">{it.sub}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── the calendar (qualified leads only) — CP-202: Calendly layout ─────────────
 * People know Calendly's page, so this mirrors it: who/what/how long on the left,
 * a month grid in the middle, the day's times on the right, a time splits into
 * [time | Next], then one confirm screen. Times come from Andrew's Google Calendar
 * (GET /api/landing/availability) and are shown in the visitor's timezone. */
function TimePicker({ leadId, firstName, practice, source, headRef, extraNotes }: { leadId: string; firstName: string; practice: string; source: string; headRef: RefObject<HTMLHeadingElement>; extraNotes?: string }) {
  const [slots, setSlots] = useState<Date[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tz, setTz] = useState(HOST_TZ);
  const [day, setDay] = useState<string | null>(null);
  const [month, setMonth] = useState<{ y: number; m: number } | null>(null);
  const [pending, setPending] = useState<Date | null>(null);
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

  const keyFmt = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }), [tz]);
  const byDay = useMemo(() => {
    const m = new Map<string, Date[]>();
    for (const s of slots ?? []) { const k = keyFmt.format(s); (m.get(k) ?? m.set(k, []).get(k)!).push(s); }
    return m;
  }, [slots, keyFmt]);
  const firstKey = useMemo(() => Array.from(byDay.keys()).sort()[0] ?? null, [byDay]);
  useEffect(() => {
    if (!month) { const k = firstKey ?? keyFmt.format(new Date()); setMonth({ y: +k.slice(0, 4), m: +k.slice(5, 7) - 1 }); }
  }, [firstKey, keyFmt, month]);
  // Calendly opens with the first open day already selected on desktop.
  useEffect(() => { if (!day && firstKey && window.matchMedia("(min-width: 1024px)").matches) setDay(firstKey); }, [firstKey, day]);

  const todayKey = keyFmt.format(new Date());
  const times = day ? byDay.get(day) ?? [] : [];
  const lc = (t: string) => t.replace(" AM", "am").replace(" PM", "pm");
  const fTime = (d: Date) => lc(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d));
  const fLong = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(d);
  const dayTitle = day ? new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)) : "";

  // Month grid, Monday first (Calendly's US layout)
  const grid = useMemo(() => {
    if (!month) return [];
    const first = new Date(Date.UTC(month.y, month.m, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const n = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
    return [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)] as Array<number | null>;
  }, [month]);
  const keyOf = (d: number) => month ? `${month.y}-${String(month.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
  const monthLabel = month ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(month.y, month.m, 1))) : "";
  const canPrev = month ? `${month.y}-${String(month.m + 1).padStart(2, "0")}` > todayKey.slice(0, 7) : false;
  const shift = (d: number) => setMonth((v) => (v ? { y: v.m + d < 0 ? v.y - 1 : v.m + d > 11 ? v.y + 1 : v.y, m: (v.m + d + 12) % 12 } : v));

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
        setSlots((s) => (s ?? []).filter((x) => x.getTime() !== slot.getTime())); setSlot(null); setPending(null);
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

  const BLUE = "var(--s-ocean)";
  return (
    <div className="overflow-hidden rounded-[18px] border border-[#E3E8EF] bg-white text-[#1A1A1A] shadow-[0_1px_8px_rgba(0,0,0,.06)]">
      <div className={cn("grid", slot ? "lg:grid-cols-[minmax(0,320px)_1fr]" : day ? "lg:grid-cols-[minmax(0,300px)_1fr_minmax(0,240px)]" : "lg:grid-cols-[minmax(0,300px)_1fr]")}>
        {/* Left: who, what, how long */}
        <aside className="border-b border-[#E3E8EF] p-6 lg:border-b-0 lg:border-r lg:p-7">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full" style={{ background: BLUE }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/atlas-icon-white.png" alt="" width={1100} height={852} className="h-[17px] w-auto object-contain" />
            </span>
            <span className="text-[15px] font-semibold text-[#6B6B6B]">Andrew Montano</span>
          </div>
          <h3 ref={headRef} tabIndex={-1} className="mt-3 text-[1.6rem] font-bold leading-tight tracking-[-0.02em] outline-none">Atlas app walkthrough</h3>
          <ul className="mt-5 space-y-3 text-[15px] font-semibold text-[#6B6B6B]">
            <li className="flex items-center gap-3"><Clock className="h-5 w-5" aria-hidden />{CALL_MINUTES} min</li>
            <li className="flex items-start gap-3"><Video className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />Video call details provided upon confirmation.</li>
            {slot && <li className="flex items-start gap-3 text-[#1A7F4B]"><CalendarDays className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />{fTime(slot)} – {fTime(new Date(slot.getTime() + CALL_MINUTES * 60_000))}, {fLong(slot)}</li>}
            {slot && <li className="flex items-center gap-3"><Globe className="h-5 w-5" aria-hidden />{tzLabel(tz, slot)}</li>}
          </ul>
          <p className="mt-5 text-[14px] leading-relaxed text-[#4D4D4D]">{firstName ? `${firstName}, ` : ""}Andrew will walk through the app he built for {practice || "your practice"}, your recall numbers, and what setup looks like. You decide if it&apos;s a fit.</p>
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--s-ice)] px-2.5 py-1 text-[12px] font-bold text-[var(--s-ocean-deep)]"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> You qualify for a walkthrough</p>
        </aside>

        {slot ? (
          /* Confirm */
          <section className="p-6 lg:p-8" aria-label="Confirm your time">
            <button type="button" onClick={() => { setSlot(null); setPending(null); }} className="s-focus grid h-11 w-11 place-items-center rounded-full border border-[#E3E8EF] text-[var(--s-ocean)] hover:bg-[#F2F7FF]" aria-label="Back to times"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
            <h4 className="mt-5 text-[1.25rem] font-bold">Confirm your walkthrough</h4>
            <p className="mt-2 max-w-[30rem] text-[15px] leading-relaxed text-[#4D4D4D]">We&apos;ll send the calendar invite and video link to the email you gave us. Next you&apos;ll see a short page to confirm you can make it.</p>
            <div className="mt-6 rounded-xl border border-[#E3E8EF] p-4 text-[15px]">
              <div className="font-bold">{fLong(slot)}</div>
              <div className="text-[#4D4D4D]">{fTime(slot)} · {CALL_MINUTES} minutes · {tzLabel(tz, slot)}</div>
            </div>
            {error && <p role="alert" className="mt-4 text-sm font-medium text-rose-600">{error}</p>}
            <button type="button" onClick={book} disabled={state === "sending"} className="s-focus mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-[15px] font-bold text-white disabled:opacity-60" style={{ background: BLUE }}>
              {state === "sending" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}Schedule event
            </button>
          </section>
        ) : (
          <>
            {/* Middle: the month */}
            <section className="p-6 lg:p-7" aria-label="Select a date">
              <h4 className="text-[1.2rem] font-bold">Select a Date &amp; Time</h4>
              {slots === null ? (
                <p className="mt-8 flex items-center gap-2 text-sm text-[#6B6B6B]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking Andrew&apos;s calendar…</p>
              ) : byDay.size === 0 ? (
                <p className="mt-6 rounded-xl bg-[#F7F9FC] p-4 text-sm text-[#4D4D4D]">{failed ? "We couldn't load the calendar just now." : "No open times in the next few weeks."} Email <span className="font-semibold">andrew@atlas-engine.app</span> with two times that work and he&apos;ll send the invite.</p>
              ) : (
                <>
                  <div className="mt-5 flex items-center justify-center gap-6">
                    <button type="button" onClick={() => shift(-1)} disabled={!canPrev} className="s-focus grid h-10 w-10 place-items-center rounded-full text-[var(--s-ocean)] enabled:hover:bg-[#F2F7FF] disabled:text-[#C9CED6]" aria-label="Previous month"><ChevronLeft className="h-5 w-5" aria-hidden /></button>
                    <span className="min-w-[10rem] text-center text-[15px] font-medium" aria-live="polite">{monthLabel}</span>
                    <button type="button" onClick={() => shift(1)} className="s-focus grid h-10 w-10 place-items-center rounded-full bg-[#F2F7FF] text-[var(--s-ocean)] hover:bg-[#E3EEFF]" aria-label="Next month"><ChevronRight className="h-5 w-5" aria-hidden /></button>
                  </div>
                  <div className="mx-auto mt-4 grid max-w-[420px] grid-cols-7 gap-y-1 text-center">
                    {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => <span key={d} className="pb-2 text-[11px] font-medium tracking-wide text-[#4D4D4D]">{d}</span>)}
                    {grid.map((d, i) => {
                      if (!d) return <span key={`e${i}`} />;
                      const k = keyOf(d);
                      const open = byDay.has(k);
                      const on = k === day;
                      return (
                        <span key={k} className="grid place-items-center">
                          <button type="button" disabled={!open} onClick={() => { setDay(k); setPending(null); track("interactive_demo_used", { demo: "booking_calendar" }); }}
                            aria-pressed={on} aria-label={`${k}${open ? `, ${byDay.get(k)!.length} times open` : ", no times"}`}
                            className={cn("s-focus relative grid h-11 w-11 place-items-center rounded-full text-[15px] transition-colors sm:h-12 sm:w-12",
                              on ? "font-bold text-white" : open ? "bg-[#E8F1FF] font-bold text-[var(--s-ocean)] hover:bg-[#D4E5FF]" : "text-[#B3B9C3]")}
                            style={on ? { background: BLUE } : undefined}>
                            {d}
                            {k === todayKey && <span aria-hidden className={cn("absolute bottom-1.5 h-1 w-1 rounded-full", on ? "bg-white" : open ? "bg-[var(--s-ocean)]" : "bg-[#B3B9C3]")} />}
                          </button>
                        </span>
                      );
                    })}
                  </div>
                  <div className="mx-auto mt-6 max-w-[420px]">
                    <div className="text-[14px] font-bold">Time zone</div>
                    <label className="mt-1.5 flex items-center gap-2 text-[14px] text-[#4D4D4D]">
                      <Globe className="h-4 w-4 shrink-0" aria-hidden /><span className="sr-only">Time zone</span>
                      <select value={tz} onChange={(e) => { setTz(e.target.value); setDay(null); setPending(null); setMonth(null); }} className="s-focus h-9 flex-1 rounded-lg border-0 bg-transparent pr-2 text-[14px] text-[#1A1A1A] hover:bg-[#F7F9FC]">
                        {Array.from(new Set([tz, ...COMMON_TZS])).map((z) => <option key={z} value={z}>{tzLabel(z)}</option>)}
                      </select>
                    </label>
                  </div>
                </>
              )}
            </section>

            {/* Right: the day's times */}
            {day && (
              <section className="border-t border-[#E3E8EF] p-6 lg:border-t-0 lg:py-7 lg:pl-0 lg:pr-7" aria-label="Select a time">
                <h4 className="text-[15px] font-medium">{dayTitle}</h4>
                {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
                <div className="mt-4 grid max-h-[420px] gap-2.5 overflow-y-auto pr-1">
                  {times.map((t) => {
                    const sel = pending?.getTime() === t.getTime();
                    return sel ? (
                      <div key={t.toISOString()} className="grid grid-cols-2 gap-2">
                        <span className="grid h-[52px] place-items-center rounded-lg bg-[#666A73] text-[15px] font-bold text-white">{fTime(t)}</span>
                        <button type="button" onClick={() => { setSlot(t); setError(null); }} className="s-focus h-[52px] rounded-lg text-[15px] font-bold text-white" style={{ background: BLUE }}>Next</button>
                      </div>
                    ) : (
                      <button key={t.toISOString()} type="button" onClick={() => setPending(t)}
                        className="s-focus h-[52px] rounded-lg border border-[var(--s-ocean)]/50 text-[15px] font-bold text-[var(--s-ocean)] transition hover:border-2 hover:border-[var(--s-ocean)]">{fTime(t)}</button>
                    );
                  })}
                  {times.length === 0 && <p className="text-sm text-[#6B6B6B]">No times left that day.</p>}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
