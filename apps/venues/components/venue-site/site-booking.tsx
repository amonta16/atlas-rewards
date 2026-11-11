"use client";
/**
 * Website booking — the app's booking flow, on the web.
 *
 * Same order the Flippo's app uses (components/customer/resource-booking.tsx):
 *   1. Photo-first cards, grouped by section chips (Cages · Pool · Parties)
 *   2. Package (party room only)
 *   3. Length chips → 14-day strip → start-time grid with "N left"
 *   4. Party size + name / mobile → Book
 *   5. Done → add to calendar, get the app
 *
 * Availability comes from the same booking_resource_slots RPC the app calls,
 * and the booking goes through /api/[business]/site-book into the same
 * bookings table. One system, two front doors.
 *
 * Any button on the page can open the sheet: <BookButton category="Parties" pkg="All Star" />
 * fires a "vs:book" event this component listens for.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { SiteLiveRow } from "@/lib/venue-site/live";
import { ArrowLeft, Check, ChevronRight, Clock, CalendarPlus, Loader2, Minus, Phone, Plus, Users, X, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { optimizedUrl } from "@/lib/img";
import { durationLabel, isoDay, timeLabel, type BookingSlot } from "@/lib/booking";
import { cn } from "@/lib/utils";

export type SitePkg = { name: string; price: number | null; blurb: string | null; includes: string[]; duration: number | null; popular?: boolean };
export type SiteResource = {
  id: string; name: string; description: string | null; image_url: string | null; emoji: string | null;
  category: string; units: number; unit_label: string; durations: number[]; max_party: number;
  horizon_days: number; packages: SitePkg[];
  /** Pitch speed (batting cages). null → no speed badge. */
  mph: number | null;
};
export type SiteMember = { name: string | null; phone: string | null; email: string | null } | null;

type OpenDetail = { category?: string; resourceId?: string; pkg?: string };
type Step = "pick" | "package" | "time" | "details" | "done";

export function openBooking(detail: OpenDetail = {}) {
  window.dispatchEvent(new CustomEvent<OpenDetail>("vs:book", { detail }));
}

export function BookButton({ category, pkg, resourceId, className, children, ariaLabel }: OpenDetail & { className?: string; children: React.ReactNode; ariaLabel?: string }) {
  return (
    <button type="button" aria-label={ariaLabel} className={className} onClick={() => openBooking({ category, pkg, resourceId })}>
      {children}
    </button>
  );
}

/* ── Speed badge ───────────────────────────────────────────────────── */

const SPEED_MAX = 60;
function speedColor(mph: number) {
  return mph >= 50 ? "#e8344a" : mph >= 40 ? "#f97316" : mph >= 32 ? "#eab308" : "#16a34a";
}

