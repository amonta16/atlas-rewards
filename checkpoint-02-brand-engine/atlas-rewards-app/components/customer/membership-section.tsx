"use client";
/**
 * MembershipSection — CP-108 rebuild.
 *
 * Andrew: "completely redo the membership and passes for the builder view and
 * app view, because it is not displaying correctly."
 *
 * What was actually wrong on this screen:
 *
 *  · PASSES WERE INVISIBLE. With a monthly plan plus passes the card said
 *    "· or grab a pass" and never showed a single one — you had to open the
 *    modal to discover what existed, or that any existed.
 *  · The price line was inverted: one pass rendered "$25.00 one-time pass",
 *    several rendered "$25.00 · passes from".
 *  · The paid-member view invented benefits nobody configured ("Member
 *    savings — exclusive discounts only members can see") and showed them
 *    alongside the business's real perks list.
 *  · A pass buyer was told "Cancel anytime" — there is nothing to cancel.
 *
 * Everything derived now comes from lib/membership.ts, shared with the
 * builder panel, so this screen can only ever show what a business actually
 * configured.
 */
import { useEffect, useState } from "react";
import {
  Crown, Sparkles, Check, ChevronRight, Zap, CalendarCheck,
  BadgeCheck, CalendarClock, Ticket, Repeat,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MembershipJoinModal } from "./membership-join-modal";
import { readMembership, joinFinePrint, money, type MembershipRow } from "@/lib/membership";
import type { Business, Membership } from "@/lib/types/database";

type PaidStatus = {
  is_paid: boolean;
  paid_at: string | null;
  renewal_due_at: string | null;
  expires_at?: string | null;
  plan_label?: string | null;
};

