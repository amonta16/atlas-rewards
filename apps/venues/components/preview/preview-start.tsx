"use client";
/**
 * PreviewStart — CP-232 · /medspa/app: one search box → progress → the spa's own app.
 *
 * Search goes through our server (/api/preview/places/autocomplete), never to
 * Google from the browser, so the Places key stays private. Picking a result
 * starts the build (/api/preview/start), fires the Pixel "Lead" with the same
 * event_id as the server's CAPI call, then polls /api/preview/status until the
 * preview is ready and sends the visitor to med.atlas-engine.app/p/<slug>.
 * Every error ends on a clear message with a retry button, never a blank page.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Loader2, MapPin, RotateCcw, Search, Sparkles, WifiOff } from "lucide-react";
import { track } from "@/lib/landing/analytics";

type Suggestion = { placeId: string; main: string; secondary: string };
type Phase =
  | { kind: "search" }
  | { kind: "building"; name: string; step: number }
  | { kind: "error"; message: string; offline?: boolean; retry?: Suggestion };

const STEPS = ["Finding your spa…", "Reading your website…", "Pulling your treatments…", "Applying your colors…", "Putting your app together…"];
const POLL_MS = 2000;
const GIVE_UP_MS = 110_000;

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

export function PreviewStart() {
  const [phase, setPhase] = useState<Phase>({ kind: "search" });
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const session = useRef<string>("");
  const abort = useRef<AbortController | null>(null);
  const attr = useRef<Record<string, string>>({});
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

  const build = useCallback(async (s: Suggestion) => {
    setSuggestions([]);
    setPhase({ kind: "building", name: s.main, step: 0 });
    track("preview_search", { selected: true });
    const started = Date.now();
    let stepTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
      setPhase((p) => (p.kind === "building" ? { ...p, step: Math.min(STEPS.length - 1, p.step + 1) } : p));
    }, 6000);
    const stop = () => { if (stepTimer) clearInterval(stepTimer); stepTimer = null; };
    const fail = (message: string, offline = false) => { stop(); track("preview_failed", { reason: message.slice(0, 60) }); setPhase({ kind: "error", message, offline, retry: s }); };

    let res: { slug?: string; status?: string; url?: string; event_id?: string; error?: string };
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
    // A new search gets a fresh Places session.
    session.current = newSession();
    if (res.event_id) track("preview_started", { event_id: res.event_id });

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
    setPhase({ kind: "building", name: s.main, step: STEPS.length });
    track("preview_ready", { seconds: Math.round((Date.now() - started) / 1000) });
    await sleep(500);
    window.location.assign(res.url!);
  }, []);

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

        <div className="s-wrap relative flex flex-1 flex-col items-center justify-center pb-16 pt-6 text-center">
          {phase.kind === "search" && (
            <>
              <p className="inline-flex items-center gap-2 rounded-full bg-white/12 py-1.5 pl-2.5 pr-4 text-[14px] font-semibold text-white ring-1 ring-white/30 backdrop-blur">
                <Sparkles className="h-4 w-4" aria-hidden /> Free · takes about a minute
              </p>
              <h1 className="s-display mx-auto mt-6 max-w-[15ch] !text-white">See your med spa&apos;s own app.</h1>
              <p className="s-lead mx-auto mt-5 max-w-[34rem] !text-white/85">
                Type your practice&apos;s name. We&apos;ll build a preview of your patient app with your logo, your colors and your treatments.
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
                {/* honeypot */}
                <input ref={hp} type="text" name="website_url_hp" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />

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
            <div className="s-glass mx-auto w-full max-w-[460px] p-8 text-left !text-[#0B1B2B]" role="status" aria-live="polite">
              <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#0B5FD6]">Building your app</p>
              <h2 className="mt-2 text-[24px] font-bold leading-tight tracking-[-0.02em]">{phase.name}</h2>
              <ol className="mt-6 space-y-3.5">
                {STEPS.map((label, i) => {
                  const done = i < phase.step;
                  const now = i === phase.step;
                  return (
                    <li key={label} className={`flex items-center gap-3 text-[16px] transition-opacity ${i > phase.step ? "opacity-40" : ""}`}>
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${done ? "bg-[#0B5FD6] text-white" : "bg-[#E6F1FF] text-[#0B5FD6]"}`}>
                        {done ? <Check className="h-4 w-4" aria-hidden /> : now ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                      </span>
                      <span className={now ? "font-semibold" : ""}>{label}</span>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-6 text-[14px] text-[#3A4A5C]">Usually under a minute. Keep this page open.</p>
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
