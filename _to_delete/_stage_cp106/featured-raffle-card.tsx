"use client";
/**
 * FeaturedRaffleCard — CP-85.1
 *
 * The raffle edition of the Home tab's big Featured Offer card. Same glow
 * ring + ribbon grammar as the offer card (CP-26/CP-53), raffle-flavored:
 * "🎟️ Giveaway" ribbon, prize headline, live countdown, entry-cost chip,
 * and a big "Enter the giveaway" button that jumps to the Rewards tab
 * where the entry flow lives.
 *
 * Fully client-side: fetches featured_raffle() itself, subscribes to
 * realtime on the raffles table, and renders nothing when the business
 * has no featured raffle that's scheduled or open. Renders ABOVE the
 * featured offer card — a live giveaway is the bigger hype moment.
 */
import { useEffect, useState } from "react";
import { Clock, Ticket, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { type FeaturedRaffle, formatCountdown, formatRaffleTime } from "@/lib/raffles";
import type { Business } from "@/lib/types/database";

export function FeaturedRaffleCard({
  business, slug,
}: {
  business: Business;
  /** URL slug — the Enter button links to /{slug}/app/rewards. */
  slug: string;
}) {
  const [raffle, setRaffle] = useState<FeaturedRaffle | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const primary = business.brand_colors.primary;
  const sec = business.brand_colors.secondary || primary;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const load = async () => {
      const { data } = await supabase.rpc("featured_raffle", { p_business_id: business.id });
      if (!cancelled) setRaffle(((data as any)?.[0] ?? null) as FeaturedRaffle | null);
    };
    load();
    const ch = supabase
      .channel(`featured-raffle-${business.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "raffles", filter: `business_id=eq.${business.id}` },
        load,
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [business.id]);

  if (!raffle) return null;

  const endMs = new Date(raffle.ends_at).getTime();
  const startMs = new Date(raffle.starts_at).getTime();
  const open = raffle.state === "open" && endMs > now;
  const scheduled = raffle.state === "scheduled" || startMs > now;
  if (endMs <= now) return null; // just ended — RafflesSection shows the result

  const free = raffle.entry_cost_points <= 0;

  return (
    <div className="px-4 mt-5">
      <div
        className="relative rounded-3xl p-[3px]"
        style={{
          // Same brand-gradient glow ring as the featured offer card —
          // that ring IS the "featured" signal (CP-53).
          background: `linear-gradient(135deg, ${sec} 0%, ${primary} 50%, ${business.brand_colors.accent} 100%)`,
          boxShadow: `0 0 0 4px ${primary}11, 0 12px 30px -8px ${primary}55`,
        }}
      >
        {/* 🎟️ GIVEAWAY ribbon top-left */}
        <span
          className="absolute -top-2.5 left-3 z-10 inline-flex items-center gap-1 text-[9px] font-black tracking-widest uppercase px-2 py-1 rounded-full text-white shadow"
          style={{ background: `linear-gradient(135deg, ${primary}, ${sec})` }}
        >
          <Ticket className="h-2.5 w-2.5" /> Giveaway
        </span>

        <div className="rounded-[20px] overflow-hidden bg-white">
          {/* Hero */}
          <div className="relative">
            {raffle.image_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={raffle.image_url} alt={raffle.title} className="h-40 w-full object-cover" />
            ) : (
              <div className="h-40 flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${primary} 0%, ${sec} 100%)` }}>
                <Trophy className="h-12 w-12 text-white/85" />
              </div>
            )}
            {/* Countdown badge over the image */}
            <div className="absolute top-2.5 right-2.5">
              {open ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-black/60 text-white backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                  <Clock className="h-2.5 w-2.5" /> {formatCountdown(Math.max(0, endMs - now))} left
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-black/60 text-white backdrop-blur-sm">
                  <Clock className="h-2.5 w-2.5" /> Starts in {formatCountdown(Math.max(0, startMs - now))}
                </span>
              )}
            </div>
          </div>

          <div className="p-4">
            {/* Billboard headline — same weight/tracking as the featured
                offer headline (CP-46). */}
            <div className="text-xl font-black leading-[1.05] tracking-[-0.02em] text-zinc-900">
              {raffle.title}
            </div>
            <div className="text-[13px] mt-1.5 leading-snug text-zinc-500">
              🏆 Win <span className="font-bold text-zinc-700">{raffle.prize}</span>
              {raffle.description ? ` — ${raffle.description}` : ""}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span
                className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-1 rounded-full text-white shadow-sm"
                style={{ background: free ? "linear-gradient(135deg, #10b981, #059669)" : `linear-gradient(135deg, ${primary}, ${sec})` }}
              >
                <Ticket className="h-2.5 w-2.5" />
                {free ? "FREE ENTRY" : `${raffle.entry_cost_points.toLocaleString()} pts / entry`}
              </span>
              {raffle.total_entries > 0 && (
                <span className="inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-full bg-zinc-100 text-zinc-600">
                  {raffle.total_entries.toLocaleString()} entr{raffle.total_entries === 1 ? "y" : "ies"} so far
                </span>
              )}
            </div>

            {/* The button — jumps to the Rewards tab where the entry flow
                (confirmation + atomic charge) lives. */}
            <a
              href={`/${slug}/app/rewards`}
              className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-2xl py-3 text-sm font-extrabold text-white shadow-lg active:scale-[0.99] transition"
              style={{
                background: `linear-gradient(135deg, ${primary}, ${sec})`,
                boxShadow: `var(--atlas-cta-glow, 0 10px 22px -8px ${primary}aa)`,
              }}
            >
              <Ticket className="h-4 w-4" />
              {open ? "Enter the giveaway" : `Opens ${formatRaffleTime(raffle.starts_at, raffle.timezone)}`}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
