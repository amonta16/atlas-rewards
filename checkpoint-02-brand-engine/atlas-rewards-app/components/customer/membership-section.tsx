"use client";
/**
 * MembershipSection — single-membership card for the customer home page.
 *
 * Fetches billing info (price, name, perks, benefit fields) from
 * membership_billing_public() so the display always stays in sync with what
 * the manager configured.
 *
 * States:
 *  • Loading:           skeleton pulse
 *  • Not configured / disabled: soft promo card ("Coming soon")
 *  • Member (paid):     Dermis-style benefit grid + perks — "Membership benefits"
 *  • Non-member:        dark exclusive card with "Become a member" CTA
 *
 * The Join button opens <MembershipJoinModal> which handles the Stripe Checkout flow.
 */

import { useEffect, useState } from "react";
import {
  // CP-28: Wallet removed — points-only product, no cash credit perk.
  Crown, Sparkles, Check, ChevronRight, Lock, Zap, CalendarCheck, Tag,
  // CP-42: badge / refresh icons for the active-member ribbon.
  BadgeCheck, CalendarClock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MembershipJoinModal } from "./membership-join-modal";
import type { Business, Membership } from "@/lib/types/database";

type BillingPublic = {
  is_enabled: boolean;
  price_cents: number;
  membership_name: string;
  perks: string[];
  // CP-22 — Dermis-style benefit fields; older databases may not return these
  // (e.g. if the CP-22 migration hasn't been run yet), so we always default.
  // CP-28: monthly_cash_balance_cents removed — points-only product.
  points_multiplier?: number | null;
  has_priority_booking?: boolean | null;
  image_url?: string | null;
};

