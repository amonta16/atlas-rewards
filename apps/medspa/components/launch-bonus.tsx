"use client";
/**
 * CP-245 · the 4-hour launch bonus on /p/<slug>.
 *
 *   BonusTimerBar  the top bar: "Launch bonuses end in 03:59:12" + Claim → (sticky, with the
 *                  "Preview mode — engine off." line under it)
 *   BonusStack     the three bonuses, each with its value struck through and FREE, the total, and
 *                  a Book button that counts down too
 *   useBonusClock  the shared clock: the deadline comes from the venue site (first time they saw
 *                  their app + 4 h, stored there, so a refresh never restarts it)
 *
 * The deadline is real: when it passes every piece disappears and the page goes back to normal.
 * Booking inside it is what earns the bonuses (checked at booking, /api/landing/demo-request).
 * No bonus on a taken area (the page's ask is the waitlist there).
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { LAUNCH_BONUS } from "@/lib/offer";
import { previewEvent } from "@/lib/preview-event";

/* ───────────── the clock (one per page, shared) ───────────── */

let deadline: number | null = null;
let loaded = false;
let now = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function start(apiOrigin: string, slug: string) {
  if (loaded) return;
  loaded = true;
  // Design check on a Vercel preview (never on atlas-engine.app): ?bonus_demo shows a local 4-hour
  // window without the venue site. It records nothing and earns nothing: bookings are checked on the server.
  const demo = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("bonus_demo") && /\.vercel\.app$|^localhost$/.test(window.location.hostname);
  const reply = demo ? Promise.resolve({ bonus_deadline: new Date(Date.now() + LAUNCH_BONUS.hours * 3_600_000 - 2_000).toISOString() }) : previewEvent(apiOrigin, slug, "app_rendered");
  reply.then((j) => {
    const t = typeof j?.bonus_deadline === "string" ? Date.parse(j.bonus_deadline) : NaN;
    deadline = Number.isFinite(t) ? t : null;
    now = Date.now();
    if (deadline && deadline > now && !timer) timer = setInterval(() => { now = Date.now(); emit(); if (deadline && now >= deadline && timer) { clearInterval(timer); timer = null; } }, 1000);
    emit();
  });
}

type Clock = { left: number | null }; // ms left; null = no bonus (loading, none, or ended)
const NONE: Clock = { left: null };
let snap: Clock = NONE;
function read(): Clock {
  const left = deadline && now < deadline ? deadline - now : null;
  if (left === null ? snap.left !== null : snap.left === null || Math.floor(left / 1000) !== Math.floor(snap.left / 1000)) snap = { left };
  return snap;
}

export function useBonusClock(apiOrigin: string, slug: string, enabled = true): number | null {
  const c = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, read, () => NONE);
  useEffect(() => { if (enabled && LAUNCH_BONUS.active) start(apiOrigin, slug); }, [apiOrigin, slug, enabled]);
  return enabled && LAUNCH_BONUS.active ? c.left : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
