"use client";
/**
 * WalletRail — CP-143.
 *
 * One section for everything the customer already holds.
 *
 * Before this, "Saved gifts" and "Your active rewards" were two separate
 * stacked sections with two headings, two empty states and two visual
 * treatments. To a customer they are the same thing — stuff that is mine and
 * that expires — and the only difference is bookkeeping: one came from
 * tapping "save" on an offer, the other from spending points. So they merge,
 * sorted by the only axis that matters to someone holding them: what dies
 * first.
 *
 * What stays separate, on purpose: LimitedOffersSection. Those are offers you
 * can CLAIM and do not own yet. Different verb, different lane — merging them
 * in would have been tidier and wrong.
 *
 * Four states, because a rail that only looks right at three items is a bug
 * waiting for a busy Saturday:
 *   0 items  → renders nothing at all, heading included
 *   1 item   → full-width hero; a lone tile beside whitespace reads as broken
 *   2–5      → the rail
 *   6+       → rail capped at 5, then a "See all N" tile that expands in place
 *
 * The count lives in the heading. The standing failure of horizontal rails is
 * that you cannot tell how far they run, so people never scroll them.
 */
import { useEffect, useMemo, useState } from "react";
import { Clock, ChevronRight, Gift, Ticket } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MarqueeHeading } from "./marquee-heading";
import { RedemptionDetail } from "./redemption-detail";
import { SavedGiftDetail } from "./saved-gift-detail";
import type { ActiveRedemption } from "./active-redemptions";
import type { Business } from "@/lib/types/database";

type SavedOffer = {
  saved_id: string; offer_id: string; title: string;
  description: string | null; image_url: string | null;
  discount_type: "none" | "percent" | "flat_cents" | "points_bonus" | "reward" | null;
  discount_value: number | null;
  expires_at: string | null; voice_message_url: string | null;
  redeem_code: string | null; fulfilled_at: string | null; saved_at: string;
  gift_reward_id?: string | null; gift_reward_name?: string | null;
};

/** One thing the customer holds, whatever produced it. */
type WalletItem = {
  key: string;
  kind: "redemption" | "gift";
  title: string;
  image: string | null;
  /** null = never expires; those sort last. */
  expiresAt: string | null;
  code: string | null;
  redemption?: ActiveRedemption;
  gift?: SavedOffer;
};

const VISIBLE_CAP = 5;

/** Live countdown. Returns null when there is no deadline to show. */
function countdown(expiresAt: string | null, now: number): { label: string; urgent: boolean } | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return { label: "Expired", urgent: true };
  const mins = Math.floor(ms / 60_000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return { label: `${days} day${days === 1 ? "" : "s"} left`, urgent: days <= 3 };
  if (hours >= 1) return { label: `${hours} hr${hours === 1 ? "" : "s"} left`, urgent: true };
  return { label: `${Math.max(1, mins)} min left`, urgent: true };
}

