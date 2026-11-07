"use client";
/**
 * PreviewStart — CP-232/233 · /medspa/app: one search box → progress + contact → the spa's own app.
 *
 * Search goes through our server (/api/preview/places/autocomplete), never to
 * Google from the browser, so the Places key stays private. Picking a result
 * starts the build (/api/preview/start). While it builds (1–2 minutes), the
 * owner fills in name, mobile and email (/api/preview/contact): that submit is
 * the lead and fires the Pixel "Lead" with the same event_id as the server's CAPI
 * call. The preview opens once the build is ready AND the form is in (when
 * PREVIEW.contactRequired). Every error ends on a clear message with a retry,
 * never a blank page.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, MapPin, RotateCcw, Search, Sparkles, WifiOff } from "lucide-react";
import { track } from "@/lib/landing/analytics";
import { PREVIEW } from "@/lib/landing/medspa-funnel";

type Suggestion = { placeId: string; main: string; secondary: string };
type Phase =
  | { kind: "search" }
  | { kind: "building"; name: string; step: number; ready: boolean }
  | { kind: "error"; message: string; offline?: boolean; retry?: Suggestion };

const STEPS = ["Finding your spa…", "Reading your website…", "Pulling your treatments…", "Grabbing your photos…", "Matching your colors and fonts…", "Putting your app together…"];
const STEP_MS = 12_000;
const POLL_MS = 2500;
const GIVE_UP_MS = 200_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function newSession(): string {
  try { return crypto.randomUUID().replace(/-/g, ""); } catch { return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`; }
}

function cookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

/** UTMs and click ids from the ad URL. They go to our server in the POST body only. */
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const digits = (s: string) => s.replace(/\D/g, "");
const field = "h-12 w-full rounded-xl border border-[#0B1B2B]/15 bg-white px-4 text-[16px] text-[#0B1B2B] placeholder:text-[#6B7A8C] focus:border-[#0B5FD6] focus:outline-none focus:ring-2 focus:ring-[#0B5FD6]/25";

