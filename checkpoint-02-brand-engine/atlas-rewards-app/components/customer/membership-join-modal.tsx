"use client";
/**
 * MembershipJoinModal — customer-facing premium membership sign-up modal.
 *
 * Opens when the customer taps the membership card on the home page.
 * Pulls safe billing info from membership_billing_public() (no Stripe key exposed).
 * Posts to /api/[slug]/membership/checkout → redirects to Stripe Checkout.
 *
 * States:
 *  loading   — fetching billing config
 *  unavailable — billing not enabled (no Stripe connected)
 *  ready     — show the offer
 *  subscribing — POST in-flight
 *  member    — already subscribed (golden crown state)
 */

import { useEffect, useState } from "react";
import {
  // CP-28: Wallet removed — points-only product, no cash credit perk.
  X, Crown, Check, Loader2, Sparkles, ChevronRight, Lock,
  Zap, CalendarCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Business, Membership } from "@/lib/types/database";

type BillingPublic = {
  is_enabled: boolean;
  price_cents: number;
  membership_name: string;
  perks: string[];
  // CP-22 — optional benefit fields. Older DBs without the migration return
  // undefined; we always fall back to "off / 1x".
  // CP-28: monthly_cash_balance_cents removed — points-only product.
  points_multiplier?: number | null;
  has_priority_booking?: boolean | null;
};