export function MembershipSection({
  business, membership, userId,
}: {
  business: Business;
  membership: Membership | null;
  userId: string;
}) {
  const [row, setRow] = useState<MembershipRow | "loading">("loading");
  const [modalOpen, setModalOpen] = useState(false);
  const [paid, setPaid] = useState<PaidStatus | null>(null);

  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.rpc("membership_billing_public", { p_business_id: business.id });
      setRow((Array.isArray(data) ? data[0] : data) ?? null);
    })();
    (async () => {
      const { data, error } = await supabase.rpc("member_membership_status", { p_business_id: business.id });
      if (error) {
        // Pre-CP-42 database — fall back to the legacy tier lookup so the
        // page still renders something truthful.
        setPaid({
          is_paid: !!(membership && (business.tiers ?? []).find(t => t.name === membership.tier)?.monthly_price_cents),
          paid_at: null, renewal_due_at: null,
        });
        return;
      }
      const r = Array.isArray(data) ? data[0] : data;
      setPaid(r ?? { is_paid: false, paid_at: null, renewal_due_at: null });
    })();
  }, [business.id, membership, business.tiers]);

  if (row === "loading") return null;          // avoid layout shift pre-hydration
  const v = readMembership(row);
  if (!v.enabled) return null;                 // CP-55: off means invisible

  const isPaid = !!paid?.is_paid;

  /* ══════════════ MEMBER ══════════════ */
  if (isPaid) {
    const onAPass = !!paid?.expires_at;
    return (
      <div className="px-4 mt-6" id="membership-benefits">
        <div className="rounded-3xl overflow-hidden border bg-white"
          style={{ borderColor: `${primary}25`, boxShadow: `0 10px 30px ${primary}11` }}>

          <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3"
            style={{ background: `linear-gradient(135deg, ${primary}10 0%, ${primary}03 100%)` }}>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase mb-1.5"
                style={{ color: primary }}>
                <Crown className="h-3 w-3" /> Member
              </div>
              <h2 className="text-lg font-extrabold text-zinc-900 leading-tight truncate">
                {paid?.plan_label || v.name}
              </h2>
            </div>
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: `${primary}15`, color: primary }}>
              {onAPass ? <Ticket className="h-5 w-5" /> : <Crown className="h-5 w-5" />}
            </div>
          </div>

          {/* The business's OWN perks — no invented benefits. */}
          {v.perks.length > 0 ? (
            <ul className="px-5 pt-4 space-y-2">
              {v.perks.slice(0, 8).map((p, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: `${primary}18` }}>
                    <Check className="h-3 w-3" style={{ color: primary }} />
                  </span>
                  <span className="text-sm text-zinc-700 leading-snug">{p}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pt-4 text-sm text-zinc-500">Your membership is active.</p>
          )}

          {/* Only the multipliers a business actually set. */}
          {(v.pointsMultiplier > 1 || v.priorityBooking) && (
            <div className="flex flex-wrap gap-2 px-5 pt-4">
              {v.pointsMultiplier > 1 && (
                <Pill primary={primary} icon={<Zap className="h-3 w-3" />}>
                  x{v.pointsMultiplier.toFixed(v.pointsMultiplier % 1 === 0 ? 0 : 1)} points
                </Pill>
              )}
              {v.priorityBooking && (
                <Pill primary={primary} icon={<CalendarCheck className="h-3 w-3" />}>Priority booking</Pill>
              )}
            </div>
          )}

          <div className="px-5 py-4 mt-4 grid grid-cols-2 gap-3 text-[11px] border-t"
            style={{ background: `${primary}06`, borderColor: `${primary}18` }}>
            {paid?.paid_at && (
              <Stat primary={primary} icon={<BadgeCheck className="h-3.5 w-3.5" />} label="Member since"
                value={fmt(paid.paid_at)} />
            )}
            {onAPass ? (
              <Stat primary={primary} icon={<CalendarClock className="h-3.5 w-3.5" />} label="Expires"
                value={fmt(paid!.expires_at!)} />
            ) : paid?.renewal_due_at ? (
              <Stat primary={primary} icon={<Repeat className="h-3.5 w-3.5" />} label="Renews"
                value={fmt(paid.renewal_due_at)} />
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  /* ══════════════ NON-MEMBER ══════════════ */
  // Nothing purchasable → show nothing. A business can be `is_enabled` with
  // the monthly plan off and no passes; older builds could save that state.
  if (!v.purchasable) return null;

  return (
    <>
      <div className="px-4 mt-6">
        <div className="relative rounded-3xl overflow-hidden"
          style={{
            background: `linear-gradient(150deg, ${primary} 0%, ${secondary} 100%)`,
            boxShadow: `0 16px 48px ${primary}33`,
          }}>
          <div className="absolute top-0 inset-x-0 h-px"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.9), transparent)" }} />

          <div className="p-5 relative">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full mb-2 bg-white/25 text-white">
                  <Sparkles className="h-2.5 w-2.5" /> Exclusive
                </div>
                <h2 className="text-xl font-extrabold text-white leading-tight drop-shadow-sm">{v.name}</h2>
                <div className="flex items-baseline gap-1.5 mt-1">
                  {v.hasChoice && <span className="text-white/75 text-xs">from</span>}
                  <span className="text-2xl font-extrabold text-white">{money(v.fromCents ?? 0)}</span>
                  {!v.hasChoice && v.offers[0]?.kind === "monthly" && (
                    <span className="text-white/80 text-xs">/ month</span>
                  )}
                </div>
              </div>
              <div className="h-14 w-14 rounded-2xl flex items-center justify-center shrink-0 bg-white/20 ring-1 ring-white/40">
                <Crown className="h-7 w-7 fill-amber-300 text-amber-300" />
              </div>
            </div>

            {/* THE FIX: every way in is visible here, priced, before you tap.
                With a single offer the headline price already says it, so the
                list would just repeat itself. */}
            {v.hasChoice && (
            <div className="space-y-1.5 mb-4">
              {v.offers.map(o => (
                <div key={o.id}
                  className="flex items-center gap-2.5 rounded-xl bg-white/15 ring-1 ring-white/25 px-3 py-2">
                  <span className="h-6 w-6 rounded-lg bg-white/25 flex items-center justify-center shrink-0">
                    {o.kind === "monthly"
                      ? <Repeat className="h-3.5 w-3.5 text-white" />
                      : <Ticket className="h-3.5 w-3.5 text-white" />}
                  </span>
                  <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">{o.label}</span>
                  <span className="text-sm font-extrabold text-white shrink-0">
                    {money(o.priceCents)}
                    <span className="text-white/70 text-[11px] font-semibold">
                      {o.kind === "monthly" ? "/mo" : ` · ${o.months} mo`}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            )}

            {(v.pointsMultiplier > 1 || v.priorityBooking) && (
              <div className="flex flex-wrap gap-2 mb-4">
                {v.pointsMultiplier > 1 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/25 text-white">
                    <Zap className="h-3 w-3" /> x{v.pointsMultiplier.toFixed(v.pointsMultiplier % 1 === 0 ? 0 : 1)} points
                  </span>
                )}
                {v.priorityBooking && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-white/25 text-white">
                    <CalendarCheck className="h-3 w-3" /> Priority booking
                  </span>
                )}
              </div>
            )}

            {v.perks.length > 0 && (
              <ul className="space-y-2 mb-5">
                {v.perks.slice(0, 5).map((p, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-white/25">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                    <span className="text-sm text-white/95 leading-snug">{p}</span>
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => setModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-extrabold tracking-wide transition active:scale-95 bg-white"
              style={{ color: primary, boxShadow: "0 6px 20px rgba(0,0,0,0.15)" }}
            >
              {v.hasChoice ? "See membership options" : "Become a member"}
              <ChevronRight className="h-4 w-4" />
            </button>

            <p className="text-center text-[10px] text-white/80 mt-2.5">{joinFinePrint(v)}</p>
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

/* ─────────────────────────── bits ─────────────────────────── */

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Pill({ primary, icon, children }: { primary: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
      style={{ background: `${primary}15`, color: primary }}>
      {icon} {children}
    </span>
  );
}

function Stat({
  primary, icon, label, value,
}: { primary: string; icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 shrink-0" style={{ color: primary }}>{icon}</span>
      <div className="min-w-0">
        <div className="font-bold uppercase tracking-wider text-[9px]" style={{ color: primary }}>{label}</div>
        <div className="font-semibold text-zinc-800 leading-tight mt-0.5">{value}</div>
      </div>
    </div>
  );
}