export function PreviewStart() {
  const [phase, setPhase] = useState<Phase>({ kind: "search" });
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [contact, setContact] = useState({ name: "", phone: "", email: "", consent: false });
  const [contactState, setContactState] = useState<{ kind: "idle" | "sending" | "done" | "error"; msg?: string }>({ kind: "idle" });
  const session = useRef<string>("");
  const abort = useRef<AbortController | null>(null);
  const attr = useRef<Record<string, string>>({});
  const preview = useRef<{ slug: string; url: string } | null>(null);
  const hp = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    session.current = newSession();
    attr.current = attribution();
  }, []);

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
        setSearchError(navigator.onLine ? "Search is having trouble. Please try again." : "You seem to be offline. Check your connection.");
      } finally {
        if (!ac.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Open the preview once it's built and (when required) the contact form is in.
  const ready = phase.kind === "building" && phase.ready;
  const contactOk = contactState.kind === "done" || !PREVIEW.contactRequired;
  useEffect(() => {
    if (!ready || !contactOk || !preview.current) return;
    track("preview_ready", { contact: contactState.kind === "done" });
    const t = setTimeout(() => window.location.assign(preview.current!.url), 400);
    return () => clearTimeout(t);
  }, [ready, contactOk, contactState.kind]);

  const build = useCallback(async (s: Suggestion) => {
    setSuggestions([]);
    setPhase({ kind: "building", name: s.main, step: 0, ready: false });
    track("preview_search", { selected: true });
    const started = Date.now();
    let stepTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
      setPhase((p) => (p.kind === "building" && !p.ready ? { ...p, step: Math.min(STEPS.length - 1, p.step + 1) } : p));
    }, STEP_MS);
    const stop = () => { if (stepTimer) clearInterval(stepTimer); stepTimer = null; };
    const fail = (message: string, offline = false) => { stop(); track("preview_failed", { reason: message.slice(0, 60) }); setPhase({ kind: "error", message, offline, retry: s }); };

    let res: { slug?: string; status?: string; url?: string; error?: string };
    try {
      const r = await fetch("/api/preview/start", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ place_id: s.placeId, session: session.current, hp: hp.current?.value || undefined, ...attr.current }),
      });
      res = await r.json().catch(() => ({}));
      if (!r.ok || !res.slug || !res.url) {
        return fail(r.status === 429 ? "You've built a few previews already. Please wait a few minutes and try again." : res.error ?? "Something went wrong on our side. Please try again.");
      }
    } catch {
      return fail(navigator.onLine ? "We couldn't reach our server. Please try again." : "You seem to be offline. Check your connection and try again.", !navigator.onLine);
    }
    preview.current = { slug: res.slug, url: res.url };
    session.current = newSession(); // a new search gets a fresh Places session
    track("preview_started", {});

    let status = res.status;
    let misses = 0;
    while (status !== "ready") {
      if (Date.now() - started > GIVE_UP_MS) break; // the status route finishes stale builds; the page shows whatever is there
      await sleep(POLL_MS);
      try {
        const r = await fetch(`/api/preview/status?slug=${encodeURIComponent(res.slug!)}`, { cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as { status?: string };
        if (r.ok && j.status) { status = j.status; misses = 0; }
        else if (++misses > 5) return fail("We hit a snag building your preview. Please try again.");
        if (status === "failed") return fail("We hit a snag building your preview. Please try again.");
        if (status === "expired") break;
      } catch {
        if (++misses > 5) return fail(navigator.onLine ? "We lost the connection while building. Please try again." : "You seem to be offline. Check your connection and try again.", !navigator.onLine);
      }
    }
    stop();
    setPhase((p) => (p.kind === "building" ? { ...p, step: STEPS.length, ready: true } : p));
  }, []);

  async function sendContact(e: React.FormEvent) {
    e.preventDefault();
    const { name, phone, email, consent } = contact;
    const d = digits(phone);
    if (name.trim().length < 2) return setContactState({ kind: "error", msg: "Please enter your name." });
    if (!(d.length === 10 || (d.length === 11 && d.startsWith("1")))) return setContactState({ kind: "error", msg: "Please enter a US mobile number." });
    if (!EMAIL_RE.test(email.trim())) return setContactState({ kind: "error", msg: "Please enter a valid email." });
    if (!consent) return setContactState({ kind: "error", msg: "Please tick the box so we can text you your app." });
    if (!preview.current) return setContactState({ kind: "error", msg: "One moment, we're still starting your build." });
    setContactState({ kind: "sending" });
    try {
      const r = await fetch("/api/preview/contact", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: preview.current.slug, name: name.trim(), phone, email: email.trim(), consent: true, hp: hp.current?.value || undefined }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string; event_id?: string };
      if (!r.ok) return setContactState({ kind: "error", msg: j.error ?? "That didn't go through. Please try again." });
      if (j.event_id) track("preview_contact", { event_id: j.event_id });
      setContactState({ kind: "done" });
    } catch {
      setContactState({ kind: "error", msg: navigator.onLine ? "We couldn't reach our server. Please try again." : "You seem to be offline. Check your connection." });
    }
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % suggestions.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a <= 0 ? suggestions.length - 1 : a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const s = suggestions[active >= 0 ? active : 0]; if (s) build(s); }
    else if (e.key === "Escape") setSuggestions([]);
  };

  return (
    <div className="site min-h-[100dvh] overflow-x-clip">
      <section className="s-ocean relative flex min-h-[100dvh] flex-col">
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent to-[#06318F]/45" />
        <header className="s-wrap relative flex h-[68px] items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/atlas-engine-logo.png" alt="Atlas Engine" width={1315} height={494} className="h-7 w-auto" />
        </header>
        {/* honeypot (shared by both forms) */}
        <input ref={hp} type="text" name="website_url_hp" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

        <div className="s-wrap relative flex flex-1 flex-col items-center justify-center pb-16 pt-6 text-center">
          {phase.kind === "search" && (
            <>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/12 py-1.5 pl-2.5 pr-4 text-[14px] font-semibold text-white ring-1 ring-white/30 backdrop-blur">
                <Sparkles className="h-4 w-4" aria-hidden /> Free · takes about two minutes
              </p>
              <h1 className="s-display mx-auto mt-6 max-w-[15ch] !text-white">See your med spa&apos;s own app.</h1>
              <p className="s-lead mx-auto mt-5 max-w-[34rem] !text-white/85">
                Type your practice&apos;s name. We&apos;ll build a preview of your patient app from your website: your logo, colors, photos, team and treatments.
              </p>

              <div className="relative mx-auto mt-9 w-full max-w-[560px] text-left">
                <label htmlFor="pv-search" className="sr-only">Your med spa&apos;s name</label>
                <div className="flex h-16 items-center gap-3 rounded-full bg-white pl-5 pr-3 shadow-[0_24px_50px_-24px_rgba(6,49,143,.8)] ring-1 ring-white/60 focus-within:ring-4 focus-within:ring-white/50">
                  <Search className="h-5 w-5 shrink-0 text-[#6B7A8C]" aria-hidden />
                  <input
                    id="pv-search"
                    type="text"
                    role="combobox"
                    aria-expanded={suggestions.length > 0}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                    autoComplete="off"
                    autoFocus
                    enterKeyHint="search"
                    placeholder="Your med spa's name"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onKey}
                    className="h-full min-w-0 flex-1 bg-transparent text-[18px] text-[#0B1B2B] placeholder:text-[#6B7A8C] focus:outline-none"
                  />
                  {searching && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#0B5FD6]" aria-label="Searching" />}
                </div>

                {suggestions.length > 0 && (
                  <ul id={listId} role="listbox" className="absolute inset-x-0 top-[72px] z-20 overflow-hidden rounded-3xl bg-white py-2 shadow-[0_30px_60px_-30px_rgba(6,49,143,.7)] ring-1 ring-black/5">
                    {suggestions.map((s, i) => (
                      <li key={s.placeId} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                        <button type="button" onMouseEnter={() => setActive(i)} onClick={() => build(s)}
                          className={`flex w-full items-start gap-3 px-5 py-3 text-left ${i === active ? "bg-[#E6F1FF]" : ""}`}>
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#0B5FD6]" aria-hidden />
                          <span className="min-w-0">
                            <span className="block truncate text-[16px] font-semibold text-[#0B1B2B]">{s.main}</span>
                            <span className="block truncate text-[14px] text-[#6B7A8C]">{s.secondary}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                    <li className="px-5 pb-1 pt-2 text-right text-[11px] text-[#6B7A8C]">Search by Google</li>
                  </ul>
                )}
                {searchError && <p role="alert" className="mt-3 text-center text-[14px] font-medium text-white">{searchError}</p>}
              </div>
              <p className="mt-6 text-[14px] text-white/75">
                Can&apos;t find your practice? <a href="/medspa" className="font-semibold text-white underline underline-offset-4">See how Atlas works instead</a>
              </p>
            </>
          )}

          {phase.kind === "building" && (
            <div className="mx-auto grid w-full max-w-[880px] gap-5 text-left md:grid-cols-[1fr_1.15fr]">
              {/* Contact: the lead, captured while they wait */}
              <div className="s-glass order-1 p-6 !text-[#0B1B2B] sm:p-7 md:order-2">
                {contactState.kind === "done" ? (
                  <div role="status" aria-live="polite">
                    <span className="grid h-10 w-10 place-items-center rounded-full bg-[#0B5FD6] text-white"><Check className="h-5 w-5" aria-hidden /></span>
                    <h2 className="mt-4 text-[22px] font-bold leading-tight tracking-[-0.02em]">Thanks, {contact.name.trim().split(/\s+/)[0]}!</h2>
                    <p className="mt-2 text-[15.5px] text-[#3A4A5C]">
                      {phase.ready ? "Opening your app…" : "Your app opens the moment it's ready. We also emailed you the link so you can open it on your phone."}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={sendContact} noValidate>
                    <h2 className="text-[22px] font-bold leading-tight tracking-[-0.02em]">
                      {phase.ready ? "Your app is ready." : "While we build it…"}
                    </h2>
                    <p className="mt-1.5 text-[15px] text-[#3A4A5C]">Where should we send {phase.name}&apos;s app?</p>
                    <div className="mt-5 space-y-3">
                      <label className="block">
                        <span className="sr-only">Your name</span>
                        <input className={field} autoComplete="name" placeholder="Your name" value={contact.name} onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))} />
                      </label>
                      <label className="block">
                        <span className="sr-only">Mobile number</span>
                        <input className={field} type="tel" inputMode="tel" autoComplete="tel" placeholder="Mobile number" value={contact.phone} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} />
                      </label>
                      <label className="block">
                        <span className="sr-only">Email</span>
                        <input className={field} type="email" inputMode="email" autoComplete="email" placeholder="Email" value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} />
                      </label>
                      <label className="flex items-start gap-3 text-[12.5px] leading-snug text-[#3A4A5C]">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#0B5FD6]" checked={contact.consent} onChange={(e) => setContact((c) => ({ ...c, consent: e.target.checked }))} />
                        <span>Text me my app and follow-ups from Atlas Engine at this number. Msg &amp; data rates may apply. Msg frequency varies. Reply STOP to opt out. Consent isn&apos;t a condition of purchase.</span>
                      </label>
                    </div>
                    {contactState.kind === "error" && <p role="alert" className="mt-3 text-[14px] font-medium text-red-700">{contactState.msg}</p>}
                    <button type="submit" disabled={contactState.kind === "sending"} className="s-btn s-btn-primary s-focus mt-5 w-full disabled:opacity-70">
                      {contactState.kind === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                      {phase.ready ? "Show me my app" : "Send it to me"}
                    </button>
                    {!PREVIEW.contactRequired && (
                      <button type="button" onClick={() => setContactState({ kind: "done" })} className="mt-3 w-full text-center text-[14px] text-[#3A4A5C] underline underline-offset-4">Skip</button>
                    )}
                  </form>
                )}
              </div>

              {/* Progress */}
              <div className="s-glass order-2 p-6 !text-[#0B1B2B] sm:p-7 md:order-1" role="status" aria-live="polite">
                <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#0B5FD6]">{phase.ready ? "Built" : "Building your app"}</p>
                <h2 className="mt-2 text-[22px] font-bold leading-tight tracking-[-0.02em]">{phase.name}</h2>
                <ol className="mt-5 space-y-3">
                  {STEPS.map((label, i) => {
                    const done = i < phase.step;
                    const now = i === phase.step;
                    return (
                      <li key={label} className={`flex items-center gap-3 text-[15.5px] transition-opacity ${i > phase.step ? "opacity-40" : ""}`}>
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${done ? "bg-[#0B5FD6] text-white" : "bg-[#E6F1FF] text-[#0B5FD6]"}`}>
                          {done ? <Check className="h-4 w-4" aria-hidden /> : now ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                        </span>
                        <span className={now ? "font-semibold" : ""}>{label}</span>
                      </li>
                    );
                  })}
                </ol>
                <p className="mt-5 text-[14px] text-[#3A4A5C]">We read your website to make it look like yours. Usually 1–2 minutes.</p>
              </div>
            </div>
          )}

          {phase.kind === "error" && (
            <div className="s-glass mx-auto w-full max-w-[460px] p-8 text-left !text-[#0B1B2B]" role="alert">
              {phase.offline && <WifiOff className="h-6 w-6 text-[#0B5FD6]" aria-hidden />}
              <h2 className="mt-1 text-[22px] font-bold leading-tight tracking-[-0.02em]">That didn&apos;t work</h2>
              <p className="mt-2 text-[16px] text-[#3A4A5C]">{phase.message}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {phase.retry && (
                  <button type="button" onClick={() => build(phase.retry!)} className="s-btn s-btn-primary s-focus">
                    <RotateCcw className="h-4 w-4" aria-hidden /> Try again
                  </button>
                )}
                <button type="button" onClick={() => { setPhase({ kind: "search" }); setQuery(""); }} className="s-btn s-btn-quiet s-focus">Search again</button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
