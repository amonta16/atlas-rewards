"use client";
/**
 * PreviewStart — CP-232/233/234 · /medspa/app, step by step:
 *
 *   search your spa (the build starts right away, in the background)
 *   → "Where should we send your app?"  first/last name, email, mobile   ← the lead (Meta "Lead")
 *   → 6-digit texted code (only when PREVIEW_VERIFY_PHONE=1 and Twilio is set)
 *   → booking software → what you offer (pre-ticked from their website)
 *   → what's holding you back (2) → top priorities (2)
 *   → "Finishing your app…" → "{First}, your app is ready." → med.atlas-engine.app/p/<slug>
 *
 * Search and the build go through our server only (keys stay private). Every
 * request failure ends on a clear message with a way forward, never a blank page.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Loader2, MapPin, RotateCcw, Search, WifiOff } from "lucide-react";
import { ReviewQuote, ReviewStrip } from "@/components/landing/review-strip"; // CP-239
import { track } from "@/lib/landing/analytics";
import { BOOKING_TOOLS, CHALLENGES, MIN_OFFERED, OFFER_GROUPS, PICK, PRIORITIES } from "@/lib/preview/quiz";
import QRCode from "react-qr-code";
import { TrioVideo } from "@/components/landing/trio-video";
import { FOUNDING, GUARANTEES, HOLD, MONTHLY_PRICE, OFFER_NAME, SETUP_STACK, TERRITORY } from "@/lib/landing/medspa-funnel";
import { detectPlatform, e164, type Platform } from "@/lib/preview/sms";
import { SMS_CONSENT_PAGE, SMS_INFO_CONSENT_TEXT, SMS_MARKETING_CONSENT_TEXT, SMS_PRIVACY_URL, SMS_TERMS_URL } from "@/lib/preview/consent";

type Suggestion = { placeId: string; main: string; secondary: string };
type Step = "search" | "contact" | "code" | "booking" | "offer" | "challenges" | "priorities" | "finishing" | "ready" | "error";

const POLL_MS = 2500;
/** The scan screen runs at least this long, so the owner watches their app come together (CP-235). */
const SCAN_MS = 22_000;

