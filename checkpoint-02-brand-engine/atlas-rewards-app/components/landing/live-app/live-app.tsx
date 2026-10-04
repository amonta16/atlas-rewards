"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import {
  CalendarCheck, CalendarDays, Check, ChevronRight, Crown, Gift, Home, Lock, QrCode, ScanLine, Sparkles, Star, Tag, Ticket, Users, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { optimizedUrl } from "@/lib/img";
import { bannerStyle } from "@/lib/banner-styles";
import { pointsCardStyle } from "@/lib/points-card-styles";
import { loyaltyCardRamp, loyaltyCardSurface, loyaltyCardSheen } from "@/lib/loyalty-card";
import {
  FLIPPOS_BOOKING, FLIPPOS_BRAND, FLIPPOS_HOURS, FLIPPOS_OFFER, FLIPPOS_PACKAGES, FLIPPOS_REWARDS, FLIPPOS_TIERS,
  POINTS, START_POINTS, type LiveBrand, type LiveCategory, type LiveResource, type LiveReward,
} from "@/lib/landing/live-app-data";

/**
 * LiveApp — CP-176.
 *
 * A tap-through copy of a real Atlas guest app (entertainment layout:
 * Home · Book · Check in · Rewards · Member) running on Flippo's real
 * brand, rewards, cages and hours. Styling comes from the SAME style
 * engine the production app uses (banner, points card, loyalty card),
 * so re-skinning it with another brand is exactly what the app builder
 * does. Every action is simulated client-side — no network, no writes.
 *
 * Used twice:
 *   • <LiveDemoSection/> — "try the app" on the landing page
 *   • <BrandYourApp/>    — Owner.com-style: the visitor's own name/color/logo
 *                          re-skins the phone while they book a demo
 */

export type LiveEvent = "checkin" | "spin" | "book" | "redeem" | "tab";
type Tab = "home" | "book" | "scan" | "rewards" | "member";
type Booking = { resource: string; when: string };

const TABS: Array<{ id: Tab; label: string; icon: typeof Home }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "book", label: "Book", icon: CalendarDays },
  { id: "scan", label: "Check in", icon: ScanLine },
  { id: "rewards", label: "Rewards", icon: Gift },
  { id: "member", label: "Member", icon: Crown },
];

const WHEEL = [100, 25, 250, 50, 150, 25, 500, 75];