export function MembershipSection({
  business,
  membership,
  userId,
}: {
  business: Business;
  membership: Membership | null;
  userId: string;
}) {
  const [billing, setBilling] = useState<BillingPublic | null | "loading">("loading");
  const [modalOpen, setModalOpen] = useState(false);

  const primary   = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;

  // CP-42: source of truth for "is this user a paid member" is now the
  // business_memberships.membership_payment_status column (via the new
  // member_membership_status RPC). The legacy `business.tiers` lookup
  // was unreliable after the CP-22 single-membership refactor — it kept
  // showing the Join CTA to paid members.
  const [paidStatus, setPaidStatus] = useState<
    { is_paid: boolean; paid_at: string | null; renewal_due_at: string | null } | null
  >(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.rpc("membership_billing_public", {
        p_business_id: business.id,
      });
      const row = Array.isArray(data) ? data[0] : data;
      setBilling(row ?? null);
    })();

    // CP-42: query paid-member status separately. The RPC is brand new in
    // cp42_membership_paid_at.sql. If it isn't installed yet we fall back
    // to the legacy tier-table check so the page still renders correctly.
    (async () => {
      const { data, error } = await supabase.rpc("member_membership_status", {
        p_business_id: business.id,
      });
      if (error) {
        setPaidStatus({
          is_paid: !!(
            membership &&
            (business.tiers ?? []).find(t => t.name === membership.tier)?.monthly_price_cents
          ),
          paid_at: null,
          renewal_due_at: null,
        });
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setPaidStatus(row ?? { is_paid: false, paid_at: null, renewal_due_at: null });
    })();
  }, [business.id, membership, business.tiers]);

  const isPaid = !!paidStatus?.is_paid;

  // Don't render the section at all if billing is still loading silently
  // (avoid CLS — section appears after hydration)
  if (billing === "loading") return null;

  // ── Member (paid) — Dermis-style benefit grid ─────────────────────────────
  if (isPaid) {
    const name      = billing?.membership_name ?? "The Membership";
    const perks     = billing?.perks ?? [];
    // CP-28: cashCents removed — points-only product.
    const mult      = billing?.points_multiplier ?? 1;
    const priority  = !!billing?.has_priority_booking;

    return (
      <div className="px-4 mt-6" id="membership-benefits">
        <div
          className="rounded-3xl overflow-hidden border bg-white"
          style={{ borderColor: `${primary}25`, boxShadow: `0 10px 30px ${primary}11` }}
        >
          {/* Header bar — branded */}
          <div
            className="px-5 pt-5 pb-4 flex items-start justify-between"
            style={{ background: `linear-gradient(135deg, ${primary}10 0%, ${primary}03 100%)` }}
          >
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase mb-1.5"
                style={{ color: primary }}>
                <Crown className="h-3 w-3" /> Member · {name}
              </div>
              <h2 className="text-lg font-extrabold text-zinc-900 leading-tight">Membership benefits</h2>
            </div>
            <div
              className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: `${primary}15`, color: primary }}
            >
              <Crown className="h-5 w-5" />
            </div>
          </div>

          {/* Perks bullet list — CP-28: cash credit row removed */}
          {perks.length > 0 && (
            <ul className="px-5 pt-4 space-y-2">
              {perks.slice(0, 6).map((p, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${primary}18` }}
                  >
                    <Check className="h-3 w-3" style={{ color: primary }} />
                  </span>
                  <span className="text-sm text-zinc-700 leading-snug">{p}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Benefit grid — CP-28: cash credit tile removed (points-only) */}
          <div className="grid grid-cols-2 gap-3 px-5 py-5">
            <BenefitCard
              primary={primary}
              icon={<Tag className="h-5 w-5 text-white" />}
              title="Member savings"
              body="Exclusive discounts only members can see"
            />
            {priority && (
              <BenefitCard
                primary={primary}
                icon={<CalendarCheck className="h-5 w-5 text-white" />}
                title="Priority booking"
                body="Skip the queue with member-only slots"
              />
            )}
            {mult > 1 && (
              <BenefitCard
                primary={primary}
                icon={<Zap className="h-5 w-5 text-white" />}
                title={`x${mult.toFixed(mult % 1 === 0 ? 0 : 1)} Points`}
                body={`Earn ${Math.round((mult - 1) * 100)}% more points on every visit`}
              />
            )}
          </div>

          {/* CP-42: Member-since + renewal-due bar — replaces the "you're in"
              ribbon when we know the paid_at date from member_membership_status.
              Doubles as a "you're already a member, no Join CTA" signal. */}
          {(paidStatus?.paid_at || paidStatus?.renewal_due_at) ? (
            <div
              className="px-5 py-3 grid grid-cols-2 gap-3 text-[11px] border-t"
              style={{ background: `${primary}06`, borderColor: `${primary}18` }}
            >
              {paidStatus?.paid_at && (
                <div className="flex items-start gap-1.5">
                  <BadgeCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: primary }} />
                  <div>
                    <div className="font-bold uppercase tracking-wider text-[9px]" style={{ color: primary }}>
                      Member since
                    </div>
                    <div className="font-semibold text-zinc-800 leading-tight mt-0.5">
                      {new Date(paidStatus.paid_at).toLocaleDateString(undefined, {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </div>
                  </div>
                </div>
              )}
              {paidStatus?.renewal_due_at && (
                <div className="flex items-start gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: primary }} />
                  <div>
                    <div className="font-bold uppercase tracking-wider text-[9px]" style={{ color: primary }}>
                      Renews
                    </div>
                    <div className="font-semibold text-zinc-800 leading-tight mt-0.5">
                      {new Date(paidStatus.renewal_due_at).toLocaleDateString(undefined, {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div
              className="px-5 py-2.5 text-[11px] font-bold flex items-center gap-1.5"
              style={{ background: `${primary}08`, color: primary }}
            >
              <Sparkles className="h-3 w-3" /> You're in — enjoy your perks
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Billing not enabled or not set up — show a soft "Coming soon" teaser ──
  if (!billing || !billing.is_enabled) {
    return (
      <div className="px-4 mt-6" id="membership-benefits">
        <div
          className="rounded-3xl p-5 flex items-center gap-4"
          style={{ background: `${primary}08`, border: `1px solid ${primary}18` }}
        >
          <div
            className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${primary}15` }}
          >
            <Lock className="h-5 w-5" style={{ color: primary }} />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-800">Membership — coming soon</div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Exclusive perks and rewards for loyal members. Stay tuned!
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main: non-member, billing enabled — dark exclusive join card ───────────
  const { membership_name, price_cents, perks } = billing;
  // CP-28: joinCashCents removed — points-only product.
  const joinMult      = billing.points_multiplier ?? 1;
  const joinPriority  = !!billing.has_priority_booking;

  return (
    <>
      <div className="px-4 mt-6" id="membership-benefits">
        {/* CP-24: switched from black ("looks off" — Andrew) to a soft branded
            gradient that uses the business's primary color tints. Reads as
            premium without looking dead. */}
        <div
          className="relative rounded-3xl overflow-hidden bg-white"
          style={{
            background: `linear-gradient(160deg, ${primary}f2 0%, ${primary} 60%, ${primary}cc 100%)`,
            border: `1px solid ${primary}44`,
            boxShadow: `0 16px 48px ${primary}33`,
          }}
        >
          {/* top brand shimmer */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)` }}
          />
          <div
            className="absolute -top-6 left-1/2 -translate-x-1/2 w-64 h-24 blur-3xl opacity-20 pointer-events-none"
            style={{ background: "white" }}
          />

          <div className="p-5 relative">
            {/* Header row */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <div
                  className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full mb-2 bg-white/25 text-white"
                >
                  <Sparkles className="h-2.5 w-2.5" /> EXCLUSIVE
                </div>
                <h2 className="text-xl font-extrabold text-white leading-tight drop-shadow-sm">{membership_name}</h2>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-extrabold text-white">
                    ${(price_cents / 100).toFixed(2)}
                  </span>
                  <span className="text-white/80 text-xs">/ month</span>
                </div>
              </div>
              <div
                className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 bg-white/20 ring-1 ring-white/40"
              >
                <Crown className="h-7 w-7 fill-amber-300 text-amber-300" />
              </div>
            </div>

            {/* Headline value pills — CP-28: cash credit pill removed
                (points-only product). Only points-multiplier + priority
                booking remain as signup levers above the perks list. */}
            <div className="flex flex-wrap gap-2 mb-4">
              {joinMult > 1 && (
                <ValuePill primary={primary} icon={<Zap className="h-3 w-3" />}>
                  x{joinMult.toFixed(joinMult % 1 === 0 ? 0 : 1)} Points
                </ValuePill>
              )}
              {joinPriority && (
                <ValuePill primary={primary} icon={<CalendarCheck className="h-3 w-3" />}>
                  Priority booking
                </ValuePill>
              )}
            </div>

            {/* Perks */}
            {perks.length > 0 && (
              <ul className="space-y-2 mb-5">
                {perks.slice(0, 5).map((p, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-white/25">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                    <span className="text-sm text-white/95 leading-snug">{p}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Join CTA */}
            <button
              onClick={() => setModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-extrabold tracking-wide transition active:scale-95 bg-white"
              style={{
                color: primary,
                boxShadow: `0 6px 20px rgba(0,0,0,0.15)`,
              }}
            >
              Become a member
              <ChevronRight className="h-4 w-4" />
            </button>

            {/* Fine print */}
            <p className="text-center text-[10px] text-white/80 mt-2.5">
              Cancel anytime · Secure checkout via Stripe
            </p>
          </div>
        </div>
      </div>

      {modalOpen && (
        <MembershipJoinModal
          business={business}
          membership={membership}
          userId={userId}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

/**
 * BenefitCard — Dermis-style colored tile for the member benefit grid.
 *
 * One per benefit (cash balance, savings, priority booking, points multiplier).
 * Uses the business's primary brand color as the background so the grid
 * always looks on-brand regardless of which industry the business is in.
 */
function ValuePill({
  primary, icon, children,
}: {
  primary: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/25 text-white"
      style={{ border: `1px solid rgba(255,255,255,0.4)` }}
    >
      {icon}
      {children}
    </span>
  );
}

function BenefitCard({
  primary, icon, title, body,
}: {
  primary: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div
      className="rounded-2xl p-3.5 text-white relative overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${primary} 0%, ${primary}dd 100%)`,
        boxShadow: `0 4px 14px ${primary}33`,
      }}
    >
      <div
        className="h-9 w-9 rounded-xl flex items-center justify-center mb-2"
        style={{ background: "rgba(255,255,255,0.18)" }}
      >
        {icon}
      </div>
      <div className="text-sm font-extrabold leading-tight">{title}</div>
      <div className="text-[10.5px] text-white/85 mt-0.5 leading-snug">{body}</div>
    </div>
  );
}
