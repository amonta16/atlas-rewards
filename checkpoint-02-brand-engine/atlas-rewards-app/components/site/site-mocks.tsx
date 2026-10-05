"use client";
/**
 * components/site/site-mocks.tsx — CP-187 · product moments drawn in code
 *
 * The brand site shows the product, not stock art. These are faithful,
 * static renderings of three real screens (patient due card, the desk's
 * Patients list, the member card with banked credit) in the demo
 * practice's colors, so they stay honest with what ships and never go
 * stale the way screenshots do.
 */
import { CalendarCheck, Check, MessageSquareText, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

const P = "#2C6E7F"; // Luma Aesthetics (demo practice) primary
const S = "#0E2433";

/** The patient's "Your next treatment" card, as on her Home. */
export function DueCardMock({ className }: { className?: string }) {
  const r = 24, c = 2 * Math.PI * r;
  return (
    <div className={cn("w-[340px] rounded-3xl p-5 text-white shadow-2xl", className)} style={{ background: `linear-gradient(135deg, ${P} 0%, ${S} 100%)` }}>
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90"><circle cx="28" cy="28" r={r} fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.25)" strokeWidth="4" /><circle cx="28" cy="28" r={r} fill="none" stroke="#e3b26a" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * 0.88} ${c}`} /></svg>
          <div className="absolute inset-0 grid place-items-center text-center leading-none"><div><div className="text-[17px] font-extrabold">10</div><div className="text-[8px] font-bold uppercase tracking-wider opacity-80">days</div></div></div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-black uppercase tracking-widest opacity-85">Your next treatment</div>
          <div className="text-lg font-extrabold leading-tight">Neurotoxin</div>
          <div className="mt-0.5 text-xs opacity-90">Due in 10 days · around Oct 14 with Jess</div>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/15 px-3.5 py-2.5 ring-1 ring-white/25">
        <span className="flex items-center gap-2 text-xs font-semibold"><Wallet className="h-4 w-4" />Banked toward your next visit</span>
        <span className="text-base font-extrabold">$300</span>
      </div>
    </div>
  );
}

/** The front desk's Patients tab: who's due, not booked. */
const ROWS = [
  { n: "Maya Chen", t: "Neurotoxin", d: "Due in 10 days", last: "Jul 22 · Jess", tone: "soon", booked: false },
  { n: "Priya Natarajan", t: "Dermal filler", d: "2 weeks overdue", last: "Dec 3 · Dr. Ruiz", tone: "over", booked: false },
  { n: "Danielle Ortiz", t: "HydraFacial", d: "Due this week", last: "Sep 8 · Mara", tone: "due", booked: true },
  { n: "Sofia Alvarez", t: "Lip filler", d: "Due in 3 weeks", last: "Apr 14 · Jess", tone: "later", booked: false },
];
export function DeskListMock({ className }: { className?: string }) {
  return (
    <div className={cn("w-[420px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5", className)}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div><div className="text-[13px] font-bold text-zinc-900">Patients due for a treatment</div><div className="text-[11px] text-zinc-500">Luma Aesthetics · Front desk</div></div>
        <div className="flex rounded-lg bg-zinc-100 p-0.5 text-[10px] font-semibold"><span className="rounded-md bg-white px-2 py-1 shadow-sm">All</span><span className="px-2 py-1 text-zinc-500">Overdue · 1</span><span className="px-2 py-1 text-zinc-500">Due soon · 2</span></div>
      </div>
      <ul className="divide-y">
        {ROWS.map((r) => (
          <li key={r.n} className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white" style={{ background: r.tone === "over" ? "#b86b64" : P }}>{r.n[0]}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-zinc-900">{r.n}{r.booked && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 ring-1 ring-emerald-200"><CalendarCheck className="h-2.5 w-2.5" />Booked</span>}</div>
              <div className="text-[11px] text-zinc-500"><b className={cn("font-semibold", r.tone === "over" ? "text-[#b86b64]" : "text-zinc-800")}>{r.t}</b> · {r.d} · last {r.last}</div>
            </div>
            {!r.booked && <span className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-semibold text-zinc-700"><MessageSquareText className="h-3 w-3" />Text</span>}
            <span className="rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-white" style={{ background: P }}>Open</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The phone notification her recall produces. */
export function ReminderMock({ className }: { className?: string }) {
  return (
    <div className={cn("w-[300px] rounded-2xl bg-white/95 p-3.5 shadow-2xl ring-1 ring-black/5 backdrop-blur", className)}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[#9f6b53] text-[13px] font-semibold text-white">LA</span>
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-2 text-[12px] text-zinc-500"><span className="font-semibold text-zinc-900">Luma Aesthetics</span><span>now</span></div>
          <p className="mt-0.5 text-[13px] leading-snug text-zinc-900">Maya, your refresh is due around Oct 14. Book this week and we&apos;ll hold your usual time.</p>
        </div>
      </div>
    </div>
  );
}

/** The booking that comes back. */
export function BookedPillMock({ className }: { className?: string }) {
  return (
    <div className={cn("inline-flex items-center gap-2.5 rounded-full bg-[#0E2433] py-2 pl-2.5 pr-4 text-[13px] text-white shadow-lg", className)}>
      <span className="grid h-6 w-6 place-items-center rounded-full bg-[#3fb68b]"><Check className="h-3.5 w-3.5" /></span>Booked for Thursday, 2:30
    </div>
  );
}

/** Member card: membership that banks credit. */
export function MemberCardMock({ className }: { className?: string }) {
  return (
    <div className={cn("w-[340px] overflow-hidden rounded-3xl text-white shadow-2xl", className)} style={{ background: `linear-gradient(160deg, #1b4b57 0%, ${S} 100%)` }}>
      <div className="flex items-start justify-between p-5 pb-3">
        <div><div className="text-[10px] font-black uppercase tracking-widest opacity-75">Luma Glow Membership</div><div className="mt-1 text-xl font-extrabold">Maya Chen</div></div>
        <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold ring-1 ring-white/25">Active</span>
      </div>
      <div className="grid grid-cols-3 gap-px bg-white/10 text-center text-[11px]">
        {[["$150", "banks monthly"], ["$300", "available now"], ["15%", "off every visit"]].map(([a, b]) => <div key={b} className="bg-[#0E2433]/60 px-2 py-3"><div className="text-lg font-extrabold">{a}</div><div className="opacity-70">{b}</div></div>)}
      </div>
      <div className="flex items-center justify-between p-4 text-[12px]"><span className="opacity-80">Renews Nov 1 · Stripe</span><span className="font-semibold">Manage</span></div>
    </div>
  );
}

/** Aftercare after a logged treatment. */
export function AftercareMock({ className }: { className?: string }) {
  return (
    <div className={cn("w-[320px] rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-black/5", className)}>
      <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl text-sm font-extrabold text-white" style={{ background: `linear-gradient(135deg, ${P}, ${S})` }}>NE</span><div><div className="text-sm font-bold text-zinc-900">Neurotoxin</div><div className="text-[11px] text-zinc-500">Today · Jess Tran</div></div><span className="ml-auto rounded-full px-2 py-1 text-[10px] font-bold" style={{ background: `${P}14`, color: P }}>Due in 12 weeks</span></div>
      <div className="mt-3 text-xs font-bold" style={{ color: P }}>Aftercare for this treatment</div>
      <ul className="mt-2 space-y-1.5 text-[13px] text-zinc-700">
        {["Stay upright for 4 hours", "Skip workouts and alcohol today", "No facials or massage on the area for 24 hours", "Full results in 10–14 days"].map((t) => <li key={t} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: P }} />{t}</li>)}
      </ul>
    </div>
  );
}