export function MembershipJoinModal({
  business,
  membership,
  userId,
  onClose,
}: {
  business: Business;
  membership: Membership | null;
  userId: string;
  onClose: () => void;
}) {
  const [billing, setBilling] = useState<BillingPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const primary = business.brand_colors.primary;

  // Check whether customer already has a paid tier
  const isPaid = !!(
    membership &&
    (business.tiers ?? []).find(t => t.name === membership.tier)?.monthly_price_cents
  );

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.rpc("membership_billing_public", {
        p_business_id: business.id,
      });
      const row = Array.isArray(data) ? data[0] : data;
      setBilling(row ?? null);
      setLoading(false);
    })();
  }, [business.id]);

  async function handleSubscribe() {
    if (!billing) return;
    setSubscribing(true);
    setErr(null);
    try {
      const res = await fetch(`/api/${business.slug}/membership/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          membershipId: membership?.id ?? null,
          returnUrl: window.location.href,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not start checkout.");
      // Redirect to Stripe Checkout
      window.location.href = json.url;
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong. Please try again.");
      setSubscribing(false);
    }
  }

  // ── backdrop ──────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center pointer-events-none">
      {/* scrim */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm pointer-events-auto"
        onClick={onClose}
      />

      {/* sheet */}
      <div
        className="relative w-full max-w-md pointer-events-auto rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #0c0c0c 0%, #111111 100%)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 32px 80px rgba(0,0,0,0.8)",
        }}
      >
        {/* top glow strip */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${primary}88, transparent)` }}
        />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 blur-3xl opacity-20 pointer-events-none"
          style={{ background: primary }}
        />

        {/* close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 h-8 w-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition"
        >
          <X className="h-4 w-4 text-white/70" />
        </button>

        <div className="px-6 pt-8 pb-8">
          {/* ── loading ── */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            </div>
          )}

          {/* ── already a paid member ── */}
          {!loading && isPaid && (
            <div className="text-center">
              <div
                className="mx-auto h-20 w-20 rounded-full flex items-center justify-center mb-4"
                style={{ background: `${primary}22`, border: `2px solid ${primary}44` }}
              >
                <Crown className="h-9 w-9 fill-amber-400 text-amber-400" />
              </div>
              <div
                className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full mb-3"
                style={{ background: `${primary}22`, color: primary }}
              >
                <Sparkles className="h-3 w-3" /> ACTIVE MEMBER
              </div>
              <h2 className="text-2xl font-extrabold text-white">
                {billing?.membership_name ?? "The Membership"}
              </h2>
              <p className="text-zinc-400 text-sm mt-2">
                You're already in. Enjoy all the exclusive perks below.
              </p>
              {billing && billing.perks.length > 0 && (
                <ul className="mt-6 space-y-2.5 text-left">
                  {billing.perks.map((p, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span
                        className="mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: `${primary}22` }}
                      >
                        <Check className="h-3 w-3" style={{ color: primary }} />
                      </span>
                      <span className="text-sm text-zinc-300">{p}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                onClick={onClose}
                className="mt-8 w-full py-3.5 rounded-2xl text-sm font-bold text-white transition active:scale-95"
                style={{ background: primary }}
              >
                Done
              </button>
            </div>
          )}

          {/* ── billing not enabled ── */}
          {!loading && !isPaid && billing && !billing.is_enabled && (
            <div className="text-center py-6">
              <div className="mx-auto h-16 w-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                <Lock className="h-7 w-7 text-zinc-500" />
              </div>
              <h2 className="text-lg font-bold text-white">Coming soon</h2>
              <p className="text-zinc-400 text-sm mt-2">
                Membership subscriptions aren't available yet. Check back soon!
              </p>
              <button
                onClick={onClose}
                className="mt-6 w-full py-3 rounded-2xl text-sm font-semibold bg-zinc-800 text-zinc-300 transition hover:bg-zinc-700"
              >
                Close
              </button>
            </div>
          )}

          {/* ── billing not configured ── */}
          {!loading && !isPaid && !billing && (
            <div className="text-center py-6">
              <div className="mx-auto h-16 w-16 rounded-full bg-zinc-800 flex items-center justify-center mb-4">
                <Lock className="h-7 w-7 text-zinc-500" />
              </div>
              <h2 className="text-lg font-bold text-white">Coming soon</h2>
              <p className="text-zinc-400 text-sm mt-2">Memberships aren't set up yet.</p>
              <button
                onClick={onClose}
                className="mt-6 w-full py-3 rounded-2xl text-sm font-semibold bg-zinc-800 text-zinc-300"
              >
                Close
              </button>
            </div>
          )}

          {/* ── main: ready to subscribe ── */}
          {!loading && !isPaid && billing?.is_enabled && (
            <>
              {/* Crown + badge */}
              <div className="flex flex-col items-center mb-6">
                <div
                  className="h-20 w-20 rounded-full flex items-center justify-center mb-3"
                  style={{
                    background: `radial-gradient(circle at 40% 40%, ${primary}44 0%, ${primary}11 100%)`,
                    border: `1.5px solid ${primary}55`,
                  }}
                >
                  <Crown className="h-9 w-9 fill-amber-400 text-amber-400" />
                </div>
                <div
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full"
                  style={{ background: `${primary}18`, color: primary }}
                >
                  <Sparkles className="h-3 w-3" /> EXCLUSIVE MEMBERSHIP
                </div>
              </div>

              {/* Name + price */}
              <h2 className="text-center text-2xl font-extrabold text-white leading-tight">
                {billing.membership_name}
              </h2>
              <div className="flex items-baseline justify-center gap-1 mt-2">
                <span className="text-3xl font-extrabold" style={{ color: primary }}>
                  ${(billing.price_cents / 100).toFixed(2)}
                </span>
                <span className="text-zinc-400 text-sm">/ month</span>
              </div>

              {/* Divider */}
              <div className="my-6 h-px bg-white/8" />

              {/* Headline benefit pills — CP-28: cash credit pill removed
                  (points-only product). Only the points multiplier and
                  priority booking pills remain. */}
              {((billing.points_multiplier ?? 1) > 1
                || billing.has_priority_booking) && (
                <div className="flex flex-wrap gap-2 justify-center mb-5">
                  {(billing.points_multiplier ?? 1) > 1 && (
                    <ModalPill primary={primary} icon={<Zap className="h-3 w-3" />}>
                      x{(billing.points_multiplier as number).toFixed(
                        (billing.points_multiplier as number) % 1 === 0 ? 0 : 1
                      )} Points
                    </ModalPill>
                  )}
                  {billing.has_priority_booking && (
                    <ModalPill primary={primary} icon={<CalendarCheck className="h-3 w-3" />}>
                      Priority booking
                    </ModalPill>
                  )}
                </div>
              )}

              {/* Perks */}
              {billing.perks.length > 0 && (
                <ul className="space-y-3 mb-6">
                  {billing.perks.map((p, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span
                        className="mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: `${primary}22` }}
                      >
                        <Check className="h-3 w-3" style={{ color: primary }} />
                      </span>
                      <span className="text-sm text-zinc-300 leading-snug">{p}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Error */}
              {err && (
                <div className="mb-4 rounded-xl bg-rose-950/60 border border-rose-700/40 px-4 py-3 text-xs text-rose-300">
                  {err}
                </div>
              )}

              {/* CTA */}
              <button
                onClick={handleSubscribe}
                disabled={subscribing}
                className="w-full py-4 rounded-2xl text-sm font-extrabold text-white tracking-wide flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-70"
                style={{
                  background: `linear-gradient(135deg, ${primary} 0%, ${primary}cc 100%)`,
                  boxShadow: `0 8px 24px ${primary}44`,
                }}
              >
                {subscribing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Subscribe — ${(billing.price_cents / 100).toFixed(2)}/mo
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>

              {/* Fine print */}
              <p className="text-center text-[10px] text-zinc-600 mt-3">
                Secure checkout via Stripe · Cancel anytime
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalPill({
  primary, icon, children,
}: { primary: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full"
      style={{ background: `${primary}22`, color: primary, border: `1px solid ${primary}33` }}
    >
      {icon}
      {children}
    </span>
  );
}
