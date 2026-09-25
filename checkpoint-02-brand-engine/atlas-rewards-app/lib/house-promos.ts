/**
 * House promos — CP-153 · the top banner never goes dark
 *
 * Priority for the sticky banner (featured-offer-banner.tsx):
 *   1. featured OPEN raffle
 *   2. any active offer — featured first, which is exactly where Automated
 *      Offers publish to, so they always win over these
 *   3. house promos (this file): rotating, number-driven nudges built from
 *      the business's own live config — points to the next reward, the
 *      wheel's top prize, how many cages are bookable, the member plan.
 *
 * `house_promo_facts` (cp153 SQL) is ONE round-trip; this turns it into copy.
 * Nothing here is stored — it recomputes on every layout render, so the
 * numbers are never stale.
 */
import type { Membership } from "@/lib/types/database";

export type HousePromoFacts = {
  reward_count: number;
  cheapest_reward_name: string | null; cheapest_reward_cost: number | null;
  top_reward_name: string | null;      top_reward_cost: number | null;
  wheel_max_points: number;            wheel_has_prize: boolean;
  booking_count: number;               booking_first_name: string | null; booking_unit_label: string | null;
  membership_enabled: boolean;         membership_name: string | null;
  membership_price_cents: number | null; membership_multiplier: number | null;
  is_paid_member: boolean;
};

export type HousePromo = {
  /** Stable key for the rotator. */
  id: string;
  /** Uppercase-ish headline shown where the offer title normally sits. */
  text: string;
  /** Short call to action in the white pill. */
  pill: string;
  /** In-app path relative to the app base ("/rewards", "/book", …). */
  href: string;
  /** Red pulsing dot on the pill — reserved for time/points urgency. */
  urgent?: boolean;
  /** lucide icon name hint for the banner. */
  icon: "gift" | "sparkles" | "calendar" | "crown" | "zap";
};

const fmtPts = (n: number) => n.toLocaleString();
const fmtPrice = (cents: number) => cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

export function buildHousePromos(
  facts: HousePromoFacts | null,
  membership: Pick<Membership, "points_balance"> | null,
  opts: { bookingEnabled: boolean; membershipTabLabel?: string },
): HousePromo[] {
  if (!facts) return [];
  const out: HousePromo[] = [];
  const pts = membership?.points_balance ?? 0;

  // 1 · Points urgency — the line that does the most work.
  if (facts.cheapest_reward_name && facts.cheapest_reward_cost != null) {
    const gap = facts.cheapest_reward_cost - pts;
    if (gap > 0) {
      out.push({
        id: "gap", icon: "zap", urgent: gap <= Math.max(100, facts.cheapest_reward_cost * 0.25),
        text: `${fmtPts(gap)} pts to ${facts.cheapest_reward_name}`,
        pill: "Earn more →", href: "/scan",
      });
    } else {
      // Something is already claimable — say so first, every time.
      out.unshift({
        id: "ready", icon: "gift", urgent: true,
        text: `${facts.cheapest_reward_name} is ready to claim`,
        pill: `${fmtPts(pts)} pts banked →`, href: "/rewards",
      });
    }
  }

  // 2 · Daily spin — the headline number is the best points wedge.
  if (facts.wheel_max_points > 0) {
    out.push({
      id: "spin", icon: "sparkles",
      text: `Daily spin · win up to ${fmtPts(facts.wheel_max_points)} pts${facts.wheel_has_prize ? " + prizes" : ""}`,
      pill: "Spin →", href: "/scan",
    });
  }

  // 3 · Booking — count + resource name, from the live resource list.
  if (opts.bookingEnabled && facts.booking_count > 0) {
    const unit = (facts.booking_unit_label || facts.booking_first_name || "slot").toLowerCase();
    out.push({
      id: "book", icon: "calendar",
      text: facts.booking_count > 1
        ? `${facts.booking_count} ${unit}s open to book · pick your time`
        : `Book a ${unit} online · pick your time`,
      pill: "Book →", href: "/book",
    });
  }

  // 4 · Membership — only for people who haven't joined yet.
  if (facts.membership_enabled && !facts.is_paid_member) {
    const name = facts.membership_name || (opts.membershipTabLabel ?? "Membership");
    const mult = facts.membership_multiplier && Number(facts.membership_multiplier) > 1 ? Number(facts.membership_multiplier) : null;
    const price = facts.membership_price_cents && facts.membership_price_cents > 0 ? fmtPrice(facts.membership_price_cents) : null;
    const bits = [mult ? `${mult}× points every visit` : null, price ? `from ${price}/mo` : null].filter(Boolean);
    out.push({
      id: "member", icon: "crown",
      text: bits.length ? `${name} · ${bits.join(" · ")}` : `${name} · perks every visit`,
      pill: "Join →", href: "/membership",
    });
  }

  // 5 · Catalogue size — the quiet fallback so there's always ≥1 line.
  if (facts.reward_count > 0 && facts.top_reward_name) {
    out.push({
      id: "catalogue", icon: "gift",
      text: facts.reward_count > 1
        ? `${facts.reward_count} rewards to unlock · up to ${facts.top_reward_name}`
        : `Unlock ${facts.top_reward_name}`,
      pill: "See rewards →", href: "/rewards",
    });
  }

  return out;
}
