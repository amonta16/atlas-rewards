"use client";
/**
 * components/medspa/medspa-funnel.tsx — the /medspa funnel, in the brand-site look.
 *
 *   Your area: zip → open / taken / held (GET /api/landing/area)
 *     open  → CP-205 "Hold it for 48 hours": name, practice, email, mobile
 *             → POST /api/landing/hold (lead saved, area held, Andrew gets a call-now alert)
 *     taken → the same four fields put them on the waitlist
 *   → Your numbers: 3 taps → the estimate, the Founding Partner stack, the promises
 *   → About you: two taps (role, practice today) → POST /api/landing/lead (the server
 *     decides, re-checks the area, updates the held lead)
 *       qualified  → Meta Lead (Pixel + CAPI, one event_id) → Pick a time (Calendly layout,
 *                    next BOOKING_WINDOW_DAYS open days) → the pre-call page /medspa/confirm/<token>
 *       not a fit  → a kind screen + one email, the hold is released. No calendar, no Meta signal.
 *
 * CP-201 built it; CP-202 Calendly booking + A/B arm; CP-203 lettered answers, estimate
 * math; CP-204 area check first, founding offer + guarantees; CP-205 the 48-hour hold
 * (contact first), 3 number questions, the offer stack, app built before the call.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Globe, Hourglass, Loader2, Lock, Mail, MapPin, Pencil, ShieldCheck, Smartphone, Sparkles, Video, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/landing/quiz-model";
import { CYCLE_SOURCE, RECALL, REBOOK, SCENARIOS, VALUE_BANDS, VISIT_BANDS, estimateMedspa } from "@/lib/landing/medspa-quiz-model";
import { BOOKING_SYSTEMS, BOOKING_WINDOW_DAYS, DEFAULT_RECALL_ID, GUARANTEES, HOLD, MONTHLY_PRICE, OFFER_NAME, ROLES, SETUP_STACK, STAGES, TERRITORY, TREATMENT_OPTIONS } from "@/lib/landing/medspa-funnel";
import { CALL_MINUTES, COMMON_TZS, HOST_TZ, tzLabel } from "@/lib/landing/availability";
import { track } from "@/lib/landing/analytics";

const QUIZ = ["zip", "visits", "value", "rebook"] as const;
type QuizId = (typeof QUIZ)[number];
type Phase = "quiz" | "results" | "about" | "nurture" | "time" | "booked";
const LEAD_KEY = "atlas_medspa_lead";
const LETTERS = "ABCDEFGH";

const TITLES: Record<QuizId, { q: string; hint: string }> = {
  zip: { q: "Is your area still open?", hint: "We work with one med spa per area, so we never help the practice down the street compete with you. Enter your practice's zip code." },
  visits: { q: "Patient visits in a typical month?", hint: "A rough guess is perfect." },
  value: { q: "What's a typical visit worth?", hint: "Roughly, across your treatments." },
  rebook: { q: "How many due patients book on time?", hint: "Think of your neurotoxin patients at 3–4 months." },
};

type Area = { zip: string; city: string; state: string; open: boolean; held?: boolean; heldUntil?: string | null; radiusMiles: number; founding: { active: boolean; spotsLeft: number; spots: number; setupFull: number; setupFounding: number } };
type Contact = { first: string; business: string };

const RECAP: Record<string, string> = { most: "80%+ rebook on time", half: "About half rebook", few: "Under half rebook" };
const recallDefault = RECALL.find((r) => r.id === DEFAULT_RECALL_ID) ?? RECALL[0];

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

/** Ticks once a second; returns "47:59:12" until `iso`, or null once it has passed. */
function useCountdown(iso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!iso) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [iso]);
  if (!iso) return null;
  const ms = Date.parse(iso) - now;
  if (!(ms > 0)) return null;
  const s = Math.floor(ms / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
const fEnds = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(" AM", "am").replace(" PM", "pm");

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
function remember(v: { id: string; first?: string; business?: string; booked?: boolean }) {
  try { localStorage.setItem(LEAD_KEY, JSON.stringify({ ...v, at: Date.now() })); } catch { /* private mode */ }
}

export function MedspaFunnel({ source, firstFieldRef, variant }: { source: string; firstFieldRef?: RefObject<HTMLInputElement>; variant?: string }) {
  const [phase, setPhase] = useState<Phase>("quiz");
  const [step, setStep] = useState(0);
  const [zip, setZip] = useState("");
  const [area, setArea] = useState<Area | null>(null);
  const [areaState, setAreaState] = useState<"idle" | "checking">("idle");
  const [areaError, setAreaError] = useState<string | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [valueId, setValueId] = useState<string | null>(null);
  const [rebookId, setRebookId] = useState<string | null>(null);
  const [showMath, setShowMath] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [holdUntil, setHoldUntil] = useState<string | null>(null);
  const [contact, setContact] = useState<Contact>({ first: "", business: "" });
  const [notFit, setNotFit] = useState<"area_taken" | "not_a_fit">("not_a_fit");
  const started = useRef(false);
  const headRef = useRef<HTMLHeadingElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const left = useCountdown(holdUntil);

  // Coming back (follow-up email link, or the same browser): pick up where they left off.
  useEffect(() => {
    let id: string | null = null;
    let stored: { id: string; at: number; booked?: boolean; first?: string; business?: string } | null = null;
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("lead");
      stored = JSON.parse(localStorage.getItem(LEAD_KEY) ?? "null");
      id = fromUrl && /^[0-9a-f-]{36}$/i.test(fromUrl) ? fromUrl : stored && !stored.booked && Date.now() - stored.at < 3 * 864e5 ? stored.id : null;
    } catch { /* private mode: start fresh */ }
    if (!id) return;
    fetch(`/api/landing/hold?lead=${id}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j?.ok) return;
      setLeadId(id); setContact({ first: j.first ?? "", business: j.business ?? "" });
      if (j.zip) setZip(j.zip);
      if (j.booked) { setPhase("booked"); return; }
      const live = j.hold_expires_at && Date.parse(j.hold_expires_at) > Date.now();
      if (live) setHoldUntil(j.hold_expires_at);
      if (j.qualified) { setPhase("time"); return; }
      if (live && j.status === "held") {
        setArea({ zip: j.zip, city: j.city, state: j.state, open: true, radiusMiles: 10, founding: { active: false, spotsLeft: 0, spots: 0, setupFull: 0, setupFounding: 0 } });
        // refresh founding numbers quietly
        fetch(`/api/landing/area?zip=${j.zip}&lead=${id}`, { cache: "no-store" }).then((r) => r.json()).then((a) => { if (a?.ok) setArea(a); }).catch(() => {});
        if (j.visit_band) setVisitId(j.visit_band); if (j.value_band) setValueId(j.value_band); if (j.rebook) setRebookId(j.rebook);
        setStep(j.visit_band && j.value_band && j.rebook ? 0 : 1);
        if (j.visit_band && j.value_band && j.rebook) setPhase("results");
      }
    }).catch(() => {});
  }, []);
  useEffect(() => () => { if (advance.current) clearTimeout(advance.current); }, []);

  const id: QuizId | null = phase === "quiz" ? QUIZ[step] : null;
  const visits = VISIT_BANDS.find((b) => b.id === visitId);
  const value = VALUE_BANDS.find((b) => b.id === valueId);
  const rebook = REBOOK.find((r) => r.id === rebookId);
  const est = useMemo(() => (visits && value && rebook ? estimateMedspa(visits.mid, value.mid, rebook.lapse, recallDefault.factor) : null), [visits, value, rebook]);
  const likely = useCountUp(est?.likely ?? 0, phase === "results");

  useEffect(() => {
    if (id === "zip" && !area) zipRef.current?.focus({ preventScroll: true });
    else if (!(id === "zip" && area?.open && !holdUntil)) headRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, phase]);
  useEffect(() => {
    if (phase === "results" && est) track("quiz_completed", { source, niche: "medspa", est_likely: est.likely, est_low: est.low, est_high: est.high });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const touch = () => { if (!started.current) { started.current = true; track("quiz_started", { source, niche: "medspa" }); } };
  const go = (to: number) => { if (advance.current) clearTimeout(advance.current); if (to >= QUIZ.length) setPhase("results"); else { setPhase("quiz"); setStep(Math.max(0, to)); } };

  async function checkZip(e: React.FormEvent) {
    e.preventDefault();
    touch();
    const z = zip.trim();
    if (!/^\d{5}$/.test(z)) { setAreaError("Enter your practice's 5-digit zip code."); return; }
    setAreaState("checking"); setAreaError(null); setArea(null);
    try {
      const r = await fetch(`/api/landing/area?zip=${z}${leadId ? `&lead=${leadId}` : ""}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "We couldn't check that right now. Please try again.");
      setArea(j as Area);
      track("area_checked", { source, open: !!j.open, held: !!j.held, state: j.state, spots_left: j.founding?.spotsLeft });
    } catch (err) {
      setAreaError(err instanceof Error ? err.message : "Something went wrong.");
    } finally { setAreaState("idle"); }
  }

  const choices = id === "visits" ? VISIT_BANDS : id === "value" ? VALUE_BANDS : id === "rebook" ? REBOOK : null;
  const chosen = id === "visits" ? visitId : id === "value" ? valueId : id === "rebook" ? rebookId : null;
  const choose = (c: { id: string; label: string }) => {
    if (!id) return;
    touch();
    const set = id === "visits" ? setVisitId : id === "value" ? setValueId : setRebookId;
    set(c.id); track("quiz_step", { source, step: id, answer: c.label });
    if (advance.current) clearTimeout(advance.current);
    advance.current = setTimeout(() => go(step + 1), 260);
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

  const stage = phase === "quiz" ? (step < 1 ? 0 : 1) : phase === "results" ? 1 : phase === "about" || phase === "nurture" ? 2 : 3;
  const where = area ? `${area.city}, ${area.state}` : "";
  const held = !!holdUntil && !!left;

  function onHeld(r: { leadId: string; open: boolean; holdUntil: string | null; first: string; business: string }) {
    setLeadId(r.leadId); setContact({ first: r.first, business: r.business });
    if (r.open && r.holdUntil) {
      setHoldUntil(r.holdUntil); remember({ id: r.leadId, first: r.first, business: r.business });
      track("area_held", { source, state: area?.state });
    } else { setNotFit("area_taken"); setPhase("nurture"); }
  }

  return (
    <div className={cn("mx-auto", phase === "time" ? "max-w-none" : "max-w-[720px]")}>
      <div className="mb-7 flex flex-col items-center gap-3">
        <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-[12.5px] font-semibold" aria-label="Your progress">
          {["Your area", "Your numbers", "About you", "Pick a time"].map((t, i) => (
            <li key={t} className="flex items-center gap-2">
              <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1", i < stage ? "bg-[var(--s-ice)] text-[var(--s-ocean-deep)]" : i === stage ? "bg-[var(--s-ocean)] text-white" : "bg-[#F1F4F8] text-[var(--s-ink-3)]")} aria-current={i === stage ? "step" : undefined}>
                {i < stage ? <Check className="h-3.5 w-3.5" aria-hidden /> : <span className="tabular-nums">{i + 1}</span>}{t}
              </span>
              {i < 3 && <span aria-hidden className="h-px w-3 bg-[var(--s-line)]" />}
            </li>
          ))}
        </ol>
        {held && phase !== "booked" && !(id === "zip") && <HoldPill where={area?.city ?? "Your area"} left={left!} />}
      </div>

      <div key={`${phase}-${step}`} className="animate-in fade-in slide-in-from-right-4 duration-300 motion-reduce:animate-none">
        {id && (
          <div className="mb-6">
            {id !== "zip" && (
              <div className="flex items-center gap-3">
                <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--s-ocean)]">Your numbers · {step} of 3</span>
                <span className="flex flex-1 gap-1" aria-hidden>{[1, 2, 3].map((i) => <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-[var(--s-ocean)]" : "bg-[var(--s-ice)]")} />)}</span>
              </div>
            )}
            {!(id === "zip" && area) && (
              <>
                <h3 ref={headRef} tabIndex={-1} className={cn("text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none sm:text-[1.9rem]", id !== "zip" && "mt-4")}>{TITLES[id].q}</h3>
                <p className="mt-1.5 max-w-[36rem] text-[15px] text-[var(--s-ink-3)]">{TITLES[id].hint}</p>
              </>
            )}
          </div>
        )}

        {id === "zip" && (
          <div>
            {!area && (
              <>
                <form onSubmit={checkZip} className="flex flex-col gap-3 sm:flex-row">
                  <label className="relative flex-1">
                    <span className="sr-only">Practice zip code</span>
                    <MapPin aria-hidden className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--s-ocean)]" />
                    <input ref={zipRef} value={zip} onChange={(e) => { setZip(e.target.value.replace(/\D/g, "").slice(0, 5)); setAreaError(null); }}
                      inputMode="numeric" autoComplete="postal-code" placeholder="Practice zip code" aria-invalid={!!areaError}
                      className={cn(FIELD, "h-14 pl-12 text-lg tracking-[0.06em] tabular-nums")} />
                  </label>
                  <button type="submit" disabled={areaState === "checking"} className="s-btn s-btn-primary s-focus !h-14 disabled:opacity-60">{areaState === "checking" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}Check my area</button>
                </form>
                {areaError && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{areaError}</p>}
                <p className="mt-4 flex items-center gap-2 text-[13px] text-[var(--s-ink-3)]"><ShieldCheck className="h-4 w-4 text-[var(--s-ocean)]" aria-hidden />One practice per {TERRITORY.radiusMiles} miles. We never say who holds an area.</p>
              </>
            )}

            {area && area.open && (
              <div role="status" className="overflow-hidden rounded-[24px] border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white">
                <div className="flex items-start gap-3.5 p-5 sm:p-6">
                  <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
                    <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-emerald-400/50 motion-reduce:hidden" style={{ animationIterationCount: 2 }} />
                    {held ? <Lock className="relative h-5 w-5" aria-hidden /> : <Check className="relative h-5 w-5" strokeWidth={3} aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 ref={headRef} tabIndex={-1} className="text-[1.35rem] font-bold leading-tight tracking-[-0.02em] text-[var(--s-ink)] outline-none sm:text-[1.5rem]">{held ? `${area.city} is held for ${contact.business || "you"}.` : `${where} is open.`}</h3>
                    <p className="mt-1 text-[14.5px] text-[var(--s-ink-2)]">{held
                      ? <>No other med spa within {area.radiusMiles} miles can claim it until <b className="text-[var(--s-ink)]">{fEnds(holdUntil!)}</b>. Book your call before then and it stays yours through the call.</>
                      : <>No med spa within {area.radiusMiles} miles of {area.zip} works with Atlas yet. The first one to sign gets it.</>}</p>
                  </div>
                </div>
                {held ? (
                  <div className="border-t border-emerald-200 bg-white px-5 py-5 sm:px-6">
                    <div className="flex flex-wrap items-center gap-4">
                      <HoldClock left={left!} />
                      <div className="min-w-0 flex-1 text-[14px] text-[var(--s-ink-2)]">We emailed your hold to you. Next, three quick numbers so Andrew comes to your call with your estimate.</div>
                    </div>
                    <button type="button" onClick={() => go(1)} className="s-btn s-btn-primary s-focus mt-5 !h-12 w-full sm:w-auto">Next: 3 quick numbers <ArrowRight className="h-4 w-4" aria-hidden /></button>
                  </div>
                ) : (
                  <>
                    {area.founding.active && (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-emerald-200 bg-white/70 px-5 py-3 sm:px-6">
                        <span className="text-[14px] font-semibold text-[var(--s-ink)]"><Sparkles className="mr-1.5 inline h-4 w-4 text-[var(--s-ocean)]" aria-hidden />{area.founding.spotsLeft} of {area.founding.spots} founding spots left</span>
                        <SpotsBar left={area.founding.spotsLeft} of={area.founding.spots} />
                      </div>
                    )}
                    <HoldForm mode="hold" area={area} source={source} variant={variant} firstFieldRef={firstFieldRef} onDone={onHeld} />
                  </>
                )}
              </div>
            )}

            {area && !area.open && (
              <div role="status" className="overflow-hidden rounded-[24px] border border-[#F5D9A6] bg-gradient-to-b from-[#FFF8EA] to-white">
                <div className="p-5 sm:p-6">
                  <h3 ref={headRef} tabIndex={-1} className="text-[1.3rem] font-bold leading-tight text-[var(--s-ink)] outline-none">{area.held ? `Another practice is holding ${area.city} right now.` : `A practice near ${where} already holds this area.`}</h3>
                  <p className="mt-1.5 text-[14.5px] text-[var(--s-ink-2)]">{area.held && area.heldUntil
                    ? <>Their hold ends {fEnds(area.heldUntil)}. If they don&apos;t claim it, the waitlist hears first, in the order they joined.</>
                    : <>We only work with one med spa within {area.radiusMiles} miles. Join the waitlist and you&apos;ll hear first if it opens.</>}</p>
                </div>
                <HoldForm mode="waitlist" area={area} source={source} variant={variant} firstFieldRef={firstFieldRef} onDone={onHeld} />
              </div>
            )}
            {area && !held && (
              <button type="button" onClick={() => { setArea(null); setZip(""); setTimeout(() => zipRef.current?.focus(), 0); }} className="s-focus mt-4 rounded text-sm text-[var(--s-ink-3)] hover:text-[var(--s-ink)]">Check a different zip</button>
            )}
          </div>
        )}

        {choices && id && <Choices items={choices} value={chosen} onPick={choose} />}

        {phase === "results" && est && visits && value && rebook && (
          <div>
            <h3 ref={headRef} tabIndex={-1} className="text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none sm:text-[1.85rem]">{contact.first ? `${contact.first}, here's` : "Here's"} what patient recall could win back{contact.business ? ` for ${contact.business}` : ""}.</h3>

            <div className="s-ocean relative mt-5 overflow-hidden rounded-[24px] p-6 shadow-[0_26px_50px_-22px_rgba(11,95,214,.6)] sm:p-7">
              <div className="s-ocean-img opacity-60" aria-hidden />
              <div className="relative">
                <div className="text-[13px] font-semibold text-white/80">Estimated recovered revenue, year one</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                  <span className="text-5xl font-extrabold tabular-nums tracking-tight text-white sm:text-6xl" aria-label={`${fmtMoney(est.likely)} per year`}>{fmtMoney(likely)}</span>
                  <span className="text-[15px] font-semibold text-white/85">about {fmtMoney(est.perMonth)} a month</span>
                </div>
                <ol className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-stretch">
                  <MathTile big={est.lapsedVisits.toLocaleString()} small="due visits slip a year" />
                  <Op>→</Op>
                  <MathTile big={est.recovered.toLocaleString()} small={`won back (${Math.round(SCENARIOS.likely * 100 * recallDefault.factor)}%)`} />
                  <Op>×</Op>
                  <MathTile big={fmtMoney(value.mid)} small="per visit" />
                </ol>
                {MONTHLY_PRICE ? (
                  <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white px-4 py-3 text-[var(--s-ink)]">
                    <span className="text-[14px] font-semibold">Atlas is {fmtMoney(MONTHLY_PRICE)}/month.</span>
                    <span className="text-[14px] text-[var(--s-ink-2)]">On these numbers that&apos;s about</span>
                    <span className="rounded-full bg-[var(--s-ocean)] px-2.5 py-0.5 text-[15px] font-extrabold tabular-nums text-white">{Math.max(1, Math.round((est.perMonth / MONTHLY_PRICE) * 10) / 10)}× back</span>
                  </div>
                ) : null}
                <p className="mt-4 text-[12.5px] text-white/70">Range {fmtMoney(est.low)} to {fmtMoney(est.high)}. A planning estimate, not a promise.</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
              {[`${visits.label} visits/mo`, `${value.label} a visit`, RECAP[rebook.id] ?? rebook.label].map((t) => <span key={t} className="rounded-full bg-[var(--s-paper)] px-3 py-1 font-medium text-[var(--s-ink-2)] ring-1 ring-[var(--s-line)]">{t}</span>)}
              <button type="button" onClick={() => go(1)} className="s-focus inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold text-[var(--s-ocean)] hover:underline"><Pencil className="h-3.5 w-3.5" aria-hidden />Edit</button>
            </div>
            <button type="button" onClick={() => setShowMath((v) => !v)} aria-expanded={showMath} className="s-focus mt-3 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-[var(--s-ocean)] hover:underline">Where these numbers come from <ChevronDown className={cn("h-4 w-4 transition-transform", showMath && "rotate-180")} aria-hidden /></button>
            {showMath && (
              <div className="mt-2 rounded-2xl bg-[var(--s-paper)] p-4 text-[13px] leading-relaxed text-[var(--s-ink-2)] ring-1 ring-[var(--s-line)]">
                <p>About {visits.mid.toLocaleString()} visits a month is {(visits.mid * 12).toLocaleString()} a year. You said about <b>{Math.round(rebook.lapse * 100)}%</b> of due visits don&apos;t happen on time, so roughly <b>{est.lapsedVisits.toLocaleString()}</b> slip. Neurotoxin lasts about 3–4 months ({CYCLE_SOURCE.replace(/ \(.*\)$/, "")}).</p>
                <p className="mt-2">Likely case: reminders, win-backs and membership offers bring back <b>{Math.round(SCENARIOS.likely * 100)}%</b> of those, trimmed a little because most practices already call or text some overdue patients. Low {Math.round(SCENARIOS.low * 100)}%, high {Math.round(SCENARIOS.high * 100)}%. These are planning assumptions, not measured results, and they leave out membership dues.</p>
              </div>
            )}

            <OfferStack area={area} />

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => { track("quiz_book_clicked", { source, est_likely: est.likely }); setPhase("about"); }} className="s-btn s-btn-primary s-focus">Pick my call time <ArrowRight className="h-4 w-4" aria-hidden /></button>
              {held && <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--s-ink-2)]"><Hourglass className="h-4 w-4 text-[var(--s-ocean)]" aria-hidden />Hold ends in {left}</span>}
            </div>
            <p className="mt-3 text-[13px] text-[var(--s-ink-3)]">Next: two quick questions, then a 20-minute video call with Andrew. Month to month, no pressure.</p>
          </div>
        )}

        {phase === "about" && leadId && (
          <AboutYou headRef={headRef} source={source} leadId={leadId} first={contact.first}
            answers={{ variant: variant ?? null, zip: area?.zip ?? (zip || null), practice_type: "Med spa", visit_band: visitId, value_band: valueId, rebook: rebookId, recall: null, estimate_likely: est?.likely ?? null }}
            onBack={() => setPhase("results")}
            onResult={(r) => {
              if (r.qualified) setPhase("time");
              else { setNotFit(r.reason === "area_taken" ? "area_taken" : "not_a_fit"); setHoldUntil(null); setPhase("nurture"); }
            }} />
        )}

        {phase === "nurture" && (
          <div className="py-2 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--s-ice)] text-[var(--s-ocean)]"><Mail className="h-6 w-6" aria-hidden /></span>
            {notFit === "area_taken" ? (
              <>
                <h3 ref={headRef} tabIndex={-1} className="mt-4 text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none">You&apos;re on the waitlist{contact.first ? `, ${contact.first}` : ""}.</h3>
                <p className="mx-auto mt-3 max-w-[34rem] text-[15px] leading-relaxed text-[var(--s-ink-2)]">A practice near {where || "you"} holds this area right now. If it opens up, you&apos;ll hear from Andrew first. We&apos;ve sent you a confirmation.</p>
              </>
            ) : (
              <>
                <h3 ref={headRef} tabIndex={-1} className="mt-4 text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none">Thanks{contact.first ? `, ${contact.first}` : ""}. Your estimate is on its way.</h3>
                <p className="mx-auto mt-3 max-w-[34rem] text-[15px] leading-relaxed text-[var(--s-ink-2)]">From what you told us, a live walkthrough isn&apos;t the right next step yet. Walkthroughs are for owners and managers of practices that are open today. We&apos;ve emailed you your recall estimate to share with whoever makes the call.</p>
                <p className="mx-auto mt-3 max-w-[34rem] text-[15px] leading-relaxed text-[var(--s-ink-2)]">If that changes, reply to the email and Andrew will set up a time.</p>
              </>
            )}
          </div>
        )}

        {phase === "booked" && (
          <div className="py-2 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><CalendarDays className="h-6 w-6" aria-hidden /></span>
            <h3 ref={headRef} tabIndex={-1} className="mt-4 text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none">You&apos;re already booked{contact.first ? `, ${contact.first}` : ""}.</h3>
            <p className="mx-auto mt-3 max-w-[34rem] text-[15px] leading-relaxed text-[var(--s-ink-2)]">Your call details and the confirm link are in your email. Need a different time? Reply to that email and Andrew will move it.</p>
          </div>
        )}

        {phase === "time" && leadId && <TimePicker leadId={leadId} firstName={contact.first} practice={contact.business} source={source} headRef={headRef} holdUntil={holdUntil} extraNotes={est ? `Area: ${where} ${area?.zip ?? ""}${area?.founding.active ? " (founding spot available)" : ""} · Estimate: ${fmtMoney(est.likely)}/yr likely (${fmtMoney(est.low)}–${fmtMoney(est.high)}) · ${visits?.label} visits/mo · ${value?.label} per visit · rebook: ${rebook?.label}` : undefined} />}
      </div>

      {phase === "quiz" && step > 0 && (
        <button type="button" onClick={() => go(step - 1)} className="s-focus mt-8 inline-flex items-center gap-1.5 rounded text-sm text-[var(--s-ink-3)] hover:text-[var(--s-ink)]"><ArrowLeft className="h-4 w-4" aria-hidden /> Back</button>
      )}
    </div>
  );
}

