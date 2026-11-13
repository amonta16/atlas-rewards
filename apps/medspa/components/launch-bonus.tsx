"use client";
/**
 * CP-245 · the launch bonus on /p/<slug> (LAUNCH_BONUS.hours, 72 since CP-245.5).
 *
 *   PreviewTopBar  the sticky top bar: "3 launch bonuses end in 03:59:12 →"
 *   BonusTiles     right under the phone, small: three pictures with a shine (a real app video,
 *                  THEIR roll-up banner with their logo and a QR to their app, the audit), title, FREE
 *   BonusDetails   at the bottom of the page: what each bonus is, the total, a Book button that
 *                  counts down too
 *   useBonusClock  the shared clock: the deadline comes from the venue site (first time they saw
 *                  their app + LAUNCH_BONUS.hours, stored there, so a refresh never restarts it)
 *
 * The deadline is real: when it passes the countdown pieces disappear and one quiet line says when
 * they ended (BonusLine); booked in time, it says they're locked in.
 * Booking inside it is what earns the bonuses (checked at booking, /api/landing/demo-request).
 * No bonus on a taken area (the page's ask is the waitlist there).
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import QRCode from "react-qr-code";
import { LAUNCH_BONUS, LAUNCH_CALL } from "@/lib/offer";
import { previewEvent } from "@/lib/preview-event";

/* ───────────── the clock (one per page, shared) ───────────── */

/**
 * CP-245.4 · owner view (/p/<slug>?owner=<key from Admin>, checked on the server): a local demo of
 * one state, recording nothing. "live" = a fresh full clock, "ended" = ended 50 min ago,
 * "claimed" = booked. On a Vercel preview or localhost, ?bonus_demo[=ended|claimed] does the same.
 */
export type OwnerMode = "live" | "ended" | "claimed" | null;

let deadline: number | null = null;
let claimed = false;
let loaded = false;
let now = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function start(apiOrigin: string, slug: string, owner: OwnerMode) {
  if (loaded) return;
  loaded = true;
  const q = new URLSearchParams(window.location.search);
  const devDemo = q.has("bonus_demo") && /\.vercel\.app$|^localhost$/.test(window.location.hostname) ? (q.get("bonus_demo") || "live") : null;
  const mode: OwnerMode = owner ?? (devDemo === "ended" || devDemo === "claimed" ? devDemo : devDemo ? "live" : null);
  const H = LAUNCH_BONUS.hours * 3_600_000;
  const reply: Promise<Record<string, unknown> | null> = mode
    ? Promise.resolve({ bonus_deadline: new Date(mode === "live" ? Date.now() + H - 2_000 : Date.now() - 50 * 60_000).toISOString(), bonus_claimed: mode === "claimed" })
    : previewEvent(apiOrigin, slug, "app_rendered");
  reply.then((j) => {
    const t = typeof j?.bonus_deadline === "string" ? Date.parse(j.bonus_deadline) : NaN;
    deadline = Number.isFinite(t) ? t : null;
    claimed = !!deadline && j?.bonus_claimed === true;
    now = Date.now();
    if (deadline && deadline > now && !claimed && !timer) timer = setInterval(() => { now = Date.now(); emit(); if (deadline && now >= deadline && timer) { clearInterval(timer); timer = null; } }, 1000);
    emit();
  });
}

/** left: ms to go (window running); endedAt: when it ended (missed); claimed: booked in time. All empty = no bonus. */
export type BonusState = { left: number | null; endedAt: number | null; claimed: boolean };
const NONE: BonusState = { left: null, endedAt: null, claimed: false };
let snap: BonusState = NONE;
function read(): BonusState {
  const left = !claimed && deadline && now < deadline ? deadline - now : null;
  const endedAt = !claimed && deadline && now >= deadline ? deadline : null;
  const sec = (v: number | null) => (v === null ? null : Math.floor(v / 1000));
  if (sec(left) !== sec(snap.left) || endedAt !== snap.endedAt || claimed !== snap.claimed) snap = { left, endedAt, claimed };
  return snap;
}

