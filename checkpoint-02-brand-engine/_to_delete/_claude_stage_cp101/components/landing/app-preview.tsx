"use client";
import { Bell, Flame, Gift, Home, QrCode, Star, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Industry } from "@/lib/landing/industries";

/**
 * Mock customer-app screen — CP-100.
 * A faithful, lightweight impression of the real Atlas customer Home tab
 * (header + loyalty card + rewards + streak/spin cards + bottom nav),
 * re-themed entirely from an Industry record. Pure CSS; no images.
 */
export function AppScreen({ brand, className, animateProgress = true }: { brand: Industry; className?: string; animateProgress?: boolean }) {
  const pct = Math.min(100, Math.round((brand.points / brand.goal) * 100));
  return (
    <div
      className={cn("flex h-full w-full flex-col text-[11px] text-zinc-800 transition-colors duration-500", className)}
      style={{ background: brand.tint }}
      data-brand={brand.id}
    >
      {/* Header */}
      <div className="px-4 pb-4 pt-8 text-white transition-colors duration-500" style={{ background: brand.primary }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="grid h-8 w-8 place-items-center rounded-lg text-[11px] font-bold shadow-inner"
              style={{ background: brand.secondary, color: brand.primary }}
              aria-hidden
            >
              {brand.initials}
            </div>
            <div>
              <div className="text-[12px] font-semibold leading-tight">{brand.name}</div>
              <div className="text-[9.5px] opacity-75">{brand.tagline}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15">
              <QrCode className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="relative grid h-7 w-7 place-items-center rounded-full bg-white/15">
              <Bell className="h-3.5 w-3.5" aria-hidden />
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-400 ring-2" style={{ "--tw-ring-color": brand.primary } as React.CSSProperties} />
            </span>
          </div>
        </div>

        {/* Loyalty card */}
        <div className="mt-4 rounded-xl bg-white/10 p-3 ring-1 ring-white/15 backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] uppercase tracking-wider opacity-75">Your points</span>
            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold" style={{ background: brand.secondary, color: brand.primary }}>
              Member
            </span>
          </div>
          <div className="mt-0.5 text-[26px] font-bold leading-none tabular-nums">{brand.points.toLocaleString()}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div
              className={cn("h-full rounded-full", animateProgress && "transition-[width] duration-700 ease-out")}
              style={{ width: `${pct}%`, background: brand.secondary }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[9px] opacity-80">
            <span>{brand.goal - brand.points} to go</span>
            <span>{brand.reward}</span>
          </div>
        </div>
      </div>

      {/* Featured offer */}
      <div className="px-3 pt-3">
        <div className="flex items-center gap-2.5 rounded-xl border bg-white p-2.5 shadow-sm" style={{ borderColor: brand.secondary }}>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: brand.tint }}>
            <Gift className="h-4 w-4" style={{ color: brand.primary }} aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold">{brand.offer}</div>
            <div className="text-[9.5px] text-zinc-500">{brand.offerSub}</div>
          </div>
          <span className="ml-auto rounded-md px-2 py-1 text-[9px] font-semibold text-white" style={{ background: brand.primary }}>
            Claim
          </span>
        </div>
      </div>

      {/* Rewards grid */}
      <div className="px-3 pt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold">Rewards</span>
          <span className="text-[9.5px]" style={{ color: brand.primary }}>
            View all
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-black/5">
            <Trophy className="h-4 w-4" style={{ color: brand.secondary }} aria-hidden />
            <div className="mt-1.5 text-[10.5px] font-semibold leading-tight">{brand.reward}</div>
            <div className="mt-1 text-[9px] text-zinc-500">{brand.rewardCost.toLocaleString()} pts</div>
          </div>
          <div className="rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-black/5">
            <Users className="h-4 w-4" style={{ color: brand.secondary }} aria-hidden />
            <div className="mt-1.5 text-[10.5px] font-semibold leading-tight">Refer a friend</div>
            <div className="mt-1 text-[9px] text-zinc-500">{brand.referral.split("→")[1]?.trim() ?? "Bonus points"}</div>
          </div>
        </div>
      </div>

      {/* Streak + spin */}
      <div className="grid grid-cols-2 gap-2 px-3 pt-3">
        <div className="rounded-xl p-2.5 text-white" style={{ background: `linear-gradient(135deg, ${brand.primary}, ${brand.secondary})` }}>
          <Flame className="h-4 w-4" aria-hidden />
          <div className="mt-1 text-[10.5px] font-semibold leading-tight">{brand.streakLabel}</div>
          <div className="text-[9px] opacity-80">Keep it going</div>
        </div>
        <div className="rounded-xl bg-white p-2.5 shadow-sm ring-1 ring-black/5">
          <Star className="h-4 w-4" style={{ color: brand.primary }} aria-hidden />
          <div className="mt-1 text-[10.5px] font-semibold leading-tight">Daily spin</div>
          <div className="text-[9px] text-zinc-500">Win up to {brand.wheelPrize}</div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="mt-auto flex items-center justify-around border-t border-black/5 bg-white px-2 pb-4 pt-2 text-[9px] text-zinc-400">
        <span className="flex flex-col items-center gap-0.5 font-semibold" style={{ color: brand.primary }}>
          <Home className="h-4 w-4" aria-hidden /> Home
        </span>
        <span className="flex flex-col items-center gap-0.5">
          <Gift className="h-4 w-4" aria-hidden /> Rewards
        </span>
        <span className="flex flex-col items-center gap-0.5">
          <QrCode className="h-4 w-4" aria-hidden /> Check-in
        </span>
        <span className="flex flex-col items-center gap-0.5">
          <Flame className="h-4 w-4" aria-hidden /> Streaks
        </span>
      </div>
    </div>
  );
}

/** Dark, premium phone shell sized for the landing page. */
export function Phone({ children, className, width = 300 }: { children: React.ReactNode; className?: string; width?: number }) {
  return (
    <div className={cn("relative mx-auto", className)} style={{ width }}>
      <div className="rounded-[2.6rem] bg-[#1a1f29] p-[7px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06)]">
        <div className="rounded-[2.2rem] bg-black p-[3px]">
          <div className="relative overflow-hidden rounded-[2rem] bg-white" style={{ aspectRatio: "9 / 19.2" }}>
            <div className="absolute left-1/2 top-2 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-black" aria-hidden />
            <div className="absolute inset-0">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