/* ───────────── CP-205: the 48-hour hold ───────────── */

function HoldPill({ where, left }: { where: string; left: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-[12.5px] font-bold text-emerald-800 ring-1 ring-emerald-200">
      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
      {where} held · <span className="tabular-nums">{left}</span>
    </span>
  );
}

/** The big hold timer: hours / minutes / seconds tiles. */
function HoldClock({ left }: { left: string }) {
  const [h, m, s] = left.split(":");
  return (
    <div className="flex items-center gap-1.5" role="timer" aria-label={`Hold ends in ${h} hours ${m} minutes`}>
      {[[h, "hrs"], [m, "min"], [s, "sec"]].map(([v, l], i) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className="grid w-[58px] place-items-center rounded-xl bg-[var(--s-ink)] py-2 text-white">
            <span className="text-[1.45rem] font-extrabold tabular-nums leading-none">{v}</span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60">{l}</span>
          </span>
          {i < 2 && <span aria-hidden className="text-lg font-bold text-[var(--s-ink-3)]">:</span>}
        </span>
      ))}
    </div>
  );
}

function HoldForm({ mode, area, source, variant, firstFieldRef, onDone }: {
  mode: "hold" | "waitlist"; area: Area; source: string; variant?: string; firstFieldRef?: RefObject<HTMLInputElement>;
  onDone: (r: { leadId: string; open: boolean; holdUntil: string | null; first: string; business: string }) => void;
}) {
  const [state, setState] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    if (!fd.name?.trim() || !fd.business?.trim()) { setError("Please add your name and your practice's name."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fd.email ?? "")) { setError("Please enter a valid email."); return; }
    if ((fd.phone ?? "").replace(/\D/g, "").length < 10) { setError("Please enter a mobile number with area code."); return; }
    setState("sending"); setError(null);
    try {
      const r = await fetch("/api/landing/hold", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fd, zip: area.zip, source, variant: variant ?? null, path: window.location.pathname, ...utms(), ...metaIds() }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.error || "Something went wrong. Please try again.");
      onDone({ leadId: j.lead_id, open: !!j.open, holdUntil: j.hold_expires_at ?? null, first: fd.name.trim().split(/\s+/)[0] ?? "", business: fd.business.trim() });
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); setState("idle"); }
  }
  const hold = mode === "hold";
  return (
    <form onSubmit={submit} noValidate className="bg-white px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--s-ice)] text-[var(--s-ocean)]">{hold ? <Hourglass className="h-[18px] w-[18px]" aria-hidden /> : <Mail className="h-[18px] w-[18px]" aria-hidden />}</span>
        <div>
          <div className="text-[1.05rem] font-bold text-[var(--s-ink)]">{hold ? `Hold ${area.city} for ${HOLD.hours} hours` : "Join the waitlist"}</div>
          <p className="text-[13.5px] text-[var(--s-ink-3)]">{hold ? `While it's held, no other med spa within ${area.radiusMiles} miles can claim it. Free, no card.` : "You'll hear first if this area opens."}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-x-3 gap-y-3 sm:grid-cols-2">
        <Field label="Your name"><input ref={firstFieldRef} name="name" required autoComplete="name" className={FIELD_SM} placeholder="Maria Lopez" /></Field>
        <Field label="Practice name"><input name="business" required autoComplete="organization" className={FIELD_SM} placeholder="Luma Aesthetics" /></Field>
        <Field label="Email"><input name="email" type="email" required autoComplete="email" className={FIELD_SM} placeholder="you@practice.com" /></Field>
        <Field label="Mobile"><input name="phone" type="tel" required autoComplete="tel" className={FIELD_SM} placeholder="(805) 555-0123" /></Field>
      </div>
      <input name="website_url_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {error && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{error}</p>}
      <button type="submit" disabled={state === "sending"} className="s-btn s-btn-primary s-focus mt-4 !h-12 w-full disabled:opacity-60">
        {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : hold ? <Lock className="h-4 w-4" aria-hidden /> : null}
        {hold ? `Hold my area for ${HOLD.hours} hours` : "Join the waitlist"}
      </button>
      <p className="mt-2.5 text-center text-[12px] text-[var(--s-ink-3)]">{hold ? "We'll email your hold. Andrew may call to set up your walkthrough. No spam." : "One email when it opens. No spam."}</p>
    </form>
  );
}