export function WalletRail({
  business, initialRedemptions, membershipId,
}: {
  business: Business;
  initialRedemptions: ActiveRedemption[];
  membershipId: string | null;
}) {
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;

  const [redemptions, setRedemptions] = useState(initialRedemptions);
  const [gifts, setGifts] = useState<SavedOffer[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [openRedemption, setOpenRedemption] = useState<ActiveRedemption | null>(null);
  const [openGift, setOpenGift] = useState<SavedOffer | null>(null);

  // 30s tick: granular enough that the last-hour panic is visible, cheap
  // enough not to wake an idle tab. Same cadence the old sections used.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Saved gifts + realtime, carried over from SavedGiftsSection so a save
  // still lands here without a refresh.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const load = async () => {
      const { data, error } = await supabase.rpc("my_saved_offers", { p_business_id: business.id });
      if (cancelled) return;
      // RPC missing on an older database: render nothing rather than an error row.
      setGifts(error ? [] : ((data ?? []) as SavedOffer[]));
    };
    load();

    if (!membershipId) return () => { cancelled = true; };
    const ch = supabase
      .channel(`wallet-${membershipId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "customer_saved_offers", filter: `membership_id=eq.${membershipId}` },
        () => load())
      .on("postgres_changes",
        { event: "*", schema: "public", table: "redemptions", filter: `membership_id=eq.${membershipId}` },
        async () => {
          const { data } = await supabase.rpc("my_redemptions", { p_business_id: business.id });
          if (!cancelled && data) setRedemptions(data as ActiveRedemption[]);
        })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [business.id, membershipId]);

  /**
   * Merge and sort. Soonest deadline first, no-expiry last — arrival order is
   * irrelevant to someone deciding what to use today. Anything already
   * fulfilled or expired drops out; it is not in your wallet any more.
   */
  const items: WalletItem[] = useMemo(() => {
    const live: WalletItem[] = [];

    for (const r of redemptions) {
      if (r.fulfilled_at) continue;
      if (r.expires_at && new Date(r.expires_at).getTime() <= now) continue;
      live.push({
        key: `r-${r.id}`, kind: "redemption", title: r.reward_name,
        image: r.reward_image ?? null, expiresAt: r.expires_at, code: r.code, redemption: r,
      });
    }
    for (const g of gifts) {
      if (g.fulfilled_at) continue;
      if (g.expires_at && new Date(g.expires_at).getTime() <= now) continue;
      live.push({
        key: `g-${g.saved_id}`, kind: "gift",
        title: g.gift_reward_name || g.title,
        image: g.image_url, expiresAt: g.expires_at, code: g.redeem_code, gift: g,
      });
    }

    return live.sort((a, b) => {
      if (!a.expiresAt && !b.expiresAt) return 0;
      if (!a.expiresAt) return 1;
      if (!b.expiresAt) return -1;
      return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
    });
  }, [redemptions, gifts, now]);

  function open(it: WalletItem) {
    if (it.kind === "redemption" && it.redemption) setOpenRedemption(it.redemption);
    if (it.kind === "gift" && it.gift) setOpenGift(it.gift);
  }

  const modals = (
    <>
      {openRedemption && (
        <RedemptionDetail business={business} redemption={openRedemption} onClose={() => setOpenRedemption(null)} />
      )}
      {openGift && (
        <SavedGiftDetail gift={openGift} primary={primary} secondary={secondary} onClose={() => setOpenGift(null)} />
      )}
    </>
  );

  // ── 0 items: the whole section disappears ─────────────────────────────────
  // An empty "Your wallet" with an apology underneath is worse than no wallet.
  if (items.length === 0) return null;

  const heading = (
    <MarqueeHeading
      primary={primary}
      secondary={secondary}
      chip={items.length > 1 ? `${items.length} ITEM${items.length === 1 ? "" : "S"}` : null}
      rule={false}
      className="mb-2.5"
    >
      Your wallet
    </MarqueeHeading>
  );

  const Thumb = ({ it, size }: { it: WalletItem; size: string }) =>
    it.image ? (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={it.image} alt="" className={`${size} rounded-xl object-cover`} />
    ) : (
      <div className={`${size} rounded-xl grid place-items-center`} style={{ background: `${primary}22` }}>
        {it.kind === "gift"
          ? <Gift className="h-6 w-6" style={{ color: primary }} />
          : <Ticket className="h-6 w-6" style={{ color: primary }} />}
      </div>
    );

  // ── 1 item: full-width hero ───────────────────────────────────────────────
  if (items.length === 1) {
    const it = items[0];
    const cd = countdown(it.expiresAt, now);
    return (
      <div className="px-4 mt-5">
        {heading}
        <button
          onClick={() => open(it)}
          className="w-full text-left rounded-2xl p-3 grid grid-cols-[72px_1fr_auto] gap-3 items-center text-white"
          style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}
        >
          <Thumb it={it} size="h-[62px] w-[72px]" />
          <div className="min-w-0">
            <div className="text-[9.5px] font-black tracking-[0.11em] opacity-85">
              {it.kind === "gift" ? "SAVED GIFT" : "ACTIVE REWARD"}
            </div>
            <div className="text-base font-black leading-tight truncate">{it.title}</div>
            {it.code && (
              <div className="mt-0.5 inline-block rounded bg-white/20 px-1.5 py-0.5 text-[11px] font-bold tracking-[0.09em]">
                {it.code}
              </div>
            )}
            {cd && (
              <div className={`mt-1.5 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10.5px] font-black ${cd.urgent ? "text-rose-600" : "text-zinc-600"}`}>
                <Clock className="h-3 w-3" /> {cd.label}
              </div>
            )}
          </div>
          <ChevronRight className="h-5 w-5 opacity-80" />
        </button>
        {modals}
      </div>
    );
  }

  // ── 2+ items: the rail ────────────────────────────────────────────────────
  const shown = expanded ? items : items.slice(0, VISIBLE_CAP);
  const hiddenCount = items.length - shown.length;

  const Tile = ({ it }: { it: WalletItem }) => {
    const cd = countdown(it.expiresAt, now);
    return (
      <button
        onClick={() => open(it)}
        className={`shrink-0 w-[152px] rounded-2xl border bg-white p-2 text-left transition ${cd?.urgent ? "border-rose-400" : "border-zinc-200"}`}
      >
        <Thumb it={it} size="h-[56px] w-full" />
        <div className="mt-1.5 text-[12px] font-black leading-tight line-clamp-2 min-h-[30px] text-zinc-900">
          {it.title}
        </div>
        <div className={`mt-0.5 text-[10px] font-black ${cd?.urgent ? "text-rose-600" : "text-zinc-500"}`}>
          {cd?.label ?? (it.kind === "gift" ? "Saved gift" : "Ready to use")}
        </div>
      </button>
    );
  };

  return (
    <div className="px-4 mt-5">
      {heading}
      <div
        className={expanded ? "grid grid-cols-2 gap-2.5" : "flex gap-2.5 overflow-x-auto pb-1.5 -mx-4 px-4 snap-x"}
      >
        {shown.map(it => <Tile key={it.key} it={it} />)}

        {/* CP-143: the overflow door lives IN the rail, not as a button
            parked underneath. You meet it by scrolling, which is exactly
            when you want it; a button below the rail gets missed because
            nothing above it suggests there is more. */}
        {!expanded && hiddenCount > 0 && (
          <button
            onClick={() => setExpanded(true)}
            className="shrink-0 w-[112px] rounded-2xl grid place-items-center text-white font-black"
            style={{ background: primary }}
          >
            <span className="text-center leading-tight">
              <span className="block text-xl">→</span>
              <span className="block text-[11.5px] mt-0.5">See all {items.length}</span>
            </span>
          </button>
        )}
      </div>

      {expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-2.5 w-full rounded-xl border border-zinc-200 bg-white py-2 text-[12px] font-black text-zinc-500"
        >
          Show less
        </button>
      )}
      {modals}
    </div>
  );
}
