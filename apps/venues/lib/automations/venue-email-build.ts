/**
 * lib/automations/venue-email-build.ts — CP-261 · one venue journey message → the finished arcade email,
 * for the desk preview (sample player) and the "Send me a test" email. Real sends arrive already rendered
 * by the database (wf_render) and go through the dispatcher, which calls renderArcadeEmail the same way.
 *
 * Client-safe: no server imports.
 */
import { renderArcadeEmail, venueLinks, type ArcadeEmailBrand, type ArcadeEmailPrize } from "./arcade-email";
import { fillEmailVars } from "./rewards-email";
import catalog from "./venue-suite-catalog.json";

export type VenueMessage = {
  node_id: string; channel: string; label?: string; when_text?: string | null;
  subject?: string | null; preheader?: string | null; heading?: string | null; body?: string | null;
  cta_label?: string | null; cta_path?: string | null; cta_redeem?: boolean | null; footnote?: string | null;
  template?: string | null; points?: number | null; points_rule?: string | null;
};
export type VenueJourney = {
  key: string; grp: string; name: string; why: string; trigger_text: string; timing_text: string;
  channels: string[]; reward_text: string | null; engine: string; enabled?: boolean; sent_30d?: number;
  entered_30d?: number; converted_30d?: number; messages: VenueMessage[];
};

/** The journeys as shipped (shown read-only until the CP-261 SQL is applied, and the source for previews). */
export const VENUE_CATALOG = catalog as unknown as VenueJourney[];

/** A believable player for this journey, from the venue's own prizes. */
export function venueScenario(key: string, prizes: ArcadeEmailPrize[]) {
  const list = [...prizes].filter((p) => p.pointCost > 0).sort((a, b) => a.pointCost - b.pointCost);
  const first = list[0], second = list[1] ?? list[0];
  let points = first ? Math.round(first.pointCost * 0.6) : 600;
  let featured: ArcadeEmailPrize | null = null;
  if (key === "fe.reward_ready" && first) {
    const target = list[Math.min(2, list.length - 1)];
    points = target.pointCost + Math.round(target.pointCost * 0.05);
    featured = [...list].reverse().find((p) => p.pointCost <= points) ?? first;
  } else if (key === "fe.almost_there" && second) {
    points = Math.ceil(second.pointCost * 0.8);
    featured = list.find((p) => p.pointCost > points) ?? second;
  } else if (key === "fe.reward_expiring" && first) {
    points = Math.round(first.pointCost * 0.4); featured = first;
  } else if ((key === "fe.points_earned" || key === "fe.winback" || key === "fe.birthday") && second) {
    points = Math.round(second.pointCost * 1.1);
  }
  const next = list.find((p) => p.pointCost > points) ?? null;
  return { points, featured, remaining: next ? next.pointCost - points : 0, next };
}

export function buildVenueEmail(o: {
  journeyKey: string;
  msg: VenueMessage;
  brand: ArcadeEmailBrand;
  prizes: ArcadeEmailPrize[];
  firstName: string;
  pointRules?: Record<string, number> | null;
  /** path → absolute URL on the venue's app ("#" in a preview is fine). */
  base: (path: string) => string;
  unsubscribeUrl: string;
  test?: boolean;
}) {
  const s = venueScenario(o.journeyKey, o.prizes);
  const rules = o.pointRules ?? {};
  const bonus = o.msg.points ?? (o.msg.points_rule ? rules[o.msg.points_rule] ?? 0 : 0);
  const due = new Date(Date.now() + 3 * 864e5).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const vars = {
    first_name: o.firstName, business: o.brand.businessName, points: s.points.toLocaleString("en-US"),
    points_remaining: s.remaining.toLocaleString("en-US"), offer_name: s.featured?.name ?? s.next?.name ?? o.prizes[0]?.name ?? "a prize",
    due_date: due, days_since_last_visit: "45", bonus: bonus.toLocaleString("en-US"),
    friend_bonus: (rules.referral_referee ?? 0).toLocaleString("en-US"),
  };
  const f = (t: string | null | undefined) => fillEmailVars(t, vars);
  const links = venueLinks(o.base);
  const subject = (o.test ? "[Test] " : "") + f(o.msg.subject);
  const preheader = f(o.msg.preheader) || null;
  const { html, text } = renderArcadeEmail({
    brand: o.brand, subject, preheader, firstName: o.firstName, points: s.points,
    headline: f(o.msg.heading) || f(o.msg.subject), body: f(o.msg.body),
    ctaLabel: f(o.msg.cta_label) || null,
    ctaUrl: o.msg.cta_label ? (o.msg.cta_redeem && s.featured?.id ? links.redeemUrl(s.featured.id) : o.base(o.msg.cta_path || "/app")) : null,
    footnote: f(o.msg.footnote) || null, rewardsUrl: links.rewardsUrl, redeemUrl: links.redeemUrl,
    prizes: o.prizes, featuredPrizeId: s.featured?.id ?? null, quickLinks: links.quickLinks, unsubscribeUrl: o.unsubscribeUrl,
  });
  return { subject, preheader, html, text, points: s.points };
}