/* ───────────── CP-205: the named, stacked offer ───────────── */

function OfferStack({ area }: { area: Area | null }) {
  const f = area?.founding;
  const founding = !!f?.active;
  const full = f?.setupFull || 0;
  return (
    <section className="mt-6 overflow-hidden rounded-[24px] border border-[var(--s-line)] bg-white" aria-labelledby="stack-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--s-line)] bg-[var(--s-paper)] px-5 py-4">
        <div>
          <div className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-[var(--s-ocean)]">{founding ? `${f!.spotsLeft} of ${f!.spots} spots left` : "Your setup"}</div>
          <h4 id="stack-title" className="text-[1.15rem] font-bold text-[var(--s-ink)]">{founding ? `The ${OFFER_NAME}` : "Everything in your setup"}</h4>
        </div>
        {full > 0 && (
          <div className="text-right">
            {founding && <div className="text-[13px] font-semibold text-[var(--s-ink-3)] line-through decoration-rose-400/80">{fmtMoney(full)} setup</div>}
            <div className="text-[1.35rem] font-extrabold leading-none text-[var(--s-ink)]">{fmtMoney(founding ? f!.setupFounding : full)} <span className="text-[13px] font-semibold text-[var(--s-ink-3)]">setup</span></div>
          </div>
        )}
      </div>
      <ul className="divide-y divide-[var(--s-line)]">
        {SETUP_STACK.map((it, i) => (
          <li key={it.title} className="flex gap-3 px-5 py-3">
            <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full", i === 0 ? "bg-[var(--s-ocean)] text-white" : "bg-[var(--s-ice)] text-[var(--s-ocean)]")}>{i === 0 ? <Wand2 className="h-3.5 w-3.5" aria-hidden /> : <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="text-[14.5px] font-bold text-[var(--s-ink)]">{it.title}</span>{it.value ? <span className="text-[13px] font-semibold text-[var(--s-ink-3)]">{fmtMoney(it.value)} value</span> : null}</div>
              <p className="text-[13px] leading-snug text-[var(--s-ink-3)]">{it.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-[var(--s-line)] bg-[var(--s-paper)] px-5 py-4">
        <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--s-ocean)]"><ShieldCheck className="h-4 w-4" aria-hidden />Backed by three promises</div>
        <ul className="mt-2.5 grid gap-2">
          {GUARANTEES.map((g) => <li key={g.id} className="flex gap-2.5 text-[14px] font-semibold text-[var(--s-ink)]"><Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--s-ocean)]" strokeWidth={3} aria-hidden />{g.short}</li>)}
        </ul>
        {founding && <p className="mt-3 text-[12.5px] text-[var(--s-ink-3)]">Founding price in exchange for a short filmed testimonial and a case study after 90 days. Then one flat monthly plan, month to month{MONTHLY_PRICE ? ` (${fmtMoney(MONTHLY_PRICE)}/month)` : ", quoted on your call"}.</p>}
      </div>
    </section>
  );
}

function SpotsBar({ left, of }: { left: number; of: number }) {
  return (
    <span className="flex gap-1" aria-hidden>
      {Array.from({ length: of }).map((_, i) => <span key={i} className={cn("h-2 w-4 rounded-full", i < of - left ? "bg-[var(--s-ink-3)]/30" : "bg-[var(--s-ocean)]")} />)}
    </span>
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

/* ───────────── STEP 3: two taps (CP-205) ─────────────
 * Contact details came in with the hold, so qualifying is just role + practice today
 * (lettered tiles), with the optional extras folded behind one link. */
function AboutYou({ headRef, source, leadId, first, answers, onBack, onResult }: {
  headRef: RefObject<HTMLHeadingElement>; source: string; leadId: string; first: string;
  answers: Record<string, string | number | null>;
  onBack: () => void; onResult: (r: { qualified: boolean; reason?: string }) => void;
}) {
  const [role, setRole] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [treatments, setTreatments] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [state, setState] = useState<"idle" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!role || !stage) { setError("Pick your role and where your practice is today."); return; }
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    setState("sending"); setError(null);
    track("lead_submitted", { source });
    try {
      const r = await fetch("/api/landing/lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fd, role, stage, lead_id: leadId, treatments, ...answers, source, path: window.location.pathname, ...utms(), ...metaIds() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
      if (j.qualified) track("lead_qualified", { source, event_id: j.event_id });
      else track("lead_unqualified", { source });
      onResult({ qualified: !!j.qualified, reason: j.reason });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setState("idle");
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <button type="button" onClick={onBack} className="s-focus inline-flex items-center gap-1 rounded text-xs text-[var(--s-ink-3)] hover:text-[var(--s-ink)]"><ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to my results</button>
      <h3 ref={headRef} tabIndex={-1} className="mt-2 text-[1.6rem] font-bold leading-tight tracking-[-0.025em] text-[var(--s-ink)] outline-none sm:text-[1.85rem]">Two quick questions{first ? `, ${first}` : ""}.</h3>
      <p className="mt-1.5 text-[15px] text-[var(--s-ink-3)]">So Andrew preps the right walkthrough. Then you pick a time.</p>

      <fieldset className="mt-6">
        <legend className="text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--s-ocean)]">Your role</legend>
        <div className="mt-2.5"><Choices compact items={ROLES.map((r) => ({ id: r.id, label: r.label }))} value={role} onPick={(r) => { setRole(r.id); setError(null); }} /></div>
      </fieldset>
      <fieldset className="mt-6">
        <legend className="text-[13px] font-bold uppercase tracking-[0.08em] text-[var(--s-ocean)]">Your practice today</legend>
        <div className="mt-2.5"><Choices compact items={STAGES.map((s) => ({ id: s.id, label: s.label }))} value={stage} onPick={(s) => { setStage(s.id); setError(null); }} /></div>
      </fieldset>

      {!more ? (
        <button type="button" onClick={() => setMore(true)} className="s-focus mt-5 inline-flex items-center gap-1.5 rounded text-[13.5px] font-semibold text-[var(--s-ocean)] hover:underline">+ Help Andrew build your app preview (optional)</button>
      ) : (
        <div className="mt-5 grid gap-4 rounded-2xl bg-[var(--s-paper)] p-4 ring-1 ring-[var(--s-line)] sm:grid-cols-2">
          <Field label="Website or Instagram" optional><input name="website" autoComplete="url" className={FIELD_SM} placeholder="lumaaesthetics.com or @luma" /></Field>
          <Field label="Booking software" optional><Select name="booking_system" placeholder="Choose one" options={BOOKING_SYSTEMS.map((s) => [s, s])} /></Field>
          <fieldset className="sm:col-span-2">
            <legend className="text-[13.5px] font-semibold text-[var(--s-ink)]">Treatments you offer</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TREATMENT_OPTIONS.map((t) => {
                const on = treatments.includes(t);
                return <button key={t} type="button" aria-pressed={on} onClick={() => setTreatments((v) => (on ? v.filter((x) => x !== t) : [...v, t]))} className={cn("s-focus inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] font-semibold transition-colors", on ? "border-[var(--s-ocean)] bg-[var(--s-ocean)] text-white" : "border-[var(--s-line)] bg-white text-[var(--s-ink-2)] hover:border-[var(--s-ocean)]/40")}>{on && <Check className="h-3 w-3" aria-hidden />}{t}</button>;
              })}
            </div>
          </fieldset>
          <Field label="What would make this worth it for you?" className="sm:col-span-2"><textarea name="worth_it" rows={2} className={cn(FIELD_SM, "h-auto py-2.5")} placeholder="e.g. Get toxin patients back at 12 weeks, sell 30 memberships" /></Field>
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
function Choices<T extends { id: string; label: string; sub?: string }>({ items, value, onPick, compact }: { items: T[]; value: string | null; onPick: (item: T) => void; compact?: boolean }) {
  return (
    <div className={cn("grid", compact ? "gap-2 sm:grid-cols-2" : "gap-2.5", !compact && items.length > 3 && "sm:grid-cols-2")} role="radiogroup">
      {items.map((it, i) => {
        const sel = it.id === value;
        return (
          <button key={it.id} type="button" role="radio" aria-checked={sel} onClick={() => onPick(it)}
            className={cn("s-focus group flex items-center gap-3.5 rounded-2xl border bg-white text-left transition", compact ? "px-3.5 py-2.5" : "px-4 py-3.5", sel ? "border-[var(--s-ocean)] bg-[var(--s-ice)]/70 ring-2 ring-[var(--s-ocean)]/25" : "border-[var(--s-line)] hover:border-[var(--s-ocean)]/50 hover:bg-[var(--s-paper)]",
              items.length % 2 === 1 && i === items.length - 1 && (compact || items.length > 3) && "sm:col-span-2")}>
            <kbd className={cn("grid shrink-0", compact ? "h-5 w-5 rounded-full" : "h-7 w-7 rounded-lg", "place-items-center border font-sans text-[12px] font-bold transition-colors", sel ? "border-[var(--s-ocean)] bg-[var(--s-ocean)] text-white" : "border-[var(--s-line)] bg-[var(--s-paper)] text-[var(--s-ink-3)] group-hover:border-[var(--s-ocean)]/40 group-hover:text-[var(--s-ocean)]")}>{sel ? <Check className="h-3.5 w-3.5" aria-hidden /> : compact ? "" : LETTERS[i]}</kbd>
            <span className="min-w-0 flex-1">
              <span className={cn("block font-bold leading-tight text-[var(--s-ink)]", compact ? "text-[15px]" : "text-[16px]")}>{it.label}</span>
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
function TimePicker({ leadId, firstName, practice, source, headRef, extraNotes, holdUntil }: { leadId: string; firstName: string; practice: string; source: string; headRef: RefObject<HTMLHeadingElement>; extraNotes?: string; holdUntil?: string | null }) {
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
  // CP-205: only the first BOOKING_WINDOW_DAYS days with open times (calls booked close show up).
  const byDay = useMemo(() => {
    const m = new Map<string, Date[]>();
    for (const s of slots ?? []) { const k = keyFmt.format(s); (m.get(k) ?? m.set(k, []).get(k)!).push(s); }
    const keep = new Set(Array.from(m.keys()).sort().slice(0, BOOKING_WINDOW_DAYS));
    for (const k of Array.from(m.keys())) if (!keep.has(k)) m.delete(k);
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
          <p className="mt-5 text-[14px] leading-relaxed text-[#4D4D4D]">{firstName ? `${firstName}, ` : ""}Andrew will walk through your recall numbers, how Atlas would run at {practice || "your practice"}&apos;s front desk, and the offer for your area. You decide if it&apos;s a fit.</p>
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--s-ice)] px-2.5 py-1 text-[12px] font-bold text-[var(--s-ocean-deep)]"><ShieldCheck className="h-3.5 w-3.5" aria-hidden /> You qualify for a walkthrough</p>
          {/* CP-205: do the work up front */}
          <div className="mt-5 flex gap-3 rounded-2xl border border-[#E3E8EF] bg-gradient-to-br from-[#F2F7FF] to-white p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: BLUE }}><Smartphone className="h-[18px] w-[18px]" aria-hidden /></span>
            <p className="text-[13.5px] leading-snug text-[#4D4D4D]"><b className="text-[#1A1A1A]">Your app, built before the call.</b> Andrew builds a preview of {practice || "your practice"}&apos;s own app (your name, logo and colors) so you see yours, not a generic demo.</p>
          </div>
          {holdUntil && Date.parse(holdUntil) > Date.now() && <p className="mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700"><Lock className="h-3.5 w-3.5" aria-hidden />Book now and your area stays held through the call.</p>}
        </aside>

        {slot ? (
          /* Confirm */
          <section className="p-6 lg:p-8" aria-label="Confirm your time">
            <button type="button" onClick={() => { setSlot(null); setPending(null); }} className="s-focus grid h-11 w-11 place-items-center rounded-full border border-[#E3E8EF] text-[var(--s-ocean)] hover:bg-[#F2F7FF]" aria-label="Back to times"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
            <h4 className="mt-5 text-[1.25rem] font-bold">Confirm your walkthrough</h4>
            <p className="mt-2 max-w-[30rem] text-[15px] leading-relaxed text-[#4D4D4D]">We&apos;ll send the calendar invite and video link to the email you gave us, and your area stays held through the call. Next you&apos;ll see a short page to confirm you can make it.</p>
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
                <p className="mt-6 rounded-xl bg-[#F7F9FC] p-4 text-sm text-[#4D4D4D]">{failed ? "We couldn't load the calendar just now." : "No open times in the next few days."} Email <span className="font-semibold">andrew@atlas-engine.app</span> with two times that work and he&apos;ll send the invite.</p>
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