export function hms(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;
export const BONUS_TOTAL = LAUNCH_BONUS.bonuses.reduce((a, b) => a + b.value, 0);

/* ───────────── top bar ───────────── */

/** The page's sticky top: the countdown (while it runs) over the "Preview mode — engine off." line. */
export function PreviewTopBar({ apiOrigin, slug, enabled }: { apiOrigin: string; slug: string; enabled: boolean }) {
  const left = useBonusClock(apiOrigin, slug, enabled);
  return (
    <div className="sticky top-0 z-40">
      {left !== null && (
        <a href="#pv-bonus" className="pv-bar relative block overflow-hidden bg-[#111318] text-white">
          <span className="mx-auto flex max-w-6xl items-center justify-center gap-2.5 px-4 py-2.5 text-[13.5px] font-semibold sm:text-[14.5px]">
            <GiftIcon className="h-[18px] w-[18px] shrink-0 text-[#FFC94D]" />
            <span>Launch bonuses end in</span>
            <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[14px] tabular-nums tracking-tight text-[#FFC94D] sm:text-[15px]" role="timer" aria-live="off">{hms(left)}</span>
            <span className="hidden text-white/70 sm:inline">· book your call to claim {usd(BONUS_TOTAL)} in bonuses</span>
            <span aria-hidden className="text-[#FFC94D]">→</span>
          </span>
          <style>{`.pv-bar::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.12) 50%,transparent 70%);transform:translateX(-100%);animation:pvshine 4.5s ease-in-out infinite}@keyframes pvshine{0%,60%{transform:translateX(-100%)}100%{transform:translateX(100%)}}@media (prefers-reduced-motion:reduce){.pv-bar::after{animation:none;display:none}}`}</style>
        </a>
      )}
      <div className="border-b border-amber-200 bg-amber-50/95 backdrop-blur" role="status">
        <p className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-2 text-[13px] font-semibold text-amber-900 sm:text-[13.5px]">
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden />
          Preview mode — engine off.
          <span className="font-normal text-amber-900/80">Reminders, offers and points don&apos;t send yet.</span>
        </p>
      </div>
    </div>
  );
}

/* ───────────── the stack ───────────── */

export function BonusStack({ apiOrigin, slug, walkthroughUrl, primary, enabled }: { apiOrigin: string; slug: string; walkthroughUrl: string; primary: string; enabled: boolean }) {
  const left = useBonusClock(apiOrigin, slug, enabled);
  const [ends, setEnds] = useState<string | null>(null);
  useEffect(() => {
    if (left === null) return;
    const end = new Date(Date.now() + left);
    const day = end.toDateString() === new Date().toDateString() ? "today" : "tomorrow"; // the window is 4 h, so one of the two
    setEnds(`${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} ${day}`);
  }, [left === null]); // eslint-disable-line react-hooks/exhaustive-deps
  if (left === null) return null;
  return (
    <section id="pv-bonus" aria-labelledby="pv-bonus-h" className="mt-8 max-w-[34rem] scroll-mt-28 overflow-hidden rounded-[26px] bg-[#111318] text-white shadow-card">
      <div className="relative px-5 pb-5 pt-6 sm:px-6">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-40 blur-3xl" style={{ background: primary }} />
        <p className="relative inline-flex items-center gap-1.5 rounded-full bg-[#FFC94D] px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.08em] text-[#111318]">
          <GiftIcon className="h-3.5 w-3.5" />Book in the next 4 hours
        </p>
        <h2 id="pv-bonus-h" className="relative mt-3 text-[25px] font-semibold leading-[1.12] tracking-[-0.02em] sm:text-[28px]">
          Get 3 launch bonuses, free.
        </h2>
        <p className="relative mt-1.5 text-[14.5px] leading-snug text-white/70">
          Book your 15-minute walkthrough before the timer runs out{ends ? ` (${ends})` : ""}. They&apos;re gone after that.
        </p>
      </div>

      <ol className="space-y-2.5 px-3 sm:px-4">
        {LAUNCH_BONUS.bonuses.map((b, i) => (
          <li key={b.id} className="flex gap-3.5 rounded-[18px] bg-white/[.06] p-4 ring-1 ring-white/10">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px]" style={{ background: `${primary}`, boxShadow: `0 8px 24px -10px ${primary}` }}>
              <BonusIcon kind={b.icon} className="h-6 w-6 text-white" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-[#FFC94D]">Bonus #{i + 1}</span>
              <span className="mt-0.5 block text-[16px] font-semibold leading-snug">{b.title}</span>
              <span className="mt-1 block text-[13.5px] leading-snug text-white/65">{b.detail}</span>
              <span className="mt-2 flex items-baseline gap-2 text-[13.5px]">
                <span className="text-white/45 line-through decoration-white/60">{usd(b.value)} value</span>
                <span className="font-bold text-[#7CE0A3]">FREE</span>
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="px-5 pb-6 pt-5 sm:px-6">
        <div className="flex items-baseline justify-between gap-3 border-t border-white/10 pt-4">
          <span className="text-[14px] text-white/70">Total bonus value</span>
          <span className="text-[15px]"><span className="mr-2 text-white/45 line-through">{usd(BONUS_TOTAL)}</span><b className="text-[22px] text-white">$0</b></span>
        </div>
        <a href={walkthroughUrl} className="mt-4 flex h-[58px] w-full flex-col items-center justify-center rounded-2xl text-center leading-tight text-white active:scale-[.99]" style={{ background: primary, boxShadow: `0 14px 30px -14px ${primary}` }}>
          <span className="text-[16.5px] font-semibold">Book my 15-min call</span>
          <span className="text-[12.5px] font-medium opacity-90">bonuses end in <span className="font-mono tabular-nums">{hms(left)}</span></span>
        </a>
        <p className="mt-2.5 text-center text-[12px] text-white/50">Book inside the window and all three are locked in for your launch.</p>
      </div>
    </section>
  );
}

/* ───────────── icons ───────────── */

function GiftIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

function BonusIcon({ kind, className = "" }: { kind: "film" | "megaphone" | "receipt"; className?: string }) {
  const p = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className, "aria-hidden": true };
  if (kind === "film") return <svg {...p}><rect x="6" y="2.5" width="12" height="19" rx="2.5" /><path d="m10.5 9.2 4 2.8-4 2.8z" fill="currentColor" /></svg>;
  if (kind === "megaphone") return <svg {...p}><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" /></svg>;
  return <svg {...p}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>;
}