/** What the build found on their site (from /api/preview/status once ready). */
type Found = { site: string | null; logo: string | null; color: string | null; treatments: number; treatmentNames: string[]; photos: number; team: number; font: string | null };
const GIVE_UP_MS = 220_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function newSession(): string {
  try { return crypto.randomUUID().replace(/-/g, ""); } catch { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`; }
}
function cookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
/** UTMs and click ids from the ad URL. They go to our server in POST bodies only. */
function attribution(): Record<string, string> {
  const sp = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid"]) {
    const v = sp.get(k);
    if (v) out[k] = v.slice(0, 300);
  }
  const fbp = cookie("_fbp");
  const fbc = cookie("_fbc") ?? (out.fbclid ? `fb.1.${Date.now()}.${out.fbclid}` : null);
  if (fbp) out.fbp = fbp;
  if (fbc) out.fbc = fbc;
  return out;
}
const digits = (s: string) => s.replace(/\D/g, "");
const prettyPhone = (s: string) => { const d = digits(s).slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : s; };
const offline = () => typeof navigator !== "undefined" && !navigator.onLine;

const field = "h-[52px] w-full rounded-2xl border border-[#0B1B2B]/12 bg-white px-4 text-[16px] text-[#0B1B2B] placeholder:text-[#8A97A8] focus:border-[#0B5FD6] focus:outline-none focus:ring-4 focus:ring-[#0B5FD6]/15";
const primaryBtn = "s-btn s-btn-primary s-focus h-14 w-full text-[17px] disabled:cursor-not-allowed disabled:opacity-45";

/** Which of the 3 progress segments a step belongs to, and how far into it. */
const PROGRESS: Record<Step, [number, number]> = {
  search: [0, 0.2], contact: [0, 0.6], code: [0, 0.9], booking: [1, 0.3], offer: [1, 0.75],
  challenges: [2, 0.35], priorities: [2, 0.75], finishing: [2, 0.95], ready: [2, 1], error: [0, 0],
};

function Progress({ step }: { step: Step }) {
  const [seg, frac] = PROGRESS[step];
  return (
    <div className="mt-5 grid grid-cols-3 gap-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-1.5 overflow-hidden rounded-full bg-[#0B1B2B]/8">
          <div className="h-full rounded-full bg-gradient-to-r from-[#39A0FF] via-[#0B5FD6] to-[#06318F] transition-[width] duration-500"
            style={{ width: `${i < seg ? 100 : i === seg ? Math.round(frac * 100) : 0}%` }} />
        </div>
      ))}
    </div>
  );
}

function StepShell({ step, title, sub, onBack, children, footer }: {
  step: Step; title: string; sub?: React.ReactNode; onBack?: () => void; children: React.ReactNode; footer?: React.ReactNode;
}) {
  return (
    <div className="site min-h-[100dvh] bg-white">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col px-5 pb-8 pt-6">
        <header className="flex h-10 items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/atlas-engine-logo-navy.png" alt="Atlas Engine" width={1315} height={494} className="h-6 w-auto" />
          {onBack && (
            <button type="button" onClick={onBack} className="s-focus inline-flex items-center gap-1 rounded-full px-2 py-1 text-[14px] text-[#3A4A5C] hover:bg-[#0B1B2B]/5">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </button>
          )}
        </header>
        <h1 className="mt-8 text-[30px] font-bold leading-[1.1] tracking-[-0.025em] text-[#0B1B2B]">{title}</h1>
        <Progress step={step} />
        {sub && <p className="mt-5 text-[16px] text-[#3A4A5C]">{sub}</p>}
        <div className="mt-5 flex-1">{children}</div>
        {footer && <div className="sticky bottom-0 -mx-5 mt-6 bg-gradient-to-t from-white via-white to-white/0 px-5 pb-2 pt-4">{footer}</div>}
      </div>
    </div>
  );
}

export function PreviewStart({ smsNumber: rawSms = null }: { smsNumber?: string | null } = {}) {
  // CP-237: the A2P number for "Take your app on the go" (PREVIEW_SMS_NUMBER, read on the server).
  const smsNumber = e164(rawSms);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [sad, setSad] = useState(false);
  const [qualified, setQualified] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>("search");
  const [error, setError] = useState<{ message: string; offline?: boolean; retry?: Suggestion } | null>(null);
  // search
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // the build
  const [spa, setSpa] = useState<Suggestion | null>(null);
  const [preview, setPreview] = useState<{ slug: string; url: string } | null>(null);
  const [built, setBuilt] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  // contact + code
  const [contact, setContact] = useState({ first: "", last: "", email: "", phone: "", consent: false, marketing: false });
  const [code, setCode] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  // quiz
  const [tool, setTool] = useState<string | null>(null);
  const [toolOther, setToolOther] = useState("");
  const [offered, setOffered] = useState<string[]>([]);
  const [openGroup, setOpenGroup] = useState<string | null>(OFFER_GROUPS[0].id);
  const [challenges, setChallenges] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<string[]>([]);
  // request state for the current step
  const [busy, setBusy] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [pct, setPct] = useState(0);

  const session = useRef("");
  const abort = useRef<AbortController | null>(null);
  const attr = useRef<Record<string, string>>({});
  const hp = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => { session.current = newSession(); attr.current = attribution(); setPlatform(detectPlatform(navigator.userAgent)); }, []);

  // CP-237: "Don't leave me!" while the app finishes: when they switch away and come back,
  // or (desktop) move the mouse up to the tab bar.
  useEffect(() => {
    if (step !== "finishing") return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const sadFor = () => { setSad(true); clearTimeout(t); t = setTimeout(() => setSad(false), 3500); };
    const onVis = () => { if (document.visibilityState === "visible") sadFor(); };
    const onLeave = (e: MouseEvent) => { if (e.clientY <= 0) sadFor(); };
    document.addEventListener("visibilitychange", onVis);
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => { clearTimeout(t); document.removeEventListener("visibilitychange", onVis); document.documentElement.removeEventListener("mouseleave", onLeave); };
  }, [step]);
  useEffect(() => { setStepError(null); window.scrollTo({ top: 0 }); }, [step]);

  // Debounced autocomplete
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setSuggestions([]); setSearchError(null); return; }
    const t = setTimeout(async () => {
      abort.current?.abort();
      const ac = new AbortController();
      abort.current = ac;
      setSearching(true);
      try {
        const r = await fetch("/api/preview/places/autocomplete", {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: ac.signal,
          body: JSON.stringify({ input: q, session: session.current }),
        });
        const j = (await r.json().catch(() => ({}))) as { suggestions?: Suggestion[]; error?: string };
        if (!r.ok) { setSearchError(j.error ?? "Search is having trouble. Please try again."); setSuggestions([]); return; }
        setSearchError(null);
        setSuggestions(j.suggestions ?? []);
        setActive(-1);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setSearchError(offline() ? "You seem to be offline. Check your connection." : "Search is having trouble. Please try again.");
      } finally {
        if (!ac.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Poll the build in the background while they answer.
  useEffect(() => {
    if (!preview || built) return;
    let stop = false;
    const started = Date.now();
    let misses = 0;
    let first = true;
    (async () => {
      while (!stop) {
        // First check right away: a preview that's already built (same spa searched before) answers at once.
        if (!first) await new Promise((r) => setTimeout(r, POLL_MS));
        first = false;
        if (stop) return;
        try {
          const r = await fetch(`/api/preview/status?slug=${encodeURIComponent(preview.slug)}`, { cache: "no-store" });
          const j = (await r.json().catch(() => ({}))) as { status?: string; found?: Found | null };
          if (r.ok && (j.status === "ready" || j.status === "expired")) {
            setFound(j.found ?? null);
            setBuilt(true);
            return;
          }
          misses = r.ok ? 0 : misses + 1;
        } catch { misses++; }
        if (misses > 8 || Date.now() - started > GIVE_UP_MS) { setBuilt(true); return; } // the page shows whatever is there
      }
    })();
    return () => { stop = true; };
  }, [preview, built]);

  // The scan: progress climbs steadily for at least SCAN_MS (and waits at 96% if the build isn't
  // done yet), findings tick in as it goes, then the reveal.
  useEffect(() => {
    if (step !== "finishing") return;
    const t0 = Date.now();
    const t = setInterval(() => {
      const target = Math.min(96, Math.round(((Date.now() - t0) / SCAN_MS) * 96));
      setPct((p) => Math.max(p, target));
    }, 200);
    return () => clearInterval(t);
  }, [step]);
  useEffect(() => {
    if (step !== "finishing" || !built || pct < 96) return;
    setPct(100);
    const t = setTimeout(() => { setStep("ready"); track("preview_ready", { contact: true }); }, 1100);
    return () => clearTimeout(t);
  }, [step, built, pct]);

  const start = useCallback(async (s: Suggestion) => {
    setSuggestions([]);
    setSpa(s);
    setPreview(null);
    setBuilt(false);
    setFound(null);
    setError(null);
    setStep("contact");
    track("preview_search", { selected: true });
    try {
      const r = await fetch("/api/preview/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: s.placeId, session: session.current, hp: hp.current?.value || undefined, ...attr.current }),
      });
      const j = (await r.json().catch(() => ({}))) as { slug?: string; status?: string; url?: string; error?: string };
      if (!r.ok || !j.slug || !j.url) {
        track("preview_failed", { reason: String(r.status) });
        setError({ message: r.status === 429 ? "You've built a few previews already. Please wait a few minutes and try again." : j.error ?? "Something went wrong on our side. Please try again.", retry: s });
        setStep("error");
        return;
      }
      setPreview({ slug: j.slug, url: j.url });
      session.current = newSession();
      track("preview_started", {});
    } catch {
      setError({ message: offline() ? "You seem to be offline. Check your connection and try again." : "We couldn't reach our server. Please try again.", offline: offline(), retry: s });
      setStep("error");
    }
  }, []);

  async function post(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; json: Record<string, unknown> }> {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      return { ok: r.ok, json: (await r.json().catch(() => ({}))) as Record<string, unknown> };
    } catch {
      return { ok: false, json: { error: offline() ? "You seem to be offline. Check your connection." : "We couldn't reach our server. Please try again." } };
    }
  }

  async function submitContact(e: React.FormEvent) {
    e.preventDefault();
    const d = digits(contact.phone);
    if (!contact.first.trim()) return setStepError("Please enter your first name.");
    if (!EMAIL_RE.test(contact.email.trim())) return setStepError("Please enter a valid email.");
    if (!(d.length === 10 || (d.length === 11 && d.startsWith("1")))) return setStepError("Please enter a US mobile number.");
    if (!preview) return setStepError("One moment, we're still starting your app…");
    setBusy(true);
    const { ok, json } = await post("/api/preview/contact", {
      slug: preview.slug, first_name: contact.first.trim(), last_name: contact.last.trim(), email: contact.email.trim(), phone: contact.phone,
      sms_consent: contact.consent, sms_marketing_consent: contact.marketing, hp: hp.current?.value || undefined,
    });
    setBusy(false);
    if (!ok) return setStepError(String(json.error ?? "That didn't go through. Please try again."));
    if (json.event_id) track("preview_contact", { event_id: String(json.event_id) });
    // The texted code is an SMS too: only for owners who ticked the informational box.
    if (json.verify && contact.consent) {
      setNeedsCode(true);
      const sent = await post("/api/preview/verify", { slug: preview.slug, action: "send" });
      if (sent.ok && !sent.json.skip) { setStep("code"); return; }
    }
    setStep("booking");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) return;
    if (digits(code).length < 4) return setStepError("Enter the code we texted you.");
    setBusy(true);
    const { ok, json } = await post("/api/preview/verify", { slug: preview.slug, action: "check", code: digits(code) });
    setBusy(false);
    if (!ok) return setStepError(String(json.error ?? "That code didn't match. Try again."));
    setStep("booking");
  }

  async function resendCode() {
    if (!preview) return;
    setBusy(true);
    const { ok, json } = await post("/api/preview/verify", { slug: preview.slug, action: "send" });
    setBusy(false);
    setStepError(ok ? "New code sent." : String(json.error ?? "Couldn't send a new code."));
  }

  async function submitAnswers() {
    if (!preview) return;
    setBusy(true);
    const { ok, json } = await post("/api/preview/answers", {
      slug: preview.slug, booking_system: toolOther.trim() || tool, offered, challenges, priorities,
    });
    setBusy(false);
    if (!ok) return setStepError(String(json.error ?? "We couldn't save that. Please try again."));
    track("preview_quiz_done", { priorities: priorities.join(",") });
    setQualified(typeof json.qualified === "boolean" ? json.qualified : null);
    setPct(0);
    setStep("finishing");
  }

  const toggle = (list: string[], set: (v: string[]) => void, id: string, max?: number) => {
    if (list.includes(id)) set(list.filter((x) => x !== id));
    else if (!max || list.length < max) set([...list, id]);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const s = suggestions[active >= 0 ? active : 0]; if (s) start(s); }
    else if (e.key === "Escape") setSuggestions([]);
  };

  // CP-237: never "built" here. Even when the server build is already done (a spa searched before),
  // "complete" belongs to the end of the scan animation on the finishing step, not to this step.
  const buildChip = useMemo(() => spa && (
    <div className="inline-flex items-center gap-2 rounded-full bg-[#E6F1FF] px-3 py-1.5 text-[13px] font-semibold text-[#0B5FD6]">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      {`Building ${spa.main}'s app…`}
    </div>
  ), [spa]);

  const honeypot = <input ref={hp} type="text" name="website_url_hp" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />;

  /* ───────────── search (landing) ───────────── */
  if (step === "search") {
    return (
      <div className="site min-h-[100dvh] overflow-x-clip bg-white">
        {honeypot}
        <header className="s-wrap flex h-[72px] items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/atlas-engine-logo-navy.png" alt="Atlas Engine" width={1315} height={494} className="h-7 w-auto" />
          <a href="/medspa" className="text-[14px] font-semibold text-[#3A4A5C] hover:text-[#0B1B2B]">How it works</a>
        </header>
        {/* CP-237: three grid items so the phones sit right under the search on phones (text, video, SMS note),
            while on desktop the video spans both rows of the right column. */}
        <main className="s-wrap grid items-center gap-10 pb-16 pt-6 lg:min-h-[calc(100dvh-72px)] lg:grid-cols-[0.95fr_1.05fr] lg:content-center lg:gap-x-16 lg:gap-y-0 lg:pb-10 lg:pt-0">
          <div className="lg:col-start-1 lg:row-start-1">
            <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#0B5FD6]">For med spas</p>
            <h1 className="mt-4 max-w-[13ch] text-[clamp(2.4rem,1.6rem+3.4vw,4.3rem)] font-bold leading-[1.02] tracking-[-0.035em] text-[#0B1B2B]">
              See your patient app before you spend a dollar.
            </h1>
            <p className="mt-5 max-w-[32rem] text-[18px] leading-relaxed text-[#3A4A5C]">
              Type your practice&apos;s name. We read your website and build your own app: your logo, your colors, your treatments.
            </p>

            <div className="relative mt-8 w-full max-w-[540px]">
              <label htmlFor="pv-search" className="sr-only">Your med spa&apos;s name</label>
              <div className="flex h-[60px] items-center gap-3 rounded-2xl border border-[#0B1B2B]/15 bg-white pl-5 pr-3 shadow-[0_18px_40px_-28px_rgba(11,27,43,.45)] focus-within:border-[#0B5FD6] focus-within:ring-4 focus-within:ring-[#0B5FD6]/15">
                <Search className="h-5 w-5 shrink-0 text-[#6B7A8C]" aria-hidden />
                <input
                  id="pv-search" type="text" role="combobox" aria-expanded={suggestions.length > 0} aria-controls={listId} aria-autocomplete="list"
                  aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined} autoComplete="off" autoFocus enterKeyHint="search"
                  placeholder="Your med spa's name" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
                  className="h-full min-w-0 flex-1 bg-transparent text-[17px] text-[#0B1B2B] placeholder:text-[#8A97A8] focus:outline-none"
                />
                {searching && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#0B5FD6]" aria-label="Searching" />}
              </div>
              {suggestions.length > 0 && (
                <ul id={listId} role="listbox" className="absolute inset-x-0 top-[66px] z-20 overflow-hidden rounded-2xl border border-[#0B1B2B]/10 bg-white py-1.5 shadow-[0_24px_50px_-24px_rgba(11,27,43,.45)]">
                  {suggestions.map((s, i) => (
                    <li key={s.placeId} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                      <button type="button" onMouseEnter={() => setActive(i)} onClick={() => start(s)} className={`flex w-full items-start gap-3 px-4 py-2.5 text-left ${i === active ? "bg-[#F1F6FD]" : ""}`}>
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#0B5FD6]" aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate text-[15.5px] font-semibold text-[#0B1B2B]">{s.main}</span>
                          <span className="block truncate text-[13.5px] text-[#6B7A8C]">{s.secondary}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                  <li className="px-4 pb-1 pt-1.5 text-right text-[11px] text-[#8A97A8]">Search by Google</li>
                </ul>
              )}
              {searchError && <p role="alert" className="mt-3 text-[14px] font-medium text-red-700">{searchError}</p>}
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[14.5px] text-[#3A4A5C]">
              {["Free", "No card needed", "Ready in about 2 minutes"].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-[#0B5FD6]" aria-hidden />{t}</li>
              ))}
            </ul>
            {/* CP-237: the offer, up front. Numbers from lib/landing/medspa-funnel.ts. */}
            <p className="mt-4 max-w-[34rem] text-[14.5px] leading-relaxed text-[#3A4A5C]">
              The preview is free. If you want it live, {FOUNDING.active ? <>our first {FOUNDING.spots} med spas pay a <b className="text-[#0B1B2B]">{usd(FOUNDING.setupFounding)} setup</b> <span className="line-through decoration-rose-400/80">{usd(FOUNDING.setupFull)}</span></> : <>setup is <b className="text-[#0B1B2B]">{usd(FOUNDING.setupFull)}</b></>} and one flat monthly plan. One med spa per {TERRITORY.radiusMiles}-mile area.
            </p>

          </div>
          {/* CP-237: three real med spa previews on 3D phones (projects/medspa-trio-3d), a seamless 6 s loop.
              White background + multiply, so the video's edge disappears into the page. Wider than its column on desktop. */}
          <figure className="relative mx-auto w-full max-w-[560px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mx-0 lg:max-w-none">
            <TrioVideo className="lg:w-[122%] lg:max-w-none" />
            <figcaption className="mt-1 text-center text-[13px] text-[#6B7A8C] lg:w-[122%]">Three med spa apps, each built from the practice&apos;s own website.</figcaption>
          </figure>
          <p className="max-w-[34rem] border-t border-[#0B1B2B]/8 pt-4 text-[12.5px] leading-relaxed text-[#6B7A8C] lg:col-start-1 lg:row-start-2 lg:mt-8">
            Text messages are optional. On the next step there are two separate unchecked boxes: one for your app link and
            call reminders (&ldquo;{SMS_INFO_CONSENT_TEXT}&rdquo;) and one for offers (&ldquo;{SMS_MARKETING_CONSENT_TEXT}&rdquo;).
            Your app is emailed either way.{" "}
            <a href={SMS_CONSENT_PAGE} className="underline">See the form</a> · <a href={SMS_TERMS_URL} className="underline">Terms</a> · <a href={SMS_PRIVACY_URL} className="underline">Privacy Policy</a>
          </p>
        </main>
        {/* CP-239: real client reviews, near the bottom (nothing renders until there are some). */}
        <ReviewStrip />
      </div>
    );
  }

  /* ───────────── error ───────────── */
  if (step === "error" && error) {
    return (
      <StepShell step="error" title="That didn't work">
        {error.offline && <WifiOff className="h-6 w-6 text-[#0B5FD6]" aria-hidden />}
        <p role="alert" className="text-[16px] text-[#3A4A5C]">{error.message}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          {error.retry && <button type="button" onClick={() => start(error.retry!)} className="s-btn s-btn-primary s-focus"><RotateCcw className="h-4 w-4" aria-hidden /> Try again</button>}
          <button type="button" onClick={() => { setStep("search"); setQuery(""); }} className="s-btn s-btn-quiet s-focus">Search again</button>
        </div>
      </StepShell>
    );
  }

  const errLine = stepError && <p role="alert" className="mb-3 text-center text-[14px] font-medium text-red-700">{stepError}</p>;

  /* ───────────── contact ───────────── */
  if (step === "contact") {
    return (
      <StepShell step="contact" title="Where should we send your app?" sub={buildChip} onBack={() => setStep("search")}
        footer={<>{errLine}<button form="pv-contact" type="submit" disabled={busy} className={primaryBtn}>{busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}Create my app</button></>}>
        {honeypot}
        <form id="pv-contact" onSubmit={submitContact} noValidate className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[14px] font-medium text-[#3A4A5C]">First name
              <input className={`${field} mt-1.5`} autoComplete="given-name" value={contact.first} onChange={(e) => setContact((c) => ({ ...c, first: e.target.value }))} autoFocus />
            </label>
            <label className="block text-[14px] font-medium text-[#3A4A5C]">Last name
              <input className={`${field} mt-1.5`} autoComplete="family-name" value={contact.last} onChange={(e) => setContact((c) => ({ ...c, last: e.target.value }))} />
            </label>
          </div>
          <label className="block text-[14px] font-medium text-[#3A4A5C]">Email
            <input className={`${field} mt-1.5`} type="email" inputMode="email" autoComplete="email" placeholder="you@yourspa.com" value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} />
          </label>
          {/* CP-236: the mobile number and both SMS boxes are one fieldset, so the boxes visibly (and for
              screen readers / carrier review) refer to this number. */}
          <fieldset className="space-y-3 rounded-2xl border border-[#0B1B2B]/10 p-4">
            <legend className="px-1 text-[14px] font-semibold text-[#0B1B2B]">Mobile number and text messages</legend>
            <label htmlFor="pv-mobile" className="block text-[14px] font-medium text-[#3A4A5C]">Mobile number</label>
            <div className="flex gap-2">
              <span className="grid h-[52px] shrink-0 place-items-center rounded-2xl border border-[#0B1B2B]/12 bg-[#F6F9FD] px-4 text-[16px] text-[#0B1B2B]">US +1</span>
              <input id="pv-mobile" name="mobile_phone" className={field} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(555) 555-0123" aria-describedby="pv-sms-note" value={contact.phone} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} />
            </div>
            <p id="pv-sms-note" className="text-[12.5px] text-[#6B7A8C]">We only text this number if you tick a box below. Both are optional.</p>
            <label className="flex items-start gap-3 text-[12.5px] leading-snug text-[#3A4A5C]">
              <input type="checkbox" name="sms_consent" aria-describedby="pv-sms-note" className="mt-0.5 h-4 w-4 shrink-0 accent-[#0B5FD6]" checked={contact.consent} onChange={(e) => setContact((c) => ({ ...c, consent: e.target.checked }))} />
              <span>{SMS_INFO_CONSENT_TEXT}</span>
            </label>
            <label className="flex items-start gap-3 text-[12.5px] leading-snug text-[#3A4A5C]">
              <input type="checkbox" name="sms_marketing_consent" aria-describedby="pv-sms-note" className="mt-0.5 h-4 w-4 shrink-0 accent-[#0B5FD6]" checked={contact.marketing} onChange={(e) => setContact((c) => ({ ...c, marketing: e.target.checked }))} />
              <span>{SMS_MARKETING_CONSENT_TEXT}</span>
            </label>
            <p className="pl-7 text-[12.5px] text-[#6B7A8C]"><a href={SMS_TERMS_URL} target="_blank" className="underline">Terms</a> · <a href={SMS_PRIVACY_URL} target="_blank" className="underline">Privacy Policy</a></p>
          </fieldset>
        </form>
      </StepShell>
    );
  }

  /* ───────────── texted code ───────────── */
  if (step === "code") {
    return (
      <StepShell step="code" title="Enter the code" sub={<>We texted a 6-digit code to <b className="text-[#0B1B2B]">{prettyPhone(contact.phone)}</b>.</>}
        footer={<>{errLine}<button form="pv-code" type="submit" disabled={busy} className={primaryBtn}>{busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}Verify</button></>}>
        <form id="pv-code" onSubmit={submitCode}>
          <input className={`${field} text-center text-[24px] tracking-[0.5em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={8} autoFocus value={code} onChange={(e) => setCode(digits(e.target.value))} aria-label="6-digit code" />
        </form>
        <div className="mt-4 flex justify-between text-[14px] text-[#3A4A5C]">
          <button type="button" onClick={() => setStep("contact")} className="underline-offset-4 hover:underline">Change number</button>
          <button type="button" onClick={resendCode} disabled={busy} className="underline-offset-4 hover:underline">Resend code</button>
        </div>
      </StepShell>
    );
  }

  /* ───────────── booking software ───────────── */
  if (step === "booking") {
    const choose = (t: string | null) => { setTool(t); setToolOther(""); };
    return (
      <StepShell step="booking" title="Which booking software do you use?" sub="So your app's “Book” button goes to the right place." onBack={() => setStep(needsCode ? "code" : "contact")}
        footer={<>
          <button type="button" disabled={!tool && !toolOther.trim()} onClick={() => setStep("offer")} className={primaryBtn}>Continue</button>
          <button type="button" onClick={() => { choose("None"); setStep("offer"); }} className="mt-3 w-full text-center text-[14px] text-[#3A4A5C] underline-offset-4 hover:underline">I don&apos;t use booking software</button>
        </>}>
        <div className="grid grid-cols-3 gap-2">
          {BOOKING_TOOLS.map((t) => {
            const on = tool === t.name;
            return (
              <button key={t.name} type="button" onClick={() => choose(t.name)} aria-pressed={on}
                className={`flex h-[84px] flex-col items-center justify-center gap-1.5 rounded-xl border px-1 transition ${on ? "border-[#0B5FD6] bg-[#F1F6FD] ring-2 ring-[#0B5FD6]" : "border-[#0B1B2B]/10 bg-white hover:border-[#0B1B2B]/25"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/booking-logos/${t.logo}.png`} alt="" width={30} height={30} className="h-[30px] w-[30px] rounded-lg object-contain" />
                <span className={`line-clamp-2 max-w-full text-center text-[12px] font-semibold leading-tight ${on ? "text-[#06318F]" : "text-[#0B1B2B]"}`}>{t.name}</span>
              </button>
            );
          })}
        </div>
        <label className="mt-5 block text-[14px] font-medium text-[#3A4A5C]">Not listed? Type it
          <input className={`${field} mt-1.5`} value={toolOther} onChange={(e) => { setToolOther(e.target.value); if (e.target.value) setTool(null); }} placeholder="e.g. Jane, Acuity" />
        </label>
      </StepShell>
    );
  }

  /* ───────────── what do you offer ───────────── */
  if (step === "offer") {
    const n = offered.length;
    return (
      <StepShell step="offer" title="What do you offer?" onBack={() => setStep("booking")}
        sub={`Pick at least ${MIN_OFFERED} treatments your clinic offers.`}
        footer={<button type="button" disabled={n < MIN_OFFERED} onClick={() => setStep("challenges")} className={primaryBtn}>{n < MIN_OFFERED ? `Pick at least ${MIN_OFFERED} (${n}/${MIN_OFFERED})` : `Continue (${n} selected)`}</button>}>
        <div className="space-y-2.5">
          {OFFER_GROUPS.map((g) => {
            const open = openGroup === g.id;
            const count = g.items.filter((i) => offered.includes(i.id)).length;
            return (
              <div key={g.id} className="overflow-hidden rounded-2xl border border-[#0B1B2B]/10 bg-white">
                <button type="button" onClick={() => setOpenGroup(open ? null : g.id)} aria-expanded={open} className="flex h-[60px] w-full items-center justify-between px-5 text-left">
                  <span className="text-[17px] font-semibold text-[#0B1B2B]">{g.label}{count > 0 && <span className="ml-2 rounded-full bg-[#E6F1FF] px-2 py-0.5 text-[12px] font-bold text-[#0B5FD6]">{count}</span>}</span>
                  <ChevronDown className={`h-5 w-5 text-[#6B7A8C] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {open && (
                  <div className="border-t border-[#0B1B2B]/8 px-3 py-2">
                    {g.items.map((i) => {
                      const on = offered.includes(i.id);
                      return (
                        <label key={i.id} className="flex cursor-pointer items-start gap-3 rounded-xl px-2 py-3 hover:bg-[#F6F9FD]">
                          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#0B5FD6]" checked={on} onChange={() => toggle(offered, setOffered, i.id)} />
                          <span>
                            <span className="block text-[16px] text-[#0B1B2B]">{i.label}</span>
                            {i.hint && <span className="block text-[13.5px] text-[#6B7A8C]">{i.hint}</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </StepShell>
    );
  }

  /* ───────────── pick-2 questions ───────────── */
  const PickTwo = ({ s, title, options, value, set, next, back, cta }: {
    s: Step; title: string; options: ReadonlyArray<{ id: string; label: string }>; value: string[]; set: (v: string[]) => void; next: () => void; back: () => void; cta: string;
  }) => (
    <StepShell step={s} title={title} onBack={back} sub={<>Pick exactly {PICK}. <b className="text-[#0B1B2B]">{value.length}/{PICK} selected</b></>}
      footer={<>{errLine}<button type="button" disabled={value.length !== PICK || busy} onClick={next} className={primaryBtn}>{busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}{value.length === PICK ? cta : `Pick ${PICK}`}</button></>}>
      <div className="space-y-2.5">
        {options.map((o) => {
          const on = value.includes(o.id);
          const dim = !on && value.length >= PICK;
          return (
            <button key={o.id} type="button" onClick={() => toggle(value, set, o.id, PICK)} aria-pressed={on}
              className={`w-full rounded-2xl border px-5 py-4 text-left text-[16.5px] leading-snug transition ${on ? "border-[#0B5FD6] bg-[#E6F1FF] font-semibold text-[#06318F] ring-2 ring-[#0B5FD6]" : dim ? "border-[#0B1B2B]/8 text-[#0B1B2B]/40" : "border-[#0B1B2B]/10 text-[#0B1B2B] hover:border-[#0B1B2B]/25"}`}>
              {o.label}
            </button>
          );
        })}
      </div>
    </StepShell>
  );

  if (step === "challenges") {
    return PickTwo({ s: "challenges", title: "What's holding your clinic back?", options: CHALLENGES, value: challenges, set: setChallenges, next: () => setStep("priorities"), back: () => setStep("offer"), cta: "Continue" });
  }
  if (step === "priorities") {
    return PickTwo({ s: "priorities", title: "What are your top 2 priorities?", options: PRIORITIES, value: priorities, set: setPriorities, next: submitAnswers, back: () => setStep("challenges"), cta: "Finish my app" });
  }

  /* ───────────── finishing → ready ───────────── */
  const first = contact.first.trim() || "Your";
  if (step === "finishing") {
    // CP-237: Dermis-style hand-off after the last question. A few seconds of "Optimizing… N%",
    // then "{First}, we're almost done…" with the progress bar, time left, OR, and "Take your app
    // on the go" (a text to our number with their app code filled in; /api/preview/sms-inbound
    // replies with the link). Leaving the page (switching apps, mouse to the tab bar) gets
    // "Don't leave me!". "Ready" still waits for the scan (SCAN_MS) and the real build status.
    const f = found;
    const brand = f?.color ?? "#0B5FD6";
    const items: Array<{ at: number; doing: string; done: string }> = [
      { at: 4, doing: f?.site ? `Reading ${f.site}` : "Reading your website", done: f?.site ? `Read ${f.site}` : "Read your website" },
      { at: 20, doing: "Finding your logo", done: f?.logo ? "Found your logo" : "Made your monogram" },
      { at: 36, doing: "Matching your brand color", done: "Matched your brand color" },
      { at: 52, doing: "Pulling your treatments", done: f?.treatments ? `Added ${f.treatments} of your treatments` : "Added a starter menu" },
      { at: 68, doing: "Adding your photos", done: f?.photos ? `Added ${f.photos} of your photos` : "Added photos" },
      { at: 82, doing: "Setting up rewards and memberships", done: "Rewards and memberships ready" },
    ];
    const isDone = (i: number) => pct >= items[i].at + 12 && (built || i === 0);
    const stage = Math.max(0, items.findIndex((_, i) => !isDone(i)));
    const showLogo = isDone(1), showColor = isDone(2), showMenu = isDone(3);
    const name = contact.first.trim();
    const optimizing = pct < 14;
    const secsLeft = Math.max(1, Math.ceil((SCAN_MS * (96 - Math.min(pct, 96))) / 96 / 1000));
    const spaName = spa?.main ?? "my spa";
    const smsBody = preview ? `Hi! I'm waiting on my ${spaName} app (${preview.slug}). Here's the email I used: ${contact.email.trim()}` : "";
    const sms = smsNumber && preview && platform !== "desktop" ? `sms:${smsNumber}${platform === "ios" ? "&" : "?"}body=${encodeURIComponent(smsBody)}` : null;
    const phone = (
      <div className="relative">
        {sad && (
          <div className="absolute -left-[118px] top-2 z-10 rounded-2xl bg-white px-3.5 py-2 text-[14px] font-semibold text-[#0B1B2B] shadow-[0_12px_30px_-12px_rgba(11,27,43,.45)] ring-1 ring-black/5" role="status">
            Don&apos;t leave me!
            <span aria-hidden className="absolute -right-1.5 top-4 h-3 w-3 rotate-45 bg-white" />
          </div>
        )}
        <div className={`relative h-[220px] w-[110px] overflow-hidden rounded-[24px] border-[5px] border-[#0B1B2B] bg-white shadow-[0_30px_60px_-30px_rgba(11,27,43,.6)] transition-transform duration-500 ${sad ? "-rotate-6" : ""}`}>
          <div className="mx-auto mt-1 h-2.5 w-9 rounded-full bg-[#0B1B2B]" />
          <div className="flex h-6 items-center px-2">
            {showLogo && f?.logo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={f.logo} alt="" className="h-4 max-w-[64px] object-contain" />
              : <span className="h-2 w-10 rounded-full bg-[#E6EBF2]" style={{ animation: "pvpulse 1.4s ease-in-out infinite" }} />}
          </div>
          <div className="mx-1.5 h-[62px] rounded-lg transition-colors duration-700" style={{ background: showColor ? `linear-gradient(140deg, ${brand}, ${brand}cc)` : "#E6EBF2" }} />
          <div className="mx-1.5 mt-1.5 grid grid-cols-2 gap-1">
            {[0, 1, 2, 3].map((k) => <div key={k} className="h-[38px] rounded-md transition-colors duration-700" style={{ background: showMenu ? `${brand}${k % 2 ? "26" : "40"}` : "#EEF2F7" }} />)}
          </div>
          {sad && <div className="absolute inset-0 grid place-items-center bg-white/70 text-[34px]" aria-hidden>🥺</div>}
          {pct < 100 && <div className="pointer-events-none absolute inset-x-0 top-0 h-12" style={{ animation: "pvscan 2.2s ease-in-out infinite alternate", background: `linear-gradient(180deg, transparent, ${brand}33 60%, ${brand}aa 96%, transparent)` }} />}
        </div>
      </div>
    );
    return (
      <div className="site min-h-[100dvh] bg-white">
        <style>{`@keyframes pvscan{0%{transform:translateY(-10%)}100%{transform:translateY(520%)}}@keyframes pvpulse{0%,100%{opacity:.55}50%{opacity:1}}`}</style>
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col items-center justify-center px-5 py-10 text-center" role="status" aria-live="polite">
          {optimizing ? (
            <>
              {phone}
              <p className="mt-6 text-[17px] text-[#6B7A8C]">Optimizing&hellip; <span className="tabular-nums">{pct}%</span></p>
            </>
          ) : (
            <>
              <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.025em] text-[#0B1B2B]">
                {pct >= 100 ? (name ? `${name}, it's ready!` : "It's ready!") : name ? `${name}, we're almost done…` : "We're almost done…"}
              </h1>
              <div className="mt-8">{phone}</div>
              <div className="mt-8 w-full">
                <div className="h-2.5 overflow-hidden rounded-full bg-[#0B1B2B]/8">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#39A0FF] via-[#0B5FD6] to-[#06318F] transition-[width] duration-200" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-3 text-[15px] text-[#6B7A8C]">
                  {pct >= 100 ? "Done" : pct >= 96 ? "Finishing touches…" : `Est. time remaining: ${secsLeft} sec`}
                </p>
                <p className="mt-1 min-h-[20px] truncate text-[13.5px] text-[#8A97A8]">{pct < 96 ? `${isDone(stage) ? items[stage].done : items[stage].doing}…` : ""}</p>
              </div>
              {smsNumber && preview && pct < 100 && (
                <>
                  <div className="my-6 flex w-full items-center gap-4 text-[13px] font-semibold text-[#8A97A8]"><span className="h-px flex-1 bg-[#0B1B2B]/10" />OR<span className="h-px flex-1 bg-[#0B1B2B]/10" /></div>
                  {sms ? (
                    <a href={sms} onClick={() => track("preview_on_the_go", { platform })} className="s-focus grid h-14 w-full place-items-center rounded-2xl bg-[#0B1B2B] text-[17px] font-semibold text-white">Take your app on the go</a>
                  ) : (
                    <div className="flex w-full items-center gap-4 rounded-2xl border border-[#0B1B2B]/10 p-4 text-left">
                      <div className="shrink-0 rounded-lg bg-white p-1.5 ring-1 ring-black/5"><QRCode value={`SMSTO:${smsNumber}:${smsBody}`} size={92} level="M" /></div>
                      <p className="text-[14px] leading-snug text-[#3A4A5C]"><b className="text-[#0B1B2B]">Take your app on the go.</b> Scan with your phone&apos;s camera: it opens a text to us with your app&apos;s code filled in. Hit send and we&apos;ll text your app back.</p>
                    </div>
                  )}
                  <p className="mt-3 text-[12px] leading-snug text-[#8A97A8]">Opens a text to Atlas Engine at {prettyPhone(smsNumber)}. We reply with your app link. Msg &amp; data rates may apply. Reply STOP to opt out.</p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }
  if (step === "ready" && preview) {
    const desk = preview.url.replace(`/p/${preview.slug}`, `/${preview.slug}/desk`);
    return (
      <StepShell step="ready" title={`${first === "Your" ? "Your" : `${first}, your`} app is ready.`}>
        <div className="flex flex-col items-center pt-6 text-center">
          <span className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-[#39A0FF] to-[#06318F] text-white shadow-[0_20px_40px_-20px_rgba(6,49,143,.8)]"><Check className="h-10 w-10" aria-hidden /></span>
          <p className="mt-6 max-w-[30ch] text-[17px] text-[#3A4A5C]">{spa?.main ?? "Your spa"}&apos;s own patient app, with your logo, colors and treatments. We also emailed you the link.</p>
          <a href={preview.url} className={`${primaryBtn} mt-8`}>Open my app</a>
          {/* CP-237: the preview's front desk (same link as the welcome email). */}
          <a href={desk} className="s-focus mt-4 text-[15px] font-semibold text-[#0B5FD6] underline-offset-4 hover:underline">Open my front desk</a>
        </div>
        <OfferCard slug={preview.slug} qualified={qualified} />
      </StepShell>
    );
  }
  return null;
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

/**
 * CP-237 · the offer, stated plainly where the owner first sees their app. Every number comes
 * from lib/landing/medspa-funnel.ts (the same source as the /medspa offer section and FAQ).
 */
function OfferCard({ slug, qualified }: { slug: string; qualified: boolean | null }) {
  const taken = qualified === false;
  return (
    <section aria-labelledby="pv-offer" className="mt-10 rounded-[24px] border border-[#0B1B2B]/10 bg-[#F6F9FD] p-5 text-left sm:p-6">
      <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-[#0B5FD6]">{FOUNDING.active ? `Want it live? First ${FOUNDING.spots} med spas` : "Want it live?"}</p>
      <h2 id="pv-offer" className="mt-1.5 text-[22px] font-bold leading-tight tracking-[-0.02em] text-[#0B1B2B]">{FOUNDING.active ? `The ${OFFER_NAME}` : "Your setup"}</h2>
      <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1">
        {FOUNDING.active && <span className="pb-1 text-[16px] font-semibold text-[#8A97A8] line-through decoration-rose-400/80">{usd(FOUNDING.setupFull)}</span>}
        <span className="text-[40px] font-extrabold leading-none tracking-tight text-[#0B1B2B]">{usd(FOUNDING.active ? FOUNDING.setupFounding : FOUNDING.setupFull)}</span>
        <span className="pb-1 text-[14px] text-[#3A4A5C]">one-time setup</span>
      </div>
      <p className="mt-2 text-[13.5px] leading-snug text-[#3A4A5C]">
        {MONTHLY_PRICE ? `Then ${usd(MONTHLY_PRICE)} a month, month to month.` : "Then one flat monthly plan, month to month, quoted on your walkthrough."} No percentage of your treatment revenue.
        {FOUNDING.active ? ` Founding price in exchange for ${FOUNDING.trade}.` : ""}
      </p>
      <ul className="mt-4 space-y-2">
        {SETUP_STACK.map((s) => (
          <li key={s.title} className="flex items-start gap-2.5 text-[14.5px] leading-snug text-[#0B1B2B]">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0B5FD6]" strokeWidth={3} aria-hidden />{s.title}
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-1.5 border-t border-[#0B1B2B]/8 pt-4">
        {GUARANTEES.map((g) => <p key={g.id} className="text-[13.5px] leading-snug text-[#3A4A5C]"><b className="text-[#0B1B2B]">{g.title}</b> {g.short}.</p>)}
      </div>
      <p className="mt-4 text-[13.5px] font-semibold text-[#0B1B2B]">
        {taken ? `Another med spa holds your area (one per ${TERRITORY.radiusMiles} miles). Join the waitlist and we'll tell you if it opens.` : `One med spa per ${TERRITORY.radiusMiles}-mile area.${qualified ? ` Yours is held for ${HOLD.hours} hours.` : ""}`}
      </p>
      <ReviewQuote topic="service" className="mt-5 !p-5 shadow-none" />
      <a href={`/medspa/walkthrough/${slug}`} onClick={() => track("preview_offer_cta", { taken })} className={`${primaryBtn} mt-5`}>{taken ? "Join the waitlist" : "Book a 15-min walkthrough"}</a>
    </section>
  );
}