/** Little speedometer: the needle and the colored arc sweep with the speed, motion streaks on the left. */
export function SpeedGauge({ mph, className = "h-5 w-8" }: { mph: number; className?: string }) {
  const gid = useId().replace(/:/g, "");
  const pct = Math.max(4, Math.min(100, (mph / SPEED_MAX) * 100));
  const angle = -90 + (180 * pct) / 100;
  return (
    <svg viewBox="0 0 32 20" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`g${gid}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#22c55e" /><stop offset=".55" stopColor="#facc15" /><stop offset="1" stopColor="#ef4444" />
        </linearGradient>
      </defs>
      <path d="M4 18 A12 12 0 0 1 28 18" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M4 18 A12 12 0 0 1 28 18" fill="none" stroke={`url(#g${gid})`} strokeWidth="3.5" strokeLinecap="round" pathLength={100} strokeDasharray={`${pct} 100`} />
      <line x1="16" y1="18" x2="16" y2="8.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" transform={`rotate(${angle} 16 18)`} />
      <circle cx="16" cy="18" r="2.2" fill="currentColor" />
    </svg>
  );
}

/** "≡◔ 45 MPH" pill for a cage card. */
export function SpeedBadge({ mph, size = "md" }: { mph: number; size?: "sm" | "md" }) {
  const sm = size === "sm";
  return (
    <span className={cn("inline-flex items-center rounded-full bg-white/95 text-[var(--vs-ink)] shadow-[0_6px_18px_-6px_rgba(0,0,0,.55)] ring-1 ring-black/5",
      sm ? "h-8 gap-1 pl-1.5 pr-2.5" : "h-10 gap-1.5 pl-2 pr-3")}>
      <svg viewBox="0 0 10 12" className={cn("-mr-0.5", sm ? "h-3 w-2.5" : "h-3.5 w-3")} aria-hidden="true">
        <path d="M1 3h7M0 6h9M2 9h6" stroke={speedColor(mph)} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <SpeedGauge mph={mph} className={sm ? "h-4 w-6" : "h-5 w-8"} />
      <span className={cn("font-display font-extrabold tabular-nums leading-none", sm ? "text-[16px]" : "text-[20px]")} style={{ color: speedColor(mph) }}>{mph}</span>
      <span className={cn("font-black uppercase leading-none tracking-wide", sm ? "text-[9px]" : "text-[10px]")}>mph</span>
    </span>
  );
}

/* ── Live "in use right now" (same as the app's Book tab, CP-157) ───── */

type LiveMap = Record<string, SiteLiveRow>;
const toMap = (rows: SiteLiveRow[]) => Object.fromEntries(rows.map(r => [r.resource_id, r])) as LiveMap;

// One small store for the page: the poller writes, every card/badge reads.
let liveMap: LiveMap | null = null;
const liveSubs = new Set<() => void>();
function setLive(m: LiveMap) { liveMap = m; liveSubs.forEach(f => f()); }
function subscribeLive(f: () => void) { liveSubs.add(f); return () => { liveSubs.delete(f); }; }

/** Server rows on first paint (and during hydration), then whatever the poller last fetched. */
export function useLive(initial: SiteLiveRow[]): LiveMap {
  const initialMap = useMemo(() => toMap(initial), [initial]);
  return useSyncExternalStore(subscribeLive, () => liveMap ?? initialMap, () => initialMap);
}

/** Refreshes every minute while the page is visible, and right away when it comes back into view. */
function LivePoller({ slug }: { slug: string }) {
  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch(`/api/${slug}/site-live`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json() as { rows?: SiteLiveRow[] };
        if (!stop && Array.isArray(j.rows)) setLive(toMap(j.rows));
      } catch { /* offline: keep the last known state */ }
    };
    const t = setInterval(load, 60_000);
    document.addEventListener("visibilitychange", load);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", load); };
  }, [slug]);
  return null;
}

type LiveTone = "full" | "busy" | "open" | "unknown";
function liveTone(row?: SiteLiveRow | null): LiveTone {
  if (!row) return "unknown";
  if (row.busy_now >= row.units) return "full";
  if (row.busy_now > 0) return "busy";
  return "open";
}

/** "● Booked · free 4:30 PM" (red) or "● 1 of 2 in use" (amber). Nothing when it's free. */
export function LivePill({ row, size = "md" }: { row?: SiteLiveRow | null; size?: "sm" | "md" }) {
  const tone = liveTone(row);
  if (tone === "unknown" || tone === "open") return null;
  const free = row?.next_free_at ? new Date(row.next_free_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full font-black uppercase tracking-wide shadow-[0_6px_18px_-6px_rgba(0,0,0,.55)]",
      size === "sm" ? "h-7 px-2.5 text-[10px]" : "h-8 px-3 text-[11px]",
      tone === "full" ? "bg-red-600 text-white" : "bg-amber-400 text-zinc-900")}>
      <span className={cn("h-2 w-2 rounded-full", tone === "full" ? "animate-pulse bg-white" : "bg-zinc-900/70")} />
      {tone === "full" ? (free ? `Booked · free ${free}` : "Booked now") : `${row!.busy_now} of ${row!.units} in use`}
    </span>
  );
}

/** Hero quick-book row: "2 of 6 in use right now", or nothing when they're all free. */
export function LiveSectionNote({ ids, initial }: { ids: string[]; initial: SiteLiveRow[] }) {
  const live = useLive(initial);
  const rows = ids.map(id => live[id]).filter(Boolean);
  const units = rows.reduce((n, r) => n + r.units, 0);
  const busy = rows.reduce((n, r) => n + Math.min(r.busy_now, r.units), 0);
  if (!busy) return null;
  return (
    <span className={cn("ml-1.5 inline-flex items-center gap-1 rounded-full px-1.5 text-[11px] font-black", busy >= units ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800")}>
      <span className={cn("h-1.5 w-1.5 rounded-full", busy >= units ? "bg-red-600" : "bg-amber-500")} />
      {busy >= units ? "all in use" : `${busy} in use`}
    </span>
  );
}

const isSpeedOnly = (d: string | null) => !!d && /^\s*\d+\s*mph\s*$/i.test(d);

function groupBy(resources: SiteResource[]) {
  const out: { category: string; items: SiteResource[] }[] = [];
  for (const r of resources) {
    let g = out.find(x => x.category === r.category);
    if (!g) { g = { category: r.category, items: [] }; out.push(g); }
    g.items.push(r);
  }
  return out;
}

function nextDays(n: number): Date[] {
  const base = new Date(); base.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + i));
}

const fmtPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
};

/* ── The cards on the page ─────────────────────────────────────────── */

export function BookingSection({ slug, businessName, resources, phone, member, visitPoints, storeLinks, initialLive }: {
  slug: string; businessName: string; resources: SiteResource[]; phone: string; member: SiteMember; visitPoints: number;
  storeLinks: { ios: string; android: string; joinCode: string };
  /** booking_resources_now at render time; the poller keeps it fresh. */
  initialLive: SiteLiveRow[];
}) {
  const live = useLive(initialLive);
  const groups = useMemo(() => groupBy(resources), [resources]);
  const [tab, setTab] = useState(0);
  const g = groups[Math.min(tab, groups.length - 1)];

  if (resources.length === 0) {
    return (
      <div className="rounded-[28px] bg-white p-8 text-center shadow-sm ring-1 ring-[var(--vs-line)]">
        <p className="text-lg font-bold">Online booking is taking a quick break.</p>
        <a href={`tel:${phone}`} className="mt-3 inline-flex items-center gap-2 font-bold text-[var(--vs-blue)]"><Phone className="h-4 w-4" /> Call {fmtPhone(phone)}</a>
      </div>
    );
  }

  return (
    <>
      {groups.length > 1 && (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" style={{ scrollbarWidth: "none" }}>
          <div role="tablist" aria-label="What do you want to book?" className="flex w-max gap-2 pb-1">
            {groups.map((x, i) => {
              const on = x === g;
              const cover = x.items.find(r => r.image_url)?.image_url;
              return (
                <button key={x.category} role="tab" aria-selected={on} type="button" onClick={() => setTab(i)}
                  className={cn("inline-flex h-12 shrink-0 items-center gap-2.5 rounded-full pl-1.5 pr-4 text-[15px] font-extrabold transition active:scale-[0.98]",
                    on ? "bg-[var(--vs-blue)] text-white shadow-[0_10px_24px_-12px_var(--vs-blue)]" : "bg-white text-[var(--vs-ink)] ring-1 ring-[var(--vs-line)] hover:ring-[var(--vs-blue)]/40")}>
                  {cover
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={optimizedUrl(cover, 120)} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white/80" />
                    : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--vs-sky-soft)]">{x.items[0]?.emoji ?? "📅"}</span>}
                  {x.category}
                  <span className={cn("rounded-full px-1.5 text-[11px] font-black", on ? "bg-white/25" : "bg-[var(--vs-sky-soft)] text-[var(--vs-ink)]/60")}>{x.items.length}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Phones: a swipe row (next card peeks), so six cages don't mean six screens of scrolling. */}
      <div role="tabpanel" className="-mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:mt-5 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3" style={{ scrollbarWidth: "none" }}>
        {g.items.map(r => (
          <button key={r.id} type="button" onClick={() => openBooking({ resourceId: r.id })}
            className={cn("group shrink-0 snap-start overflow-hidden rounded-[26px] bg-white text-left shadow-[0_14px_40px_-24px_rgba(11,37,64,0.45)] ring-1 ring-[var(--vs-line)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_50px_-24px_rgba(11,37,64,0.55)] active:scale-[0.99]",
              g.items.length > 1 ? "w-[84%] sm:w-auto" : "w-full")}>
            <div className="relative aspect-[16/10] bg-[var(--vs-sky-soft)]">
              {r.image_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={optimizedUrl(r.image_url, 800)} alt={r.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                : <span className="absolute inset-0 flex items-center justify-center text-5xl">{r.emoji ?? "📅"}</span>}
              <div className={cn("absolute inset-x-0 bottom-0 h-[85%] bg-gradient-to-t to-transparent", liveTone(live[r.id]) === "full" ? "from-red-800/95 via-red-700/55" : "from-black/90 via-black/50")} />
              <span className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
                {r.mph && <SpeedBadge mph={r.mph} />}
                <LivePill row={live[r.id]} />
              </span>
              <div className="absolute bottom-3 left-4 right-14 text-white [text-shadow:0_2px_12px_rgba(0,0,0,.7)]">
                <div className="font-display text-[23px] font-extrabold leading-[1.05] tracking-tight">{r.name}</div>
                <div className="mt-0.5 text-[13px] font-bold text-white/95">
                  {r.durations.map(durationLabel).join(" · ")} · up to {r.max_party}
                </div>
              </div>
              <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-[var(--vs-blue)] shadow transition group-hover:translate-x-0.5">
                <ChevronRight className="h-5 w-5" />
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="line-clamp-1 text-[13px] text-[var(--vs-ink)]/70">{(!isSpeedOnly(r.description) && r.description) || (r.packages.length ? `${r.packages.length} packages to pick from` : "Pick a day and a time")}</span>
              <span className="shrink-0 text-[13px] font-extrabold text-[var(--vs-blue)]">Book</span>
            </div>
          </button>
        ))}
      </div>

      <BookingSheet slug={slug} businessName={businessName} resources={resources} phone={phone} member={member} visitPoints={visitPoints} storeLinks={storeLinks} live={live} />
      <LivePoller slug={slug} />
    </>
  );
}

/* ── The sheet ─────────────────────────────────────────────────────── */

function BookingSheet({ slug, businessName, resources, phone, member, visitPoints, storeLinks, live }: {
  slug: string; businessName: string; resources: SiteResource[]; phone: string; member: SiteMember; visitPoints: number;
  storeLinks: { ios: string; android: string; joinCode: string }; live: LiveMap;
}) {
  const groups = useMemo(() => groupBy(resources), [resources]);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [section, setSection] = useState(0);
  const [resource, setResource] = useState<SiteResource | null>(null);
  const [pkg, setPkg] = useState<SitePkg | null>(null);
  const [duration, setDuration] = useState(60);
  const [day, setDay] = useState(() => isoDay(new Date()));
  const [slots, setSlots] = useState<BookingSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [picked, setPicked] = useState<BookingSlot | null>(null);
  const [party, setParty] = useState(2);
  const [name, setName] = useState(member?.name ?? "");
  const [tel, setTel] = useState(member?.phone ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [notes, setNotes] = useState("");
  const [hp, setHp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [attached, setAttached] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const start = useCallback((r: SiteResource, pkgName?: string) => {
    setResource(r);
    setPicked(null); setErr(null);
    const p = pkgName ? r.packages.find(x => x.name.toLowerCase() === pkgName.toLowerCase()) ?? null : null;
    setPkg(p);
    setDuration(p?.duration ?? r.durations[0]);
    setParty(Math.min(p ? 8 : 2, r.max_party));
    setStep(r.packages.length > 0 && !p ? "package" : "time");
  }, []);

  // Open from anywhere on the page.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenDetail>).detail ?? {};
      setErr(null);
      const r = d.resourceId ? resources.find(x => x.id === d.resourceId)
        : d.category ? (resources.filter(x => x.category === d.category).length === 1 || d.pkg ? resources.find(x => x.category === d.category) : undefined)
        : undefined;
      if (r) start(r, d.pkg);
      else {
        const gi = d.category ? groups.findIndex(x => x.category === d.category) : -1;
        setSection(gi >= 0 ? gi : 0);
        setResource(null); setPkg(null); setStep("pick");
      }
      setOpen(true);
    };
    window.addEventListener("vs:book", onOpen);
    return () => window.removeEventListener("vs:book", onOpen);
  }, [resources, groups, start]);

  // Escape, scroll lock, focus.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => closeRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [open]);

  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [step]);

  const days = useMemo(() => nextDays(Math.min(14, (resource?.horizon_days ?? 14) + 1)), [resource?.horizon_days]);

  // Live availability — the same RPC the app's Book tab calls.
  useEffect(() => {
    if (!open || step !== "time" || !resource) return;
    let cancelled = false;
    setLoadingSlots(true); setSlots([]); setPicked(null); setErr(null);
    createClient().rpc("booking_resource_slots", { p_resource_id: resource.id, p_day: day, p_duration: duration })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setErr("Couldn't load times. Pull to refresh or try another day.");
        setSlots(((data ?? []) as BookingSlot[]));
        setLoadingSlots(false);
      });
    return () => { cancelled = true; };
  }, [open, step, resource, day, duration]);

  async function book() {
    if (!resource || !picked) return;
    if (name.trim().length < 2) { setErr("Add your name so we know who's coming."); return; }
    if (tel.replace(/\D/g, "").length < 10) { setErr("Add a mobile number so we can confirm."); return; }
    setSubmitting(true); setErr(null);
    try {
      const r = await fetch(`/api/${slug}/site-book`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resource_id: resource.id, starts_at: picked.slot_start, duration, party, name, phone: tel, email, notes, package: pkg?.name ?? "", company_hp: hp }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Something went wrong. Please try again."); if (r.status === 409) setPicked(null); return; }
      setAttached(!!j.member);
      setStep("done");
    } catch {
      setErr("No connection. Check your internet and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function back() {
    setErr(null);
    if (step === "details") setStep("time");
    else if (step === "time" && resource && resource.packages.length > 0) setStep("package");
    else setStep("pick");
  }

  function reset() {
    setStep("pick"); setResource(null); setPkg(null); setPicked(null); setNotes(""); setErr(null);
  }

  function icsHref(): string {
    if (!resource || !picked) return "#";
    const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const body = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Atlas Engine//Venue site//EN", "BEGIN:VEVENT",
      `UID:${picked.slot_start}-${resource.id}@atlas-engine.app`, `DTSTAMP:${f(new Date().toISOString())}`,
      `DTSTART:${f(picked.slot_start)}`, `DTEND:${f(picked.slot_end)}`,
      `SUMMARY:${resource.name} at ${businessName.trim()}`,
      `DESCRIPTION:Party of ${party}. Requested online - ${businessName.trim()} will confirm.`,
      "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(body)}`;
  }

  if (!open) return null;
  const g = groups[Math.min(section, groups.length - 1)];
  const title = step === "pick" ? "Book a spot" : step === "package" ? "Pick a package" : step === "time" ? (resource?.name ?? "") : step === "details" ? "Almost done" : "You're booked!";
  const sub = step === "pick" ? "Reserve your time before you come in."
    : step === "package" ? `${resource?.name} · choose what's included`
    : step === "time" ? (pkg ? `${pkg.name} · pick a day and a start time` : resource?.mph ? `${resource.mph} MPH · pick a day and a start time` : "Pick a length, a day and a start time")
    : step === "details" ? "Who's coming? We'll text to confirm."
    : "Request sent. See you soon!";

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="vs-book-title">
      <button type="button" aria-label="Close booking" tabIndex={-1} onClick={() => setOpen(false)} className="absolute inset-0 h-full w-full cursor-default bg-[rgba(6,22,40,0.55)] backdrop-blur-[2px] vs-fade-in" />
      <div className="vs-sheet absolute inset-x-0 bottom-0 flex max-h-[94dvh] flex-col overflow-hidden rounded-t-[28px] bg-[var(--vs-paper)] shadow-2xl md:inset-auto md:left-1/2 md:top-1/2 md:max-h-[88vh] md:w-[600px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[28px]">
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-[var(--vs-ink)]/15 md:hidden" />
        {/* header */}
        <div className="flex shrink-0 items-center gap-3 px-5 pb-3 pt-3 md:pt-5">
          {step !== "pick" && step !== "done" ? (
            <button type="button" onClick={back} aria-label="Back" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-[var(--vs-line)] hover:bg-[var(--vs-sky-soft)]"><ArrowLeft className="h-5 w-5" /></button>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id="vs-book-title" className="font-display truncate text-[22px] font-extrabold leading-tight">{title}</h2>
            <p className="truncate text-[13px] text-[var(--vs-ink)]/60">{sub}</p>
          </div>
          <button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-[var(--vs-line)] hover:bg-[var(--vs-sky-soft)]"><X className="h-5 w-5" /></button>
        </div>

        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
          {/* STEP — pick */}
          {step === "pick" && (
            <div className="space-y-3">
              {groups.length > 1 && (
                <div className="-mx-5 overflow-x-auto px-5" style={{ scrollbarWidth: "none" }}>
                  <div className="flex w-max gap-2 pb-1">
                    {groups.map((x, i) => {
                      const on = x === g;
                      return (
                        <button key={x.category} type="button" onClick={() => setSection(i)}
                          className={cn("h-10 shrink-0 rounded-full px-4 text-[14px] font-extrabold transition", on ? "bg-[var(--vs-blue)] text-white" : "bg-white ring-1 ring-[var(--vs-line)]")}>
                          {x.category} <span className="opacity-60">{x.items.length}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {g.items.map(r => (
                <button key={r.id} type="button" onClick={() => start(r)}
                  className="w-full overflow-hidden rounded-3xl bg-white text-left shadow-sm ring-1 ring-[var(--vs-line)] transition active:scale-[0.99]">
                  <div className="relative aspect-[2/1] bg-[var(--vs-sky-soft)] sm:aspect-[2.6/1]">
                    {r.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={optimizedUrl(r.image_url, 700)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    )}
                    <div className={cn("absolute inset-x-0 bottom-0 h-[85%] bg-gradient-to-t to-transparent", liveTone(live[r.id]) === "full" ? "from-red-800/95 via-red-700/55" : "from-black/90 via-black/50")} />
                    <span className="absolute left-3 top-3 flex flex-col items-start gap-1">
                      {r.mph && <SpeedBadge mph={r.mph} size="sm" />}
                      <LivePill row={live[r.id]} size="sm" />
                    </span>
                    <div className="absolute bottom-2.5 left-4 right-12 text-white [text-shadow:0_2px_12px_rgba(0,0,0,.7)]">
                      <div className="font-display text-[20px] font-extrabold leading-tight">{r.name}</div>
                      <div className="text-[12px] font-bold text-white/95">{r.durations.map(durationLabel).join(" · ")} · up to {r.max_party}</div>
                    </div>
                    <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[var(--vs-blue)]"><ChevronRight className="h-4 w-4" /></span>
                  </div>
                </button>
              ))}
              <a href={`tel:${phone}`} className="mt-2 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-[var(--vs-line)]">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--vs-blue)] text-white"><Phone className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold leading-tight">Team practice, school or a big group?</span>
                  <span className="block text-[15px] font-black tabular-nums text-[var(--vs-blue)]">{fmtPhone(phone)}</span>
                </span>
                <span className="text-[11px] font-bold text-[var(--vs-ink)]/50">Tap to call</span>
              </a>
            </div>
          )}

          {/* STEP — package */}
          {step === "package" && resource && (
            <div className="space-y-3">
              {resource.packages.map(p => (
                <div key={p.name} className={cn("rounded-3xl bg-white p-4 ring-1", p.popular ? "ring-2 ring-[var(--vs-blue)]" : "ring-[var(--vs-line)]")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-[19px] font-extrabold leading-tight">{p.name}</span>
                        {p.popular && <span className="rounded-full bg-[var(--vs-sun)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide">Most popular</span>}
                      </div>
                      {p.blurb && <p className="mt-1 text-[13px] leading-snug text-[var(--vs-ink)]/70">{p.blurb}</p>}
                    </div>
                    {p.price != null && <div className="font-display shrink-0 text-2xl font-extrabold tabular-nums text-[var(--vs-blue)]">${p.price}</div>}
                  </div>
                  {p.includes.length > 0 && (
                    <ul className="mt-3 grid gap-1">
                      {p.includes.map(line => (
                        <li key={line} className="flex items-start gap-2 text-[13px]"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--vs-blue)]" />{line}</li>
                      ))}
                    </ul>
                  )}
                  <button type="button" onClick={() => { setPkg(p); if (p.duration) setDuration(p.duration); setParty(Math.min(Math.max(party, 8), resource.max_party)); setStep("time"); }}
                    className="mt-3 h-11 w-full rounded-2xl bg-[var(--vs-blue)] text-[14px] font-extrabold text-white active:scale-[0.99]">
                    Choose {p.name}
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => { setPkg(null); setStep("time"); }} className="w-full py-2 text-[13px] font-semibold text-[var(--vs-ink)]/55 hover:text-[var(--vs-ink)]">
                Just book the room, no package
              </button>
            </div>
          )}

          {/* STEP — time */}
          {step === "time" && resource && (
            <div className="space-y-5">
              {resource.durations.length > 1 && !pkg?.duration && (
                <div>
                  <Label>How long</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {resource.durations.map(d => (
                      <button key={d} type="button" onClick={() => setDuration(d)}
                        className={cn("h-11 rounded-full px-4 text-[14px] font-bold transition", duration === d ? "bg-[var(--vs-blue)] text-white" : "bg-white ring-1 ring-[var(--vs-line)]")}>
                        {durationLabel(d)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label>Day</Label>
                <div className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: "none" }}>
                  {days.map(d => {
                    const id = isoDay(d);
                    const on = id === day;
                    return (
                      <button key={id} type="button" onClick={() => setDay(id)} aria-pressed={on}
                        className={cn("w-[64px] shrink-0 rounded-2xl py-2 text-center transition", on ? "bg-[var(--vs-blue)] text-white shadow-[0_10px_20px_-12px_var(--vs-blue)]" : "bg-white ring-1 ring-[var(--vs-line)]")}>
                        <div className="text-[10px] font-bold uppercase opacity-75">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                        <div className="font-display text-xl font-extrabold leading-tight">{d.getDate()}</div>
                        <div className="text-[10px] opacity-75">{d.toLocaleDateString(undefined, { month: "short" })}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>Start time</Label>
                {loadingSlots ? (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-[52px] animate-pulse rounded-xl bg-white ring-1 ring-[var(--vs-line)]" />)}
                  </div>
                ) : slots.filter(s => s.units_left > 0).length === 0 ? (
                  <div className="mt-2 rounded-2xl bg-white p-5 text-center text-[14px] text-[var(--vs-ink)]/60 ring-1 ring-[var(--vs-line)]">
                    {day === isoDay(new Date()) ? "Nothing left today." : "Nothing open this day."}
                    {(() => {
                      const next = days[days.findIndex(d => isoDay(d) === day) + 1];
                      return next ? (
                        <button type="button" onClick={() => setDay(isoDay(next))} className="mx-auto mt-3 flex h-10 items-center gap-1.5 rounded-full bg-[var(--vs-sky-soft)] px-4 text-[14px] font-extrabold text-[var(--vs-blue)]">
                          See {next.toLocaleDateString(undefined, { weekday: "long" })} <ChevronRight className="h-4 w-4" />
                        </button>
                      ) : null;
                    })()}
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map(s => {
                      const full = s.units_left <= 0;
                      const on = picked?.slot_start === s.slot_start;
                      return (
                        <button key={s.slot_start} type="button" disabled={full} onClick={() => setPicked(s)} aria-pressed={on}
                          className={cn("rounded-xl py-2.5 text-center transition",
                            full ? "bg-[var(--vs-ink)]/5 text-[var(--vs-ink)]/30 line-through" : on ? "bg-[var(--vs-blue)] text-white" : "bg-white ring-1 ring-[var(--vs-line)] hover:ring-[var(--vs-blue)]/50")}>
                          <div className="text-[14px] font-bold">{timeLabel(s.slot_start)}</div>
                          {!full && resource.units > 1 && (
                            <div className={cn("text-[10px] font-semibold", on ? "opacity-90" : "text-emerald-700")}>{s.units_left} {resource.unit_label}{s.units_left === 1 ? "" : "s"} left</div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {err && <p className="text-[13px] font-semibold text-rose-600">{err}</p>}
            </div>
          )}

          {/* STEP — details */}
          {step === "details" && resource && picked && (
            <div className="space-y-4">
              <Summary resource={resource} picked={picked} duration={duration} pkg={pkg} />
              <div className="space-y-4 rounded-3xl bg-white p-4 ring-1 ring-[var(--vs-line)]">
                <div>
                  <Label>Party size</Label>
                  <div className="mt-2 flex items-center gap-3">
                    <button type="button" aria-label="Fewer people" onClick={() => setParty(p => Math.max(1, p - 1))} className="flex h-11 w-11 items-center justify-center rounded-full ring-1 ring-[var(--vs-line)] hover:bg-[var(--vs-sky-soft)]"><Minus className="h-4 w-4" /></button>
                    <div className="flex-1 text-center">
                      <div className="font-display text-2xl font-extrabold tabular-nums">{party}</div>
                      <div className="text-[10px] font-semibold uppercase text-[var(--vs-ink)]/50">up to {resource.max_party}{pkg ? " · more welcome, ask us" : ""}</div>
                    </div>
                    <button type="button" aria-label="More people" onClick={() => setParty(p => Math.min(resource.max_party, p + 1))} className="flex h-11 w-11 items-center justify-center rounded-full ring-1 ring-[var(--vs-line)] hover:bg-[var(--vs-sky-soft)]"><Plus className="h-4 w-4" /></button>
                  </div>
                </div>
                <Field label="Your name" value={name} onChange={setName} autoComplete="name" placeholder="First and last" />
                <Field label="Mobile" value={tel} onChange={setTel} autoComplete="tel" inputMode="tel" type="tel" placeholder="(805) 555-0123" />
                <Field label="Email (optional)" value={email} onChange={setEmail} autoComplete="email" inputMode="email" type="email" placeholder="you@email.com" />
                <Field label="Anything we should know?" value={notes} onChange={setNotes} placeholder="Birthday, left-handed bats, wheelchair access…" />
                <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={hp} onChange={e => setHp(e.target.value)} name="company" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
              </div>
              {member && (
                <p className="flex items-center gap-2 rounded-2xl bg-[var(--vs-sky-soft)] px-3 py-2.5 text-[12px] font-semibold text-[var(--vs-ink)]/80">
                  <Check className="h-4 w-4 shrink-0 text-[var(--vs-blue)]" /> You&apos;re signed in, so this booking will also show in your app.
                </p>
              )}
              <p className="rounded-2xl bg-amber-50 px-3 py-2.5 text-[12px] leading-snug text-amber-900 ring-1 ring-amber-200">
                Pay at the counter when you arrive. {businessName.trim()} will confirm your request by text.
              </p>
              {err && <p className="text-[13px] font-semibold text-rose-600">{err}</p>}
            </div>
          )}

          {/* STEP — done */}
          {step === "done" && resource && picked && (
            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-6 text-center ring-1 ring-[var(--vs-line)]">
                <div className="vs-pop mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--vs-blue)] text-white"><Check className="h-8 w-8" /></div>
                <div className="font-display mt-3 text-xl font-extrabold">Request sent</div>
                <p className="mt-1 text-[14px] text-[var(--vs-ink)]/65">We&apos;ll text {fmtPhone(tel)} to confirm.{attached ? " It's in your app under Your bookings too." : ""}</p>
              </div>
              <Summary resource={resource} picked={picked} duration={duration} pkg={pkg} party={party} />
              <a href={icsHref()} download="flippos-booking.ics" className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[14px] font-extrabold ring-1 ring-[var(--vs-line)] hover:bg-[var(--vs-sky-soft)]">
                <CalendarPlus className="h-4 w-4" /> Add to calendar
              </a>
              {!attached && (
                <div className="overflow-hidden rounded-3xl bg-[var(--vs-ink)] p-5 text-white">
                  <div className="font-display text-[19px] font-extrabold leading-tight">Track it in the app, earn {visitPoints} points every visit</div>
                  <p className="mt-1 text-[13px] text-white/70">Same bookings, plus rewards, prize spins and free pizza. After you install, join with code <b className="tracking-wider text-white">{storeLinks.joinCode}</b>.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={storeLinks.ios} target="_blank" rel="noopener" className="rounded-xl bg-white px-3.5 py-2 text-[13px] font-extrabold text-[var(--vs-ink)]">App Store</a>
                    <a href={storeLinks.android} target="_blank" rel="noopener" className="rounded-xl bg-white px-3.5 py-2 text-[13px] font-extrabold text-[var(--vs-ink)]">Google Play</a>
                  </div>
                </div>
              )}
              <button type="button" onClick={reset} className="w-full py-2 text-[13px] font-bold text-[var(--vs-blue)]">Book something else</button>
            </div>
          )}
        </div>

        {/* sticky action */}
        {(step === "time" || step === "details") && (
          <div className="shrink-0 border-t border-[var(--vs-line)] bg-white/90 px-5 py-3 backdrop-blur pb-[max(12px,env(safe-area-inset-bottom))]">
            {step === "time" ? (
              <button type="button" disabled={!picked} onClick={() => { setErr(null); setStep("details"); }}
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--vs-blue)] text-[16px] font-extrabold text-white transition disabled:opacity-40 active:scale-[0.99]">
                {picked ? <>Continue · {timeLabel(picked.slot_start)}</> : "Pick a start time"}
              </button>
            ) : (
              <button type="button" disabled={submitting} onClick={book}
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--vs-red)] text-[16px] font-extrabold text-white transition disabled:opacity-60 active:scale-[0.99]">
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Holding your spot…</> : <>Book it <Check className="h-5 w-5" /></>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ resource, picked, duration, pkg, party }: { resource: SiteResource; picked: BookingSlot; duration: number; pkg: SitePkg | null; party?: number }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-[var(--vs-blue)] p-5 text-white">
      {resource.image_url && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={optimizedUrl(resource.image_url, 700)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/20" />
        </>
      )}
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[12px] font-black uppercase tracking-widest">{resource.name}{pkg ? ` · ${pkg.name}` : ""}</div>
          {resource.mph && <SpeedBadge mph={resource.mph} size="sm" />}
        </div>
        <div className="font-display mt-1 text-2xl font-extrabold">{new Date(picked.slot_start).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold opacity-95">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{timeLabel(picked.slot_start)} – {timeLabel(picked.slot_end)}</span>
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{durationLabel(duration)}</span>
          {party ? <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{party}</span> : null}
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-extrabold uppercase tracking-widest text-[var(--vs-ink)]/50">{children}</div>;
}

function Field({ label, value, onChange, ...rest }: { label: string; value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input {...rest} value={value} onChange={e => onChange(e.target.value)} maxLength={200}
        className="mt-1.5 h-12 w-full rounded-xl bg-[var(--vs-paper)] px-3.5 text-[16px] outline-none ring-1 ring-[var(--vs-line)] transition placeholder:text-[var(--vs-ink)]/35 focus:bg-white focus:ring-2 focus:ring-[var(--vs-blue)]" />
    </label>
  );
}
