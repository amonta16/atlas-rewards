"use client";
/**
 * MembershipHub — CP-151 · the customer's whole membership experience
 *
 * One component, three states, no modal:
 *   prospect  → hero (photo or brand gradient) · name · perks · plan picker
 *               inline · one CTA whose label matches how this business takes
 *               payment · fine print
 *   pending   → "Requested" card: the plan they picked + exactly what happens
 *               next (pay at the desk / finish payment link) — survives
 *               reloads because it reads business_memberships, not local state
 *   member    → MEMBER card: plan, since, renews/expires, perks, and (Stripe)
 *               the Manage box (update card / cancel / resume)
 *
 * Replaces membership-section.tsx + membership-join-modal.tsx. Everything is
 * derived from readMembership() (lib/membership.ts) — the same reading the
 * builder's live preview uses (MembershipOfferCard is exported for it), so
 * what the owner sees in the studio IS what the customer gets.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Crown, Loader2, Sparkles, Zap, CalendarCheck, Wallet, Clock, ExternalLink, Store, BadgeCheck, Repeat, CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { readMembership, joinFinePrint, money, type MembershipRow, type MembershipView, type MembershipOffer } from "@/lib/membership";
import { ManageMembership } from "@/components/customer/manage-membership";
import type { Business, Membership } from "@/lib/types/database";

type PaidStatus = { is_paid: boolean; paid_at: string | null; renewal_due_at: string | null; expires_at?: string | null; plan_label?: string | null };
type MyRow = { status: string | null; membership_payment_status: string | null; membership_pending_plan: { id?: string; label?: string; price_cents?: number; months?: number | null } | null };

const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

/* ═══════════════════════════════════════════════════════════════════════
   Presentational card — shared with the builder preview (no data fetching)
   ═══════════════════════════════════════════════════════════════════════ */