export function useBonusState(apiOrigin: string, slug: string, enabled = true, owner: OwnerMode = null): BonusState {
  const c = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, read, () => NONE);
  useEffect(() => { if (enabled && LAUNCH_BONUS.active) start(apiOrigin, slug, owner); }, [apiOrigin, slug, enabled, owner]);
  return enabled && LAUNCH_BONUS.active ? c : NONE;
}
export function useBonusClock(apiOrigin: string, slug: string, enabled = true, owner: OwnerMode = null): number | null {
  return useBonusState(apiOrigin, slug, enabled, owner).left;
}

/** "today at 8:49 AM", "tomorrow at…", "yesterday at…", "Friday at…" (this week), "on Nov 9 at…" (viewer's clock; client only). */
function whenLabel(at: number) {
  const d = new Date(at);
  const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toDateString();
  if (d.toDateString() === day(0)) return `today at ${t}`;
  if (d.toDateString() === day(1)) return `tomorrow at ${t}`;
  if (d.toDateString() === day(-1)) return `yesterday at ${t}`;
  if (at > Date.now() && at - Date.now() < 6 * 86_400_000) return `${d.toLocaleDateString("en-US", { weekday: "long" })} at ${t}`;
  return `on ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${t}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** 03:59:12, or 2d 23:59:12 once there's a day or more left. */
export function hms(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const t = `${pad(Math.floor((s % 86400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}d ${t}` : t;
}
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
export const BONUS_TOTAL = LAUNCH_BONUS.bonuses.reduce((a, b) => a + b.value, 0);

/* ───────────── shared look ───────────── */

/** A light sweep across a picture every few seconds, like a shiny GIF. Off for reduced motion. */
const SHINE_CSS = `.pv-shine{position:relative;overflow:hidden;isolation:isolate}.pv-shine::after{content:"";position:absolute;inset:-20%;z-index:3;pointer-events:none;background:linear-gradient(105deg,transparent 38%,rgba(255,255,255,.55) 50%,transparent 62%);transform:translateX(-120%);animation:pvshine 3.6s ease-in-out infinite;animation-delay:var(--d,0s)}@keyframes pvshine{0%,55%{transform:translateX(-120%)}100%{transform:translateX(120%)}}.pv-bar::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.12) 50%,transparent 70%);transform:translateX(-100%);animation:pvbar 4.5s ease-in-out infinite}@keyframes pvbar{0%,60%{transform:translateX(-100%)}100%{transform:translateX(100%)}}@media (prefers-reduced-motion:reduce){.pv-shine::after,.pv-bar::after{animation:none;display:none}}`;

type Brand = { primary: string; logoUrl: string | null; businessName: string; appUrl: string };

/* ───────────── top bar ───────────── */

/** Sticky top bar while the window runs: "3 launch bonuses end in 03:59:12 →". Nothing after it ends. */
export function PreviewTopBar({ apiOrigin, slug, enabled, owner = null }: { apiOrigin: string; slug: string; enabled: boolean; owner?: OwnerMode }) {
  const left = useBonusClock(apiOrigin, slug, enabled, owner);
  if (left === null) return null;
  const n = LAUNCH_BONUS.bonuses.length;
  return (
    <a href="#pv-bonus" className="pv-bar sticky top-0 z-40 block overflow-hidden bg-[#111318] text-white">
      <style>{SHINE_CSS}</style>
      <span className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-3 py-2.5 text-[13.5px] font-semibold sm:gap-2.5 sm:text-[14.5px]">
        <GiftIcon className="h-[18px] w-[18px] shrink-0 text-[#FFC94D]" />
        <span><span className="text-[#FFC94D]">{n}</span> launch bonuses end in</span>
        <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[14px] tabular-nums tracking-tight text-[#FFC94D] sm:text-[15px]" role="timer" aria-live="off">{hms(left)}</span>
        <span className="hidden text-white/70 sm:inline">· book your call to claim {usd(BONUS_TOTAL)} in bonuses</span>
        <span aria-hidden className="text-[#FFC94D]">→</span>
      </span>
    </a>
  );
}

/* ───────────── tiles under the phone ───────────── */

/**
 * Right under the phone, small: three pictures (a real app video, their own banner, the audit) with a
 * shine sweeping across, a short title and "$1,500 FREE". Tapping one jumps to the full details.
 */
export function BonusTiles({ apiOrigin, slug, enabled, brand, owner = null }: { apiOrigin: string; slug: string; enabled: boolean; brand: Brand; owner?: OwnerMode }) {
  const { left, endedAt, claimed } = useBonusState(apiOrigin, slug, enabled, owner);
  if (claimed) return <BonusLine kind="claimed" brand={brand} />;
  if (endedAt !== null) return <BonusLine kind="ended" at={endedAt} brand={brand} />;
  if (left === null) return null;
  return (
    <section id="pv-bonus" aria-labelledby="pv-bonus-tiles-h" className="mx-auto mt-5 w-full max-w-[418px] scroll-mt-16">
      <style>{SHINE_CSS}</style>
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 id="pv-bonus-tiles-h" className="flex items-center gap-1.5 text-[15px] font-semibold">
          <GiftIcon className="h-4 w-4" style={{ color: brand.primary }} />Book in {LAUNCH_BONUS.hours} hours, all {LAUNCH_BONUS.bonuses.length} free
        </h2>
        <span className="shrink-0 rounded-full bg-[#111318] px-2 py-0.5 font-mono text-[12px] font-semibold tabular-nums text-[#FFC94D]">{hms(left)}</span>
      </div>
      <ul className="mt-2.5 grid grid-cols-3 gap-2">
        {LAUNCH_BONUS.bonuses.map((b, i) => (
          <li key={b.id}>
            <a href="#pv-bonus-details" className="block rounded-[16px] bg-white p-1.5 shadow-soft ring-1 ring-line active:scale-[.98]">
              <span className="pv-shine block aspect-[4/5] overflow-hidden rounded-[12px]" style={{ ["--d" as string]: `${i * 0.9}s` }}>
                <BonusPicture kind={b.icon} brand={brand} />
                <span className="absolute left-1.5 top-1.5 z-[2] rounded-full bg-[#111318]/85 px-1.5 py-px text-[10px] font-bold text-[#FFC94D]">#{i + 1}</span>
              </span>
              <span className="mt-1.5 block px-0.5 text-[12.5px] font-semibold leading-tight">{b.short}</span>
              <span className="mt-0.5 flex items-baseline gap-1 px-0.5 pb-0.5 text-[11.5px]">
                <span className="text-sub line-through">{usd(b.value)}</span>
                <span className="font-bold text-emerald-600">FREE</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
      <a href="#pv-bonus-details" className="mt-2 block text-center text-[12.5px] font-medium text-sub">What&apos;s included ↓</a>
    </section>
  );
}

/**
 * CP-245.4 · after the window, in the tiles' place: one quiet line instead of a blank, so the deadline
 * reads as real ("ended today at 8:49 AM"). Booked in time: "locked in".
 */
function BonusLine({ kind, at, brand }: { kind: "ended" | "claimed"; at?: number; brand: Brand }) {
  const n = LAUNCH_BONUS.bonuses.length;
  const ended = kind === "ended";
  return (
    <section aria-label={ended ? "Launch bonuses ended" : "Launch bonuses locked in"} className="mx-auto mt-5 flex w-full max-w-[418px] items-center gap-3.5 rounded-[18px] bg-white py-2.5 pl-3 pr-4 shadow-soft ring-1 ring-line">
      <span aria-hidden className={`flex shrink-0 pl-1 ${ended ? "opacity-60 grayscale" : ""}`}>
        {LAUNCH_BONUS.bonuses.map((b, i) => (
          <span key={b.id} className="-ml-2.5 block h-[50px] w-[40px] overflow-hidden rounded-[8px] bg-white shadow-[0_2px_6px_-2px_rgba(0,0,0,.3)] ring-2 ring-white first:ml-0" style={{ zIndex: n - i, transform: `rotate(${(i - 1) * 7}deg)` }}>
            <BonusPicture kind={b.icon} brand={brand} still />
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[14px] font-semibold leading-snug">
          {ended ? `Your ${n} launch bonuses ended ${at ? whenLabel(at) : ""}` : <>Your {n} launch bonuses are locked in<svg viewBox="0 0 12 12" className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden><path d="M2.5 6.2 5 8.6l4.5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></>}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-sub">
          {ended ? `They were held for ${LAUNCH_BONUS.hours} hours after you first opened your app. A call still turns your app on.` : "Launch videos, desk banner and software audit. We'll go over them on your call."}
        </span>
      </span>
    </section>
  );
}

/* ───────────── full details at the bottom ───────────── */

export function BonusDetails({ apiOrigin, slug, walkthroughUrl, enabled, brand, owner = null }: { apiOrigin: string; slug: string; walkthroughUrl: string; enabled: boolean; brand: Brand; owner?: OwnerMode }) {
  const left = useBonusClock(apiOrigin, slug, enabled, owner);
  const [ends, setEnds] = useState<string | null>(null);
  useEffect(() => {
    if (left === null) return;
    setEnds(whenLabel(Date.now() + left));
  }, [left === null]); // eslint-disable-line react-hooks/exhaustive-deps
  if (left === null) return null;
  const primary = brand.primary;
  return (
    <section id="pv-bonus-details" aria-labelledby="pv-bonus-h" className="mx-auto mt-12 max-w-[640px] scroll-mt-16 overflow-hidden rounded-[26px] bg-[#111318] text-white shadow-card">
      <style>{SHINE_CSS}</style>
      <div className="relative px-5 pb-5 pt-6 sm:px-7">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-40 blur-3xl" style={{ background: primary }} />
        <p className="relative inline-flex items-center gap-1.5 rounded-full bg-[#FFC94D] px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.08em] text-[#111318]">
          <GiftIcon className="h-3.5 w-3.5" />Your {LAUNCH_BONUS.bonuses.length} launch bonuses
        </p>
        <h2 id="pv-bonus-h" className="relative mt-3 text-[25px] font-semibold leading-[1.12] tracking-[-0.02em] sm:text-[28px]">
          Book in the next {LAUNCH_BONUS.hours} hours. They&apos;re free.
        </h2>
        <p className="relative mt-1.5 text-[14.5px] leading-snug text-white/70">
          Book your {LAUNCH_CALL.minutes}-minute {LAUNCH_CALL.name} before the timer runs out{ends ? ` (${ends})` : ""}. They&apos;re gone after that.
        </p>
      </div>

      <ol className="space-y-2.5 px-3 sm:px-5">
        {LAUNCH_BONUS.bonuses.map((b, i) => (
          <li key={b.id} className="flex gap-3.5 rounded-[18px] bg-white/[.06] p-3 ring-1 ring-white/10">
            <span className="pv-shine block h-[104px] w-[84px] shrink-0 overflow-hidden rounded-[12px] bg-white" style={{ ["--d" as string]: `${i * 0.9}s` }}>
              <BonusPicture kind={b.icon} brand={brand} />
            </span>
            <span className="min-w-0 flex-1 py-0.5">
              <span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-[#FFC94D]">Bonus #{i + 1}</span>
              <span className="mt-0.5 block text-[15.5px] font-semibold leading-snug">{b.title}</span>
              <span className="mt-1 block text-[13px] leading-snug text-white/65">{b.detail}</span>
              <span className="mt-1.5 flex items-baseline gap-2 text-[13px]">
                <span className="text-white/45 line-through decoration-white/60">{usd(b.value)} value</span>
                <span className="font-bold text-[#7CE0A3]">FREE</span>
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="px-5 pb-6 pt-5 sm:px-7">
        <div className="flex items-baseline justify-between gap-3 border-t border-white/10 pt-4">
          <span className="text-[14px] text-white/70">Total bonus value</span>
          <span className="text-[15px]"><span className="mr-2 text-white/45 line-through">{usd(BONUS_TOTAL)}</span><b className="text-[22px] text-white">$0</b></span>
        </div>
        <a href={walkthroughUrl} className="mt-4 flex h-[58px] w-full flex-col items-center justify-center rounded-2xl text-center leading-tight text-white active:scale-[.99]" style={{ background: primary, boxShadow: `0 14px 30px -14px ${primary}` }}>
          <span className="text-[16.5px] font-semibold">Book my free {LAUNCH_CALL.minutes}-min call</span>
          <span className="text-[12.5px] font-medium opacity-90">bonuses end in <span className="font-mono tabular-nums">{hms(left)}</span></span>
        </a>
        <p className="mt-2.5 text-center text-[12px] text-white/50">Book inside the window and all {LAUNCH_BONUS.bonuses.length} are locked in for your launch.</p>
      </div>
    </section>
  );
}

/* ───────────── the pictures ───────────── */

function BonusPicture({ kind, brand, still = false }: { kind: "film" | "banner" | "receipt"; brand: Brand; still?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (kind === "film" && still) return <img src="/bonus/app-videos.jpg" alt="" className="block h-full w-full object-cover" />;
  if (kind === "film") {
    // A real app on a real phone render (the medspa-trio loop, MedSpa SLO's membership screen).
    return <video className="block h-full w-full object-cover" src="/bonus/app-videos.mp4" poster="/bonus/app-videos.jpg" autoPlay muted loop playsInline preload="metadata" aria-label="A launch video of a med spa app" />;
  }
  if (kind === "banner") return <BannerMock brand={brand} />;
  return <AuditMock />;
}

/** Their own roll-up banner: their logo and color, and a QR code that really opens their app. */
function BannerMock({ brand }: { brand: Brand }) {
  const { primary, logoUrl, businessName, appUrl } = brand;
  return (
    <span className="relative flex h-full w-full items-end justify-center bg-gradient-to-b from-[#ECEEF1] to-[#D9DCE1]" style={{ containerType: "size" }} aria-label={`A roll-up banner for ${businessName}`}>
      <span aria-hidden className="absolute bottom-[7%] left-1/2 h-[4%] w-[58%] -translate-x-1/2 rounded-full bg-black/15 blur-[3px]" />
      <span className="relative mb-[8%] flex h-[84%] w-[50%] flex-col items-center rounded-t-[3px] bg-white px-[6%] pt-[8%] shadow-[0_6px_14px_-6px_rgba(0,0,0,.35)] ring-1 ring-black/5">
        <span aria-hidden className="absolute -top-[3%] left-[-6%] right-[-6%] h-[3%] rounded-full bg-[#9CA2AB]" />
        {logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logoUrl} alt="" className="h-[14%] w-full object-contain" />
          : <span className="grid h-[14%] w-full place-items-center font-bold" style={{ color: primary, fontSize: "8cqw" }}>{businessName.slice(0, 18)}</span>}
        <span className="mt-[10%] block text-center font-bold leading-tight text-[#111318]" style={{ fontSize: "7.5cqw" }}>Get our app</span>
        <span className="block text-center leading-tight text-black/50" style={{ fontSize: "5cqw" }}>points · offers · rewards</span>
        <span className="mt-[8%] block w-[70%] rounded-[3px] bg-white p-[3%] ring-1 ring-black/10"><QRCode value={appUrl} size={64} level="L" style={{ width: "100%", height: "auto" }} /></span>
        <span className="mt-auto block h-[13%] w-[calc(100%+12%)] -mx-[6%]" style={{ background: primary }} />
      </span>
      <span aria-hidden className="absolute bottom-[5%] left-1/2 h-[3%] w-[56%] -translate-x-1/2 rounded-[2px] bg-[#9CA2AB]" />
    </span>
  );
}

/** A software bill with the tools Atlas replaces crossed out. Illustrative: the audit finds their real ones. */
function AuditMock() {
  const rows = ["Loyalty app", "Text blasts", "Review tool", "Gift cards"];
  return (
    <span className="relative flex h-full w-full items-center justify-center bg-gradient-to-b from-[#F4F1EA] to-[#E7E1D3]" style={{ containerType: "size" }} aria-label="A software bill with tools crossed out">
      <span className="relative w-[78%] rotate-[-4deg] rounded-[4px] bg-white px-[9%] py-[10%] shadow-[0_8px_16px_-8px_rgba(0,0,0,.35)]">
        <span className="block font-bold uppercase tracking-[0.08em] text-black/45" style={{ fontSize: "5.5cqw" }}>Monthly software</span>
        {rows.map((r) => (
          <span key={r} className="mt-[7%] flex items-center justify-between gap-1 text-black/45 line-through decoration-red-500 decoration-[1.5px]" style={{ fontSize: "6.5cqw" }}>
            <span>{r}</span><span className="h-[5px] w-[22%] rounded-full bg-black/15" />
          </span>
        ))}
        <span className="mt-[12%] flex items-center justify-between border-t border-dashed border-black/20 pt-[8%] font-bold text-emerald-600" style={{ fontSize: "7cqw" }}>
          <span>You save</span><span>✓</span>
        </span>
      </span>
    </span>
  );
}

/* ───────────── icons ───────────── */

function GiftIcon({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}
