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

/* ───────────── CP-188: phone shell + full screens for the showcase ───────────── */

/** A phone drawn in CSS: dark frame, island, status bar, scrollable-looking screen. */
export function PhoneShell({ children, className, tilt = true }: { children: React.ReactNode; className?: string; tilt?: boolean }) {
  return (
    <div className={cn("relative w-[330px]", className)} style={tilt ? { transform: "rotate(-4deg)" } : undefined}>
      <div className="rounded-[46px] bg-[#111418] p-[10px] shadow-[0_50px_100px_-40px_rgba(6,49,143,.55),0_0_0_1px_rgba(255,255,255,.08)_inset]">
        <div className="relative h-[640px] overflow-hidden rounded-[38px] bg-[#F6F9FD]">
          <div className="absolute left-1/2 top-3 z-20 h-[26px] w-[96px] -translate-x-1/2 rounded-full bg-[#111418]" />
          <div className="relative z-10 flex items-center justify-between px-7 pt-4 text-[13px] font-semibold text-zinc-900"><span>9:41</span><span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-[2px] bg-zinc-900" /><span className="inline-block h-2.5 w-5 rounded-[3px] border-2 border-zinc-900" /></span></div>
          {children}
        </div>
      </div>
    </div>
  );
}

function AppBar({ title, points = "910 pts" }: { title: string; points?: string }) {
  return (
    <div className="flex items-center justify-between px-5 pb-3 pt-4">
      <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#9f6b53] text-[11px] font-bold text-white">LA</span><span className="text-[15px] font-bold text-zinc-900">{title}</span></div>
      <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${P}14`, color: P }}>{points}</span>
    </div>
  );
}

function TabBar({ active }: { active: "Home" | "Book" | "My care" | "Member" | "Check in" }) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-around border-t bg-white/95 px-2 pb-5 pt-2.5 text-[10px] font-semibold text-zinc-400 backdrop-blur">
      {(["Home", "Book", "My care", "Member", "Check in"] as const).map((t) => <span key={t} className="flex flex-col items-center gap-1" style={t === active ? { color: P } : undefined}><span className="h-5 w-5 rounded-md" style={{ background: t === active ? P : "#D6DDE6" }} />{t}</span>)}
    </div>
  );
}

/** Screen 1 — Recall: Home with the due card and a reminder landing. */
export function ScreenRecall() {
  return (
    <div className="relative h-full">
      <AppBar title="Luma Aesthetics" />
      <div className="mx-4 rounded-2xl p-4 text-white" style={{ background: `linear-gradient(135deg, ${P}, ${S})` }}>
        <div className="text-[10px] font-black uppercase tracking-widest opacity-80">Luma Aesthetics</div>
        <div className="mt-1 text-lg font-extrabold">Welcome back, Maya!</div>
      </div>
      <div className="-mt-3 px-3"><DueCardMock className="!w-full !shadow-xl" /></div>
      <div className="mt-4 px-4"><AftercareMock className="!w-full !shadow-md" /></div>
      <div className="absolute left-3 right-3 top-12 z-20"><ReminderMock className="!w-full" /></div>
      <TabBar active="Home" />
    </div>
  );
}

/** Screen 2 — Memberships: the card + what it includes. */
export function ScreenMembership() {
  return (
    <div className="relative h-full">
      <AppBar title="Member" />
      <div className="px-3"><MemberCardMock className="!w-full" /></div>
      <div className="mx-4 mt-4 rounded-2xl bg-white p-4 ring-1 ring-black/5">
        <div className="text-[12px] font-bold text-zinc-900">What Luma Glow includes</div>
        <ul className="mt-2 space-y-2 text-[12.5px] text-zinc-700">
          {["$150 banks toward any treatment, every month", "15% off every visit, members-only pricing", "Priority booking with your injector", "Birthday treatment on us"].map((t) => <li key={t} className="flex gap-2"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: P }} />{t}</li>)}
        </ul>
        <div className="mt-3 rounded-xl py-2.5 text-center text-[12.5px] font-bold text-white" style={{ background: P }}>Join for $149/mo · cancel anytime</div>
      </div>
      <TabBar active="Member" />
    </div>
  );
}

/** Screen 3 — Rewards: points + two treatments she can redeem. */
export function ScreenRewards() {
  return (
    <div className="relative h-full">
      <AppBar title="Rewards" />
      <div className="mx-4 rounded-2xl p-4 text-white" style={{ background: `linear-gradient(135deg, #1b4b57, ${S})` }}>
        <div className="flex items-end justify-between"><div><div className="text-3xl font-extrabold leading-none">910</div><div className="mt-1 text-[11px] opacity-80">points · Maya Chen</div></div><span className="rounded-full bg-white/15 px-2 py-1 text-[10px] font-bold ring-1 ring-white/25">290 to your next reward</span></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/20"><div className="h-full w-[76%] rounded-full bg-white" /></div>
      </div>
      <div className="mt-4 flex items-baseline justify-between px-5"><span className="text-[14px] font-bold text-zinc-900">Redeem</span><span className="text-[11px] font-semibold" style={{ color: P }}>See all</span></div>
      <div className="mt-2 grid grid-cols-2 gap-3 px-4">
        {[["Free LED add-on", "500 pts", "#dfe9e6"], ["$25 off any facial", "800 pts", "#efe2dd"], ["Hydrating mask upgrade", "1,000 pts", "#e4e1ee"], ["Complimentary skin consult", "1,200 pts", "#e2ebf3"]].map(([n, c, bg]) => (
          <div key={n} className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5"><div className="h-20" style={{ background: bg }} /><div className="p-2.5"><div className="text-[12px] font-bold leading-tight text-zinc-900">{n}</div><div className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${P}14`, color: P }}>{c}</div></div></div>
        ))}
      </div>
      <TabBar active="Home" />
    </div>
  );
}

/** Screen 4 — Patient financing (in development): pay over time at checkout through the practice's own Stripe. */
export function ScreenFinancing() {
  return (
    <div className="relative h-full">
      <AppBar title="Checkout" points="Maya" />
      <div className="px-5">
        <div className="text-[11px] text-zinc-500">Order total</div>
        <div className="text-2xl font-extrabold text-zinc-900">$0 today</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] font-semibold text-zinc-700">
          {["Card", "Apple Pay", "Pay over time"].map((o, i) => <div key={o} className={cn("rounded-xl border bg-white px-2 py-3 text-center", i === 2 && "ring-2")} style={i === 2 ? { borderColor: P, boxShadow: `0 0 0 2px ${P}33` } : undefined}>{o}</div>)}
        </div>
        <div className="mt-3 rounded-2xl bg-zinc-100 p-3.5">
          <div className="flex items-center justify-between text-[12px]"><span className="font-bold text-zinc-900">Lip filler · $720</span><span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: P }}>4 payments</span></div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[10px] text-zinc-600">
            {["Today", "+2 wks", "+4 wks", "+6 wks"].map((t, i) => <div key={t} className={cn("rounded-xl p-2", i === 0 ? "bg-white shadow-sm" : "")}><div className="text-[13px] font-extrabold text-zinc-900">$180</div>{t}</div>)}
          </div>
          <div className="mt-2 text-[10px] text-zinc-500">0% interest · through the practice&apos;s Stripe account</div>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white p-3 text-[11px] text-zinc-700 ring-1 ring-black/5"><Check className="h-3.5 w-3.5" style={{ color: P }} />This purchase banks 720 points and your member credit</div>
        <div className="mt-3 rounded-xl py-3 text-center text-[13px] font-bold text-white" style={{ background: P }}>Confirm · $180 today</div>
      </div>
      <div className="absolute left-1/2 top-[55%] -translate-x-1/2 rounded-full bg-[#0B1B2B]/85 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur">In development · 2027</div>
      <TabBar active="Book" />
    </div>
  );
}