export function MembershipOfferCard({
  business, view, selectedId, onSelect, onJoin, busy, err, compact = false,
}: {
  business: Pick<Business, "name" | "brand_colors">;
  view: MembershipView & { imageUrl?: string | null };
  selectedId: string | null;
  onSelect: (id: string) => void;
  onJoin?: () => void;
  busy?: boolean;
  err?: string | null;
  /** Builder preview: no CTA handlers, tighter spacing. */
  compact?: boolean;
}) {
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;
  const chosen = view.offers.find(o => o.id === selectedId) ?? view.offers[0] ?? null;
  const cta = !chosen ? "Not available yet"
    : view.paymentMode === "stripe" ? (chosen.kind === "monthly" ? `Join · ${money(chosen.priceCents)}/mo` : `Buy pass · ${money(chosen.priceCents)}`)
    : view.paymentMode === "external_link" ? `Continue to payment · ${money(chosen.priceCents)}`
    : `Reserve at the front desk`;

  return (
    <div className="rounded-3xl overflow-hidden bg-white shadow-[0_18px_44px_-24px_rgba(15,23,42,0.45)] ring-1 ring-black/5">
      {/* Hero */}
      <div className="relative" style={{ background: `linear-gradient(140deg, ${primary} 0%, ${secondary} 100%)` }}>
        {view.imageUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={view.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${primary}22 0%, ${primary}e6 100%)` }} />
          </>
        )}
        <div className={cn("relative text-white", compact ? "p-4" : "p-5")}>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full">
            <Crown className="h-3 w-3" /> {business.name}
          </div>
          <div className={cn("font-black leading-tight mt-2 drop-shadow-sm", compact ? "text-xl" : "text-2xl")}>{view.name}</div>
          {view.fromCents !== null && (
            <div className="mt-1 text-sm font-semibold opacity-95">
              {view.hasChoice ? "from " : ""}<span className="text-lg font-black">{money(view.fromCents)}</span>
              {view.monthlyOffered && view.monthlyPriceCents === view.fromCents ? "/month" : " one-time"}
            </div>
          )}
        </div>
      </div>

      <div className={cn(compact ? "p-4 space-y-3" : "p-5 space-y-4")}>
        {/* Perks */}
        {(view.perks.length > 0 || view.pointsMultiplier > 1 || view.priorityBooking) && (
          <ul className="space-y-1.5">
            {view.pointsMultiplier > 1 && <Perk primary={primary} icon={<Zap className="h-3.5 w-3.5" />}>{view.pointsMultiplier.toFixed(view.pointsMultiplier % 1 === 0 ? 0 : 1)}× points on every visit</Perk>}
            {view.priorityBooking && <Perk primary={primary} icon={<CalendarCheck className="h-3.5 w-3.5" />}>Priority booking</Perk>}
            {view.perks.map((p, i) => <Perk key={i} primary={primary} icon={<Check className="h-3.5 w-3.5" />}>{p}</Perk>)}
          </ul>
        )}

        {/* Plan picker — only when there is a choice */}
        {view.offers.length > 1 && (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(view.offers.length, 2)}, minmax(0, 1fr))` }}>
            {view.offers.map(o => {
              const on = (chosen?.id ?? null) === o.id;
              return (
                <button key={o.id} type="button" onClick={() => onSelect(o.id)}
                  className={cn("rounded-2xl border p-3 text-left transition", on ? "text-white shadow-md" : "bg-white hover:bg-zinc-50")}
                  style={on ? { background: primary, borderColor: primary } : undefined}>
                  <div className="text-[10px] font-black uppercase tracking-widest opacity-80">{o.kind === "monthly" ? "Monthly" : `${o.months} month${o.months === 1 ? "" : "s"}`}</div>
                  <div className="text-lg font-black leading-tight mt-0.5">{money(o.priceCents)}<span className="text-xs font-semibold opacity-80">{o.kind === "monthly" ? "/mo" : ""}</span></div>
                  <div className={cn("text-[11px] mt-0.5", on ? "opacity-90" : "text-zinc-500")}>{o.kind === "monthly" ? "Cancel anytime" : o.label}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <button
          type="button"
          onClick={onJoin}
          disabled={!chosen || busy || !onJoin}
          className="w-full h-12 rounded-2xl text-white font-extrabold text-base shadow-lg active:scale-[0.99] transition disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})`, boxShadow: `0 10px 24px -10px ${primary}` }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : view.paymentMode === "in_person" ? <Store className="h-4 w-4" /> : view.paymentMode === "external_link" ? <ExternalLink className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {cta}
        </button>
        <p className="text-[11px] text-center text-zinc-500 leading-snug">
          {joinFinePrint(view, chosen)}
          {view.paymentMode === "in_person" && view.instructions ? <> · {view.instructions}</> : null}
        </p>
        {err && <p className="text-[12px] text-rose-600 text-center">{err}</p>}
      </div>
    </div>
  );
}

function Perk({ children, icon, primary }: { children: React.ReactNode; icon: React.ReactNode; primary: string }) {
  return (
    <li className="flex items-start gap-2.5 text-[13px] text-zinc-800">
      <span className="mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 text-white" style={{ background: primary }}>{icon}</span>
      <span className="leading-snug">{children}</span>
    </li>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   The live hub
   ═══════════════════════════════════════════════════════════════════════ */
export function MembershipHub({
  business, membership, userId, standalone = false,
}: {
  business: Business;
  membership: Membership | null;
  userId: string;
  /** /membership tab (true) vs Home module (false: hides itself when off). */
  standalone?: boolean;
}) {
  const [row, setRow] = useState<MembershipRow | "loading">("loading");
  const [paid, setPaid] = useState<PaidStatus | null>(null);
  const [mine, setMine] = useState<MyRow | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;

  const load = useCallback(async () => {
    const supabase = createClient();
    const [b, s, m] = await Promise.all([
      supabase.rpc("membership_billing_public", { p_business_id: business.id }),
      supabase.rpc("member_membership_status", { p_business_id: business.id }),
      membership?.id
        ? supabase.from("business_memberships").select("status, membership_payment_status, membership_pending_plan").eq("id", membership.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const r = (Array.isArray(b.data) ? b.data[0] : b.data) ?? null;
    setRow(r as MembershipRow);
    const p = (Array.isArray(s.data) ? s.data[0] : s.data) as PaidStatus | undefined;
    setPaid(s.error ? { is_paid: false, paid_at: null, renewal_due_at: null } : (p ?? { is_paid: false, paid_at: null, renewal_due_at: null }));
    setMine((m as any).data ?? null);
  }, [business.id, membership?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const view = useMemo(() => (row === "loading" ? null : readMembership(row)), [row]);
  useEffect(() => { if (view && !selected && view.offers[0]) setSelected(view.offers[0].id); }, [view, selected]);

  async function join() {
    if (!view) return;
    const chosen: MembershipOffer | undefined = view.offers.find(o => o.id === selected) ?? view.offers[0];
    if (!chosen) return;
    setBusy(true); setErr(null);
    try {
      if (view.paymentMode === "stripe") {
        const res = await fetch(`/api/${business.slug}/membership/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, membershipId: membership?.id ?? null, returnUrl: window.location.href, passId: chosen.kind === "pass" ? chosen.id : null }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.url) throw new Error(json.error ?? "Couldn't start checkout.");
        window.location.assign(json.url);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.rpc("request_membership_v2", { p_business_id: business.id, p_pass_id: chosen.kind === "pass" ? chosen.id : null });
      if (error) throw new Error(error.message);
      if (view.paymentMode === "external_link" && view.externalUrl) window.open(view.externalUrl, "_blank", "noopener,noreferrer");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!view) return null;
  if (!view.enabled) return null;   // /membership page handles the "coming soon" copy itself

  const isPaid = !!paid?.is_paid;
  const isPending = !isPaid && mine?.membership_payment_status === "pending";
  const wrap = standalone ? "px-4 mt-4" : "px-4 mt-6";

  /* ── MEMBER ─────────────────────────────────────────────────────────── */
  if (isPaid) {
    const onPass = !!paid?.expires_at;
    return (
      <div className={wrap} id="membership-benefits">
        <div className="rounded-3xl overflow-hidden bg-white shadow-[0_18px_44px_-24px_rgba(15,23,42,0.45)] ring-1 ring-black/5">
          <div className="relative p-5 text-white" style={{ background: `linear-gradient(140deg, ${primary} 0%, ${secondary} 100%)` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] bg-white/20 backdrop-blur-sm px-2.5 py-1 rounded-full">
                  <BadgeCheck className="h-3 w-3" /> Member
                </div>
                <div className="text-2xl font-black leading-tight mt-2 truncate">{paid?.plan_label || view.name}</div>
                <div className="text-xs opacity-90 mt-0.5">{view.name}{paid?.paid_at ? ` · since ${fmt(paid.paid_at)}` : ""}</div>
              </div>
              <Crown className="h-8 w-8 opacity-90 shrink-0" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {onPass ? (
                <Stat icon={<CalendarClock className="h-3.5 w-3.5" />} label="Expires" value={fmt(paid!.expires_at!)} />
              ) : paid?.renewal_due_at ? (
                <Stat icon={<Repeat className="h-3.5 w-3.5" />} label="Renews" value={fmt(paid.renewal_due_at)} />
              ) : (
                <Stat icon={<Repeat className="h-3.5 w-3.5" />} label="Plan" value="Active" />
              )}
              <Stat icon={<Wallet className="h-3.5 w-3.5" />} label="Points" value={`${(membership?.points_balance ?? 0).toLocaleString()} pts`} />
            </div>
          </div>
          {(view.perks.length > 0 || view.pointsMultiplier > 1 || view.priorityBooking) && (
            <div className="p-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Your perks</div>
              <ul className="space-y-1.5">
                {view.pointsMultiplier > 1 && <Perk primary={primary} icon={<Zap className="h-3.5 w-3.5" />}>{view.pointsMultiplier.toFixed(view.pointsMultiplier % 1 === 0 ? 0 : 1)}× points on every visit</Perk>}
                {view.priorityBooking && <Perk primary={primary} icon={<CalendarCheck className="h-3.5 w-3.5" />}>Priority booking</Perk>}
                {view.perks.map((p, i) => <Perk key={i} primary={primary} icon={<Check className="h-3.5 w-3.5" />}>{p}</Perk>)}
              </ul>
              {view.paymentMode === "in_person" && onPass && (
                <p className="text-[11px] text-zinc-500 mt-3">Renew at the front desk any time before it expires.</p>
              )}
            </div>
          )}
        </div>
        <ManageMembership business={business} />
      </div>
    );
  }

  /* ── PENDING ────────────────────────────────────────────────────────── */
  if (isPending) {
    const plan = mine?.membership_pending_plan;
    return (
      <div className={wrap}>
        <div className="rounded-3xl bg-white ring-1 ring-black/5 shadow-[0_18px_44px_-24px_rgba(15,23,42,0.45)] overflow-hidden">
          <div className="p-5 flex items-start gap-3">
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>
              <Clock className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-black uppercase tracking-widest" style={{ color: primary }}>Requested</div>
              <div className="text-lg font-extrabold leading-tight mt-0.5">{plan?.label || view.name}{plan?.price_cents ? ` · ${money(plan.price_cents)}` : ""}</div>
              <p className="text-[13px] text-zinc-600 mt-1.5 leading-snug">
                {view.paymentMode === "external_link"
                  ? "Finish paying on the business's page — once they see it, your membership switches on here."
                  : <>Show this screen at the front desk and pay there — staff will activate you on the spot.{view.instructions ? ` ${view.instructions}` : ""}</>}
              </p>
              {view.paymentMode === "external_link" && view.externalUrl && (
                <a href={view.externalUrl} target="_blank" rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full px-4 h-10 text-sm font-bold text-white"
                  style={{ background: primary }}>
                  <ExternalLink className="h-4 w-4" /> Finish payment
                </a>
              )}
            </div>
          </div>
          <div className="px-5 py-3 border-t bg-zinc-50/70 text-[11px] text-zinc-500 flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Waiting for {business.name} to confirm. This updates by itself.
          </div>
        </div>
      </div>
    );
  }

  /* ── PROSPECT ───────────────────────────────────────────────────────── */
  if (!view.purchasable) return null;
  return (
    <div className={wrap}>
      <MembershipOfferCard
        business={business}
        view={{ ...view, imageUrl: (row as any)?.image_url ?? null }}
        selectedId={selected}
        onSelect={setSelected}
        onJoin={join}
        busy={busy}
        err={err}
      />
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/25 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-85">{icon}{label}</div>
      <div className="text-sm font-extrabold mt-0.5">{value}</div>
    </div>
  );
}