export function LiveApp({
  brand = FLIPPOS_BRAND,
  categories = FLIPPOS_BOOKING,
  rewards = FLIPPOS_REWARDS,
  hours = FLIPPOS_HOURS,
  offer = FLIPPOS_OFFER,
  memberNote = "Monthly passes and party-family perks live here too.",
  guest = "Jordan",
  push = false,
  onEvent,
  className,
}: {
  brand?: LiveBrand;
  categories?: LiveCategory[];
  rewards?: LiveReward[];
  hours?: Record<number, [number, number]>;
  /** CP-182: the featured offer (banner, push, Home card). Defaults to Flippo's. */
  offer?: { title: string; sub: string; daysLeft: number; kicker?: string };
  /** CP-182: the small note at the bottom of the Member tab. */
  memberNote?: string;
  guest?: string;
  /** Slide in a push notification once the phone has been on screen a few seconds. */
  push?: boolean;
  onEvent?: (e: LiveEvent) => void;
  className?: string;
}) {
  const [tab, setTab] = useState<Tab>("home");
  const [points, setPoints] = useState(START_POINTS);
  const [visits, setVisits] = useState(6);
  const [spun, setSpun] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [toast, setToast] = useState<{ id: number; text: string; pts?: number } | null>(null);
  const [sheet, setSheet] = useState<null | { kind: "book"; resource: LiveResource; cat: LiveCategory } | { kind: "redeem"; reward: LiveReward; code: string }>(null);
  const [pushOn, setPushOn] = useState(false);
  const [lifetime, setLifetime] = useState(START_POINTS + 640);
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const emit = useCallback((e: LiveEvent) => onEvent?.(e), [onEvent]);

  const say = useCallback((text: string, pts?: number) => {
    setToast({ id: Date.now(), text, pts });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const earn = useCallback((n: number, why: string) => {
    setPoints((p) => p + n);
    setLifetime((p) => p + n);
    say(why, n);
  }, [say]);

  const go = (t: Tab) => {
    setTab(t);
    bodyRef.current?.scrollTo({ top: 0 });
    emit("tab");
  };

  // Push notification — once, after the phone has been visible ~5s.
  useEffect(() => {
    if (!push || !rootRef.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let fired = false;
    const io = new IntersectionObserver(([e]) => {
      if (fired) return;
      if (e.isIntersecting) timer = setTimeout(() => { fired = true; setPushOn(true); }, 5000);
      else if (timer) clearTimeout(timer);
    }, { threshold: 0.6 });
    io.observe(rootRef.current);
    return () => { io.disconnect(); if (timer) clearTimeout(timer); };
  }, [push]);
  useEffect(() => {
    if (!pushOn) return;
    const t = setTimeout(() => setPushOn(false), 6500);
    return () => clearTimeout(t);
  }, [pushOn]);

  const sorted = useMemo(() => [...rewards].sort((a, b) => a.cost - b.cost), [rewards]);
  const next = sorted.find((r) => r.cost > points);
  const tier = [...FLIPPOS_TIERS].reverse().find((t) => lifetime >= t.min) ?? FLIPPOS_TIERS[0];

  const doCheckin = () => {
    setVisits((v) => v + 1);
    earn(POINTS.visit, `Visit #${visits + 1} logged`);
    burst(rootRef.current, brand.primary);
    emit("checkin");
  };
  const doRedeem = (r: LiveReward) => {
    if (points < r.cost) return;
    setPoints((p) => p - r.cost);
    setSheet({ kind: "redeem", reward: r, code: deskCode() });
    emit("redeem");
  };
  const doBook = (resource: LiveResource, when: string) => {
    setBookings((b) => [{ resource: resource.name, when }, ...b].slice(0, 3));
    setSheet(null);
    say(`Booked · ${when}`);
    emit("book");
  };

  return (
    <div ref={rootRef} className={cn("relative mx-auto w-[300px] select-none", className)}>
      {/* Frame */}
      <div className="relative rounded-[3rem] bg-[#0b0f19] p-[9px] shadow-[0_40px_80px_-24px_rgba(8,15,35,0.55),0_0_0_1px_rgba(255,255,255,0.06)_inset]">
        <span className="absolute -left-[3px] top-28 h-10 w-[3px] rounded-l bg-[#1c2333]" aria-hidden />
        <span className="absolute -left-[3px] top-44 h-16 w-[3px] rounded-l bg-[#1c2333]" aria-hidden />
        <span className="absolute -right-[3px] top-36 h-20 w-[3px] rounded-r bg-[#1c2333]" aria-hidden />

        {/* Screen */}
        <div className="relative flex h-[620px] w-full flex-col overflow-hidden rounded-[2.45rem] bg-[#f6f7f9] text-zinc-900" style={{ colorScheme: "light" }}>
          {/* Status bar */}
          <div className="relative z-30 flex h-10 shrink-0 items-end justify-between bg-white px-7 pb-1 text-[11px] font-semibold">
            <span>9:41</span>
            <span className="absolute left-1/2 top-2 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-black" aria-hidden />
            <span className="flex items-center gap-1" aria-hidden>
              <span className="flex items-end gap-[1.5px]">{[4, 6, 8, 10].map((h) => <span key={h} className="w-[2.5px] rounded-sm bg-zinc-900" style={{ height: h }} />)}</span>
              <span className="ml-1 inline-flex h-[11px] w-[22px] items-center rounded-[3px] border border-zinc-900/80 p-[1.5px]"><span className="h-full w-[70%] rounded-[1.5px] bg-zinc-900" /></span>
            </span>
          </div>

          {/* Sticky offer banner */}
          <button
            type="button"
            onClick={() => go("home")}
            className="relative z-20 flex shrink-0 items-center justify-between px-3 py-2 text-left text-[11px] font-medium text-white"
            style={bannerStyle("gradient", brand.primary, brand.secondary, brand.accent)}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate font-black uppercase tracking-tight">{offer.title}: {offer.sub}</span>
            </span>
            <span className="ml-2 flex shrink-0 items-center gap-1 rounded-full bg-white py-0.5 pl-1.5 pr-2 text-[10px] font-semibold text-zinc-900">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" /> {offer.daysLeft}d left
            </span>
          </button>

          {/* Header */}
          <div className="relative z-20 flex h-[52px] shrink-0 items-center justify-between border-b border-black/5 bg-white px-4">
            <BrandMark brand={brand} />
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums" style={{ background: `${brand.primary}14`, color: brand.primary }}>
                <CountUp value={points} /> pts
              </span>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white shadow ring-1 ring-black/5" aria-hidden>
                <span className="flex flex-col gap-[3px]">{[0, 1, 2].map((i) => <span key={i} className="block h-[2px] w-3.5 rounded-full bg-slate-600" />)}</span>
              </span>
            </div>
          </div>

          {/* Body */}
          <div ref={bodyRef} className="relative flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div key={tab} className="la-fade pb-6">
              {tab === "home" && (
                <HomeTab
                  brand={brand} guest={guest} points={points} next={next} rewards={sorted} tierName={tier.name}
                  spun={spun} bookings={bookings} categories={categories} offer={offer}
                  onSpin={(n) => { setSpun(true); earn(n, "Daily Spin win"); emit("spin"); }}
                  go={go}
                />
              )}
              {tab === "book" && (
                <BookTab brand={brand} categories={categories} bookings={bookings} onPick={(resource, cat) => setSheet({ kind: "book", resource, cat })} />
              )}
              {tab === "scan" && <ScanTab brand={brand} guest={guest} visits={visits} onCheckin={doCheckin} onEarnInfo={(t) => say(t)} />}
              {tab === "rewards" && <RewardsTab brand={brand} guest={guest} points={points} rewards={sorted} tierName={tier.name} onRedeem={doRedeem} />}
              {tab === "member" && <MemberTab brand={brand} guest={guest} lifetime={lifetime} visits={visits} note={memberNote} />}
            </div>
          </div>

          {/* Tab bar */}
          <nav className="relative z-20 flex shrink-0 items-stretch justify-around border-t border-zinc-200 bg-white px-1 pb-4 pt-1.5" aria-label="App tabs (demo)">
            {TABS.map(({ id, label, icon: I }) => {
              const on = tab === id;
              return (
                <button key={id} type="button" onClick={() => go(id)} aria-current={on ? "page" : undefined}
                  className="flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 transition-transform active:scale-95">
                  <I className="h-[20px] w-[20px]" style={{ color: on ? brand.primary : "#9ca3af" }} aria-hidden />
                  <span className="text-[10px] font-semibold" style={{ color: on ? brand.primary : "#9ca3af" }}>{label}</span>
                </button>
              );
            })}
          </nav>
          <span className="pointer-events-none absolute bottom-1.5 left-1/2 z-30 h-1 w-28 -translate-x-1/2 rounded-full bg-zinc-900/80" aria-hidden />

          {/* Toast */}
          <div className="pointer-events-none absolute inset-x-0 top-[112px] z-40 flex justify-center px-4" aria-live="polite">
            {toast && (
              <div key={toast.id} className="la-toast flex items-center gap-2 rounded-full bg-zinc-900/95 py-2 pl-2 pr-3.5 text-[12px] font-semibold text-white shadow-xl">
                {toast.pts ? (
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-black" style={{ background: brand.secondary, color: "#0b1220" }}>+{toast.pts.toLocaleString()}</span>
                ) : (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500"><Check className="h-3 w-3" aria-hidden /></span>
                )}
                {toast.text}
              </div>
            )}
          </div>

          {/* Push notification */}
          <div className={cn("absolute inset-x-2 top-2 z-50 transition-all duration-500", pushOn ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-[130%] opacity-0")}>
            <button type="button" onClick={() => { setPushOn(false); go("home"); }}
              className="flex w-full items-start gap-2.5 rounded-[1.1rem] bg-white/85 p-3 text-left shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/5 backdrop-blur-xl">
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[10px]" style={{ background: brand.primary }}>
                {brand.logoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={optimizedUrl(brand.logoUrl, 80)} alt="" className="h-full w-full bg-white object-contain p-0.5" />
                  : <span className="text-[11px] font-black text-white">{initials(brand.name)}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  <span className="truncate">{short(brand.name)}</span><span>now</span>
                </span>
                <span className="mt-0.5 block text-[12.5px] font-bold leading-snug text-zinc-900">{offer.title} is on</span>
                <span className="block text-[12px] leading-snug text-zinc-600">{offer.sub} today. Show the app at the desk.</span>
              </span>
            </button>
          </div>

          {/* Sheets */}
          {sheet && (
            <div className="absolute inset-0 z-40 flex items-end bg-black/40" onClick={() => setSheet(null)}>
              <div className="la-sheet max-h-[82%] w-full overflow-y-auto rounded-t-[1.6rem] bg-white p-4 pb-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-300" />
                {sheet.kind === "book" && <BookSheet brand={brand} resource={sheet.resource} cat={sheet.cat} hours={hours} onBook={doBook} onClose={() => setSheet(null)} />}
                {sheet.kind === "redeem" && <RedeemSheet brand={brand} reward={sheet.reward} code={sheet.code} onClose={() => setSheet(null)} />}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .la-fade{animation:la-fade .32s cubic-bezier(.22,1,.36,1) both}
        @keyframes la-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        .la-toast{animation:la-toast .35s cubic-bezier(.22,1,.36,1) both}
        @keyframes la-toast{from{opacity:0;transform:translateY(-8px) scale(.96)}to{opacity:1;transform:none}}
        .la-sheet{animation:la-sheet .35s cubic-bezier(.22,1,.36,1) both}
        @keyframes la-sheet{from{transform:translateY(100%)}to{transform:none}}
        @keyframes la-scan{0%{top:8%}100%{top:88%}}
        .la-scanline{animation:la-scan 1.1s ease-in-out infinite alternate}
        @media (prefers-reduced-motion: reduce){.la-fade,.la-toast,.la-sheet,.la-scanline{animation:none!important}}
      `}</style>
    </div>
  );
}

/* ══════════════════════════ HOME ══════════════════════════ */
function HomeTab({
  brand, guest, points, next, rewards, tierName, spun, bookings, categories, offer, onSpin, go,
}: {
  brand: LiveBrand; guest: string; points: number; next?: LiveReward; rewards: LiveReward[]; tierName: string;
  spun: boolean; bookings: Booking[]; categories: LiveCategory[]; offer: { title: string; sub: string; kicker?: string }; onSpin: (n: number) => void; go: (t: Tab) => void;
}) {
  const pc = pointsCardStyle("shiny", brand.primary, brand.secondary, brand.accent);
  const pct = next ? Math.min(100, (points / next.cost) * 100) : 100;
  const firstCat = categories[0];
  const thumbs = categories.flatMap((c) => c.resources).filter((r) => r.img).slice(0, 2);
  return (
    <>
      <div className="relative h-[150px] overflow-hidden">
        {brand.heroUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={optimizedUrl(brand.heroUrl, 600)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})` }} />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/15 to-black/40" />
        <div className="absolute left-4 top-3.5 right-4">
          <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-white/85">{brand.name}</div>
          <div className="mt-0.5 text-[20px] font-bold leading-tight text-white">Welcome back, {guest}!</div>
        </div>
      </div>

      {/* Points card */}
      <div className="relative z-10 -mt-9 px-3.5">
        <button type="button" onClick={() => go("rewards")} className="relative block w-full overflow-hidden rounded-2xl p-3.5 text-left" style={pc.container}>
          <span className="pointer-events-none absolute inset-0 opacity-40" style={{ background: "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.55) 48%, transparent 62%)" }} />
          <span className="relative flex items-center gap-3">
            <span className="text-[26px] font-extrabold tracking-tight tabular-nums" style={{ color: pc.number }}><CountUp value={points} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-white">points</span>
              <span className="block text-[10px] text-white/75">{tierName} member</span>
            </span>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={pc.pill}>Rewards</span>
          </span>
          {next && (
            <span className="relative mt-2.5 block">
              <span className="block h-1.5 overflow-hidden rounded-full bg-white/25"><span className="block h-full rounded-full bg-white transition-all duration-700" style={{ width: `${pct}%` }} /></span>
              <span className="mt-1 block truncate text-[10px] text-white/85">{(next.cost - points).toLocaleString()} to {next.name}</span>
            </span>
          )}
        </button>
      </div>

      {/* Daily spin */}
      <div className="mt-3.5 px-3.5">
        <SpinCard brand={brand} spun={spun} onSpin={onSpin} />
      </div>

      {/* Booking card */}
      {firstCat && (
        <div className="mt-3.5 px-3.5">
          <button type="button" onClick={() => go("book")} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-black/5">
            <span className="flex -space-x-3">
              {thumbs.length > 0 ? thumbs.map((t) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={t.id} src={optimizedUrl(t.img, 96)} alt="" className="h-9 w-9 rounded-xl object-cover ring-2 ring-white" />
              )) : <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: brand.primary }}><CalendarDays className="h-5 w-5" /></span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-bold">Book a {firstCat.unit}</span>
              <span className="block truncate text-[11px] text-zinc-500">{bookings[0] ? `Next: ${bookings[0].when}` : "Skip the line"}</span>
            </span>
            <span className="rounded-full px-3 py-1.5 text-[11px] font-bold text-white" style={{ background: brand.primary }}>Book</span>
          </button>
        </div>
      )}

      {/* This week */}
      <SectionTitle>This week</SectionTitle>
      <div className="flex gap-2.5 overflow-x-auto px-3.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Special brand={brand} kicker={offer.kicker ?? "Tuesday"} title={offer.title} sub={offer.sub} tone="primary" />
        <Special brand={brand} kicker="Your month" title="Birthday bonus" sub={`+${POINTS.birthday} pts + a gift`} tone="accent" />
        <Special brand={brand} kicker="Bring a friend" title="Referral" sub={`+${POINTS.referral} pts each`} tone="soft" />
      </div>

      {/* Redeem now */}
      <SectionTitle action={<button type="button" onClick={() => go("rewards")} className="flex items-center text-[11px] font-semibold" style={{ color: brand.primary }}>See all <ChevronRight className="h-3 w-3" /></button>}>
        Redeem now
      </SectionTitle>
      <div className="grid grid-cols-2 gap-2.5 px-3.5">
        {rewards.slice(0, 4).map((r) => {
          const ok = points >= r.cost;
          return (
            <button key={r.id} type="button" onClick={() => go("rewards")} className="overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5">
              <span className="relative block aspect-[4/3] bg-zinc-100">
                <RewardImg reward={r} brand={brand} />
                {!ok && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/55"><Lock className="h-2.5 w-2.5 text-white" /></span>}
              </span>
              <span className="block p-2">
                <span className="line-clamp-1 block text-[11px] font-bold">{r.name}</span>
                <span className="mt-0.5 block text-[10px] font-semibold" style={{ color: ok ? "#059669" : "#71717a" }}>{ok ? "Ready to redeem" : `${r.cost.toLocaleString()} pts`}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function SpinCard({ brand, spun, onSpin }: { brand: LiveBrand; spun: boolean; onSpin: (n: number) => void }) {
  const [rot, setRot] = useState(0);
  const [busy, setBusy] = useState(false);
  const seg = 360 / WHEEL.length;
  const spin = () => {
    if (busy || spun) return;
    setBusy(true);
    const idx = 2; // lands on +250 — it's a demo, everyone wins
    const target = 360 * 6 + (360 - idx * seg - seg / 2);
    setRot(target);
    setTimeout(() => { setBusy(false); onSpin(WHEEL[idx]); }, 2300);
  };
  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-2xl p-3 text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${brand.accent}, ${brand.primary})` }}>
      <div className="relative h-[68px] w-[68px] shrink-0">
        <svg viewBox="-50 -50 100 100" className="h-full w-full drop-shadow" style={{ transform: `rotate(${rot}deg)`, transition: busy ? "transform 2.2s cubic-bezier(.12,.72,.14,1)" : "none" }} aria-hidden>
          {WHEEL.map((v, i) => {
            const a0 = (i * seg - 90) * (Math.PI / 180);
            const a1 = ((i + 1) * seg - 90) * (Math.PI / 180);
            const d = `M0 0 L${48 * Math.cos(a0)} ${48 * Math.sin(a0)} A48 48 0 0 1 ${48 * Math.cos(a1)} ${48 * Math.sin(a1)} Z`;
            return <path key={i} d={d} fill={i % 2 ? "#ffffff" : brand.secondary} stroke={brand.accent} strokeWidth="0.8" />;
          })}
          <circle r="9" fill={brand.accent} stroke="#fff" strokeWidth="2" />
        </svg>
        <span className="absolute left-1/2 top-[-3px] h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[9px] border-x-transparent border-t-white drop-shadow" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold">Daily Spin</div>
        <div className="text-[11px] text-white/80">{spun ? "You won today — back tomorrow" : "One free spin every day"}</div>
      </div>
      <button type="button" onClick={spin} disabled={busy || spun}
        className="rounded-full bg-white px-3.5 py-1.5 text-[12px] font-bold shadow disabled:opacity-60" style={{ color: brand.accent }}>
        {spun ? "Done" : busy ? "…" : "Spin"}
      </button>
    </div>
  );
}

function Special({ brand, kicker, title, sub, tone }: { brand: LiveBrand; kicker: string; title: string; sub: string; tone: "primary" | "accent" | "soft" }) {
  const style = tone === "primary"
    ? { background: `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})`, color: "#fff" }
    : tone === "accent"
      ? { background: `linear-gradient(135deg, ${brand.accent}, ${brand.primary})`, color: "#fff" }
      : { background: "#fff", color: "#18181b", boxShadow: "0 0 0 1px rgba(0,0,0,0.05)" };
  return (
    <div className="w-[150px] shrink-0 rounded-2xl p-3" style={style}>
      <div className="text-[9px] font-black uppercase tracking-widest opacity-80">{kicker}</div>
      <div className="mt-1 text-[13px] font-extrabold leading-tight">{title}</div>
      <div className="mt-0.5 text-[11px] opacity-85">{sub}</div>
    </div>
  );
}

/* ══════════════════════════ BOOK ══════════════════════════ */
function BookTab({ brand, categories, bookings, onPick }: { brand: LiveBrand; categories: LiveCategory[]; bookings: Booking[]; onPick: (r: LiveResource, c: LiveCategory) => void }) {
  const [cat, setCat] = useState(categories[0]?.id);
  const current = categories.find((c) => c.id === cat) ?? categories[0];
  return (
    <div className="px-3.5 pt-4">
      <h3 className="text-[22px] font-extrabold tracking-tight">Book</h3>
      {bookings.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {bookings.map((b, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-xl bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200">
              <CalendarCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-emerald-900">{b.resource} · {b.when}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => (
          <button key={c.id} type="button" onClick={() => setCat(c.id)}
            className="shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-colors"
            style={c.id === current?.id ? { background: brand.primary, color: "#fff" } : { background: "#fff", color: "#3f3f46", boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {current?.resources.map((r) => (
          <button key={r.id} type="button" onClick={() => onPick(r, current)} className="overflow-hidden rounded-xl bg-white text-left shadow-sm ring-1 ring-black/5 transition-transform active:scale-[.98]">
            <span className="relative block aspect-[4/3] overflow-hidden bg-zinc-100">
              {r.img
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={optimizedUrl(r.img, 300)} alt="" className="h-full w-full object-cover" />
                : <span className="flex h-full w-full items-end p-2 text-[15px] font-black leading-none text-white" style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.accent})` }}>{r.name}</span>}
            </span>
            <span className="block p-2">
              <span className="line-clamp-1 block text-[11.5px] font-bold">{r.name}</span>
              <span className="block text-[10px] text-zinc-500">{r.note ? `${r.note} · ` : ""}{r.minutes} min</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-[10.5px] text-zinc-500">Tap one to pick a time.</p>
    </div>
  );
}

function BookSheet({ brand, resource, cat, hours, onBook, onClose }: {
  brand: LiveBrand; resource: LiveResource; cat: LiveCategory; hours: Record<number, [number, number]>;
  onBook: (r: LiveResource, when: string) => void; onClose: () => void;
}) {
  const days = useMemo(() => {
    const out: Array<{ label: string; date: Date }> = [];
    const now = new Date();
    for (let i = 0; i < 4; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      out.push({ label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", day: "numeric" }), date: d });
    }
    return out;
  }, []);
  const [di, setDi] = useState(0);
  const [slot, setSlot] = useState<string | null>(null);
  const [pkg, setPkg] = useState(FLIPPOS_PACKAGES[0].id);
  const slots = useMemo(() => {
    const d = days[di].date;
    const wd = d.getDay() === 0 ? 7 : d.getDay();
    const [open, close] = hours[wd] ?? [10, 20];
    const step = resource.minutes >= 120 ? 2 : 1;
    const nowH = new Date().getHours() + 1;
    const out: string[] = [];
    for (let h = open; h + resource.minutes / 60 <= close; h += step) {
      if (di === 0 && h < nowH) continue;
      out.push(fmtHour(h));
    }
    return out;
  }, [di, days, hours, resource.minutes]);
  useEffect(() => { setSlot(null); }, [di]);
  useEffect(() => { if (di === 0 && slots.length === 0) setDi(1); }, [di, slots.length]);
  const isParty = cat.id === "party" && resource.id === "party";

  return (
    <div>
      <div className="flex items-start gap-3">
        {resource.img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedUrl(resource.img, 140)} alt="" className="h-14 w-14 rounded-xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-extrabold leading-tight">{resource.name}</div>
          <div className="text-[11px] text-zinc-500">{resource.minutes} min{resource.note ? ` · ${resource.note}` : ""}</div>
        </div>
        <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full bg-zinc-100" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>

      {isParty && (
        <div className="mt-3 grid gap-2">
          {FLIPPOS_PACKAGES.map((p) => (
            <button key={p.id} type="button" onClick={() => setPkg(p.id)} className="rounded-xl p-2.5 text-left ring-1 transition-colors"
              style={pkg === p.id ? { background: `${brand.primary}10`, boxShadow: `0 0 0 2px ${brand.primary}` } : { boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }}>
              <div className="text-[12.5px] font-bold">{p.name}</div>
              <div className="text-[10.5px] text-zinc-500">{p.blurb}</div>
            </button>
          ))}
        </div>
      )}

      <div className="mt-3.5 flex gap-1.5">
        {days.map((d, i) => (
          <button key={i} type="button" onClick={() => setDi(i)} className="flex-1 rounded-xl py-2 text-[11px] font-bold transition-colors"
            style={di === i ? { background: brand.primary, color: "#fff" } : { background: "#f4f4f5", color: "#3f3f46" }}>
            {d.label}
          </button>
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {slots.slice(0, 9).map((s) => (
          <button key={s} type="button" onClick={() => setSlot(s)} className="rounded-lg py-2 text-[12px] font-semibold ring-1 transition-colors"
            style={slot === s ? { background: `${brand.primary}14`, color: brand.primary, boxShadow: `0 0 0 2px ${brand.primary}` } : { color: "#27272a", boxShadow: "0 0 0 1px rgba(0,0,0,0.1)" }}>
            {s}
          </button>
        ))}
        {slots.length === 0 && <p className="col-span-3 py-2 text-center text-[11px] text-zinc-500">No times left — try another day.</p>}
      </div>
      <button type="button" disabled={!slot}
        onClick={() => slot && onBook(resource, `${days[di].label} ${slot}`)}
        className="mt-3.5 w-full rounded-xl py-3 text-[13px] font-bold text-white shadow disabled:opacity-40" style={{ background: brand.primary }}>
        {slot ? `Book ${days[di].label.toLowerCase()} at ${slot}` : "Pick a time"}
      </button>
    </div>
  );
}

/* ══════════════════════════ CHECK IN ══════════════════════════ */
function ScanTab({ brand, guest, visits, onCheckin, onEarnInfo }: { brand: LiveBrand; guest: string; visits: number; onCheckin: () => void; onEarnInfo: (t: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const run = () => {
    if (scanning) return;
    setScanning(true);
    setTimeout(() => { setScanning(false); onCheckin(); }, 1300);
  };
  return (
    <div className="px-3.5 pt-4 text-center">
      <h3 className="text-[20px] font-extrabold tracking-tight">Show this at the desk</h3>
      <p className="mt-0.5 text-[11.5px] text-zinc-500">Staff scan it — your points land instantly.</p>
      <div className="relative mx-auto mt-3.5 rounded-3xl p-5" style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})` }}>
        <div className="relative mx-auto w-[170px] overflow-hidden rounded-2xl bg-white p-3.5">
          <QRCode value={`atlas-demo:${guest}:${visits}`} size={142} fgColor="#0b1220" style={{ height: "auto", width: "100%" }} />
          {scanning && <span className="la-scanline absolute inset-x-2 h-[3px] rounded-full shadow-[0_0_12px_2px_rgba(16,185,129,.8)]" style={{ background: "#10b981" }} />}
        </div>
        <div className="mt-2.5 text-[10px] uppercase tracking-[0.2em] text-white/80">Member</div>
        <div className="font-mono text-[18px] font-bold tracking-[0.2em] text-white">{guest.slice(0, 3).toUpperCase()}-4821</div>
      </div>
      <button type="button" onClick={run} disabled={scanning}
        className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-[13px] font-bold text-white shadow disabled:opacity-70">
        <QrCode className="h-4 w-4" aria-hidden /> {scanning ? "Scanning…" : "Try it: staff scans you"}
      </button>
      <div className="mt-2 text-[11px] text-zinc-500">{visits} visits · +{POINTS.visit} pts every visit</div>

      <div className="mt-4 space-y-2 text-left">
        <EarnRow brand={brand} icon={<Star className="h-4 w-4" />} title="Leave a Google review" pts={POINTS.review} onClick={() => onEarnInfo("Opens your Google review page")} />
        <EarnRow brand={brand} icon={<Users className="h-4 w-4" />} title="Refer a friend" pts={POINTS.referral} onClick={() => onEarnInfo("Share link copied")} />
      </div>
    </div>
  );
}

function EarnRow({ brand, icon, title, pts, onClick }: { brand: LiveBrand; icon: React.ReactNode; title: string; pts: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
      <span className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})` }}>{icon}</span>
      <span className="flex-1 text-[12.5px] font-bold">{title}</span>
      <span className="rounded-full px-2.5 py-1 text-[11px] font-extrabold text-white" style={{ background: brand.primary }}>+{pts.toLocaleString()}</span>
    </button>
  );
}

/* ══════════════════════════ REWARDS ══════════════════════════ */
function RewardsTab({ brand, guest, points, rewards, tierName, onRedeem }: { brand: LiveBrand; guest: string; points: number; rewards: LiveReward[]; tierName: string; onRedeem: (r: LiveReward) => void }) {
  return (
    <div className="px-3.5 pt-4">
      <h3 className="text-[22px] font-extrabold tracking-tight">Rewards</h3>
      <div className="relative mt-3 flex min-h-[150px] flex-col overflow-hidden rounded-3xl p-4 text-white" style={loyaltyCardSurface(loyaltyCardRamp(brand.primary, brand.secondary))}>
        <span className="pointer-events-none absolute inset-0" style={loyaltyCardSheen(0)} />
        <div className="relative flex items-start justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">{short(brand.name)}</div>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">{tierName}</span>
        </div>
        <div className="relative mt-auto">
          <div className="text-[34px] font-extrabold leading-none tracking-tight tabular-nums"><CountUp value={points} /></div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-white/85"><span>points</span><span>{guest}</span></div>
        </div>
      </div>
      <div className="mt-4 space-y-2.5">
        {rewards.map((r) => {
          const ok = points >= r.cost;
          const pct = Math.min(100, (points / r.cost) * 100);
          return (
            <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-black/5">
              <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-zinc-100"><RewardImg reward={r} brand={brand} /></span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 block text-[12.5px] font-bold">{r.name}</span>
                <span className="block text-[10.5px] font-semibold text-zinc-500">{r.cost.toLocaleString()} pts</span>
                {!ok && <span className="mt-1 block h-1 overflow-hidden rounded-full bg-zinc-100"><span className="block h-full rounded-full" style={{ width: `${pct}%`, background: brand.primary }} /></span>}
              </span>
              <button type="button" onClick={() => onRedeem(r)} disabled={!ok}
                className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold disabled:bg-zinc-100 disabled:text-zinc-400"
                style={ok ? { background: brand.primary, color: "#fff" } : undefined}>
                {ok ? "Redeem" : <Lock className="h-3.5 w-3.5" aria-label="Locked" />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RedeemSheet({ brand, reward, code, onClose }: { brand: LiveBrand; reward: LiveReward; code: string; onClose: () => void }) {
  const [left, setLeft] = useState(15 * 60);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-center">
      <div className="relative mx-auto h-20 w-20 overflow-hidden rounded-2xl bg-zinc-100"><RewardImg reward={reward} brand={brand} /></div>
      <div className="mt-2.5 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: brand.primary }}>Show the desk</div>
      <div className="mt-0.5 text-[17px] font-extrabold leading-tight">{reward.name}</div>
      <div className="mx-auto mt-3 w-fit rounded-2xl border-2 border-dashed px-5 py-2.5 font-mono text-[26px] font-black tracking-[0.25em]" style={{ borderColor: brand.primary, color: brand.accent }}>{code}</div>
      <div className="mt-2 text-[11px] text-zinc-500">Valid for {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")} · the desk marks it used</div>
      <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl py-3 text-[13px] font-bold text-white" style={{ background: brand.primary }}>Done</button>
    </div>
  );
}

/* ══════════════════════════ MEMBER ══════════════════════════ */
function MemberTab({ brand, guest, lifetime, visits, note }: { brand: LiveBrand; guest: string; lifetime: number; visits: number; note: string }) {
  const idx = FLIPPOS_TIERS.reduce((a, t, i) => (lifetime >= t.min ? i : a), 0);
  const nextTier = FLIPPOS_TIERS[idx + 1];
  const pct = nextTier ? ((lifetime - FLIPPOS_TIERS[idx].min) / (nextTier.min - FLIPPOS_TIERS[idx].min)) * 100 : 100;
  return (
    <div className="px-3.5 pt-4">
      <h3 className="text-[22px] font-extrabold tracking-tight">Member</h3>
      <div className="relative mt-3 overflow-hidden rounded-3xl bg-zinc-900 p-4 text-white">
        <span className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-2xl" style={{ background: `${brand.primary}88` }} />
        <div className="relative flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70"><Crown className="h-3.5 w-3.5" style={{ color: brand.secondary }} /> {FLIPPOS_TIERS[idx].name} member</div>
        <div className="relative mt-3 text-[20px] font-extrabold">{guest}</div>
        <div className="relative text-[11px] text-white/60">{visits} visits · {lifetime.toLocaleString()} lifetime pts</div>
        {nextTier && (
          <div className="relative mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: brand.secondary }} /></div>
            <div className="mt-1 text-[10.5px] text-white/70">{(nextTier.min - lifetime).toLocaleString()} pts to {nextTier.name}</div>
          </div>
        )}
      </div>
      <div className="mt-4 space-y-2">
        {FLIPPOS_TIERS.map((t, i) => {
          const on = i === idx;
          const done = i < idx;
          return (
            <div key={t.name} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1" style={{ boxShadow: on ? `0 0 0 2px ${brand.primary}` : undefined, borderColor: "transparent" }}>
              <span className="grid h-9 w-9 place-items-center rounded-full text-white" style={{ background: done || on ? brand.primary : "#d4d4d8" }}>
                {done ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold">{t.name} <span className="font-medium text-zinc-400">· {t.min.toLocaleString()}+</span></span>
                <span className="block truncate text-[11px] text-zinc-500">{t.perks.join(" · ")}</span>
              </span>
              {on && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: brand.primary }}>You</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white p-3 text-[11.5px] text-zinc-600 shadow-sm ring-1 ring-black/5">
        <Ticket className="h-4 w-4 shrink-0" style={{ color: brand.primary }} /> {note}
      </div>
    </div>
  );
}

/* ══════════════════════════ bits ══════════════════════════ */
function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-5 flex items-center justify-between px-3.5">
      <h4 className="text-[14px] font-extrabold tracking-tight">{children}</h4>
      {action}
    </div>
  );
}

function BrandMark({ brand }: { brand: LiveBrand }) {
  if (brand.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={optimizedUrl(brand.logoUrl, 240)} alt={brand.name} className="h-8 max-w-[120px] object-contain" />;
  }
  return (
    <span className="flex max-w-[150px] items-center gap-1.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-black text-white" style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.accent})` }}>{initials(brand.name)}</span>
      <span className="truncate text-[13px] font-extrabold" style={{ color: brand.primary }}>{short(brand.name)}</span>
    </span>
  );
}

function RewardImg({ reward, brand }: { reward: LiveReward; brand: LiveBrand }) {
  if (reward.img) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={optimizedUrl(reward.img, 240)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />;
  }
  return <span className="absolute inset-0 grid place-items-center" style={{ background: `${brand.primary}18`, color: brand.primary }}><Gift className="h-6 w-6" /></span>;
}

function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(value); from.current = value; return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(start + (value - start) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value]);
  return <>{shown.toLocaleString()}</>;
}

function fmtHour(h: number) {
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:00 ${h < 12 ? "AM" : "PM"}`;
}
function deskCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => a[Math.floor(Math.random() * a.length)]).join("");
}
export function initials(name: string) {
  return name.replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "A";
}
function short(name: string) {
  return name.replace(/\s*(&|and)\s.*$/i, "").trim() || name;
}

async function burst(el: HTMLElement | null, color: string) {
  if (!el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  try {
    const { default: confetti } = await import("canvas-confetti");
    const r = el.getBoundingClientRect();
    confetti({
      particleCount: 70, spread: 70, startVelocity: 32, ticks: 160, scalar: 0.9,
      origin: { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height * 0.4) / window.innerHeight },
      colors: [color, "#ffffff", "#fbbf24", "#38bdf8"],
    });
  } catch {}
}
