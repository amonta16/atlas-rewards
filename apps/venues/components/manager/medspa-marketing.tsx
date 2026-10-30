"use client";
/**
 * MedspaMarketing — CP-208 · the med spa Marketing tab (replaces the generic
 * CampaignsStudio for layout_preset === "medspa")
 *
 * Two halves, honestly labeled:
 *   · "Always-on" — the engines that already run in the patient app
 *     (recall, automated offers, win-back). Live status, one tap to the
 *     surface that configures each.
 *   · "Ad engine" — Atlas's spice on the Dermis model: a planning view for
 *     paid campaigns that FEED the app (ad → install → first visit →
 *     member). Nothing here claims to be sending or tracking yet; the
 *     copy says "planning" and the per-offer funnel strip says "coming".
 */
import { useEffect, useState } from "react";
import {
  Megaphone, BellRing, Wand2, Clock3, ChevronRight, Sparkles, Mail,
  Instagram, Users, CalendarCheck, Crown, ArrowRight, Send, Eye, Gift, BadgePercent,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { readMedspaConfig } from "@/lib/medspa";
import { AtlasEngineIcon } from "./atlas-engine-icon";
import type { Business } from "@/lib/types/database";

type AutoOfferRow = { template_id: string; name: string; is_active: boolean; trigger_type: string };

/** Starter ad plan for a practice — patient-facing angles, each landing in the app. */
const AD_PLAYS = [
  { id: "new-patient", name: "New-patient offer", channel: "Instagram + Facebook", icon: <BadgePercent className="h-4 w-4" />,
    hook: "A first-visit special that ends at your app's join link, so every lead becomes a patient you can reach again.", lands: "Join link + welcome gift" },
  { id: "before-after", name: "Before & after showcase", channel: "Instagram Reels", icon: <Sparkles className="h-4 w-4" />,
    hook: "Your consented gallery, cut into reels. Proof sells the consult; the consult sells the plan.", lands: "Book a consult" },
  { id: "membership", name: "Membership launch", channel: "Meta + in-app", icon: <Crown className="h-4 w-4" />,
    hook: "Sell the monthly plan to warm patients: member pricing, banked credit, and a signup bonus.", lands: "Membership tab" },
  { id: "referral", name: "Review & referral engine", channel: "Organic + retargeting", icon: <Users className="h-4 w-4" />,
    hook: "Happy-patient clips with a points reason to share. Reviews rank you; referrals fill the book.", lands: "Invite a friend" },
];

export function MedspaMarketing({ business, openOffers, openInsights, openBuilderNote, demoOffers }: {
  business: Business;
  openOffers: () => void;
  openInsights: () => void;
  /** The recall timing lives in the agency-side builder, not this desk — the card says so. */
  openBuilderNote?: string;
  /** Preloaded rows for previews/demos — skips the RPC. */
  demoOffers?: AutoOfferRow[];
}) {
  const primary = business.brand_colors.primary;
  const cfg = readMedspaConfig(business.medspa_config);
  const [offers, setOffers] = useState<AutoOfferRow[] | null>(demoOffers ?? null);

  useEffect(() => {
    if (demoOffers) return;
    let off = false;
    createClient().rpc("list_automated_offers_for_business", { p_business_id: business.id }).then(({ data }) => {
      if (!off) setOffers(((data ?? []) as AutoOfferRow[]));
    });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.id]);

  const active = (offers ?? []).filter((o) => o.is_active);

  return (
    <div className="space-y-5 max-w-5xl">
      {/* CP-210: "Atlas Engine" banner — Atlas's own mark on deep navy, so it
          reads as the engine room, distinct from the practice's brand pages. */}
      <div className="relative overflow-hidden rounded-2xl px-6 py-6 text-white shadow-sm"
        style={{ background: "radial-gradient(120% 140% at 100% 0%, #1d6fb8 0%, #0d3b74 45%, #0a1f3f 100%)" }}>
        <svg viewBox="0 0 24 24" aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-56 w-56 text-white/[0.07]" fill="currentColor">
          <path d="M8.6 4.5h6.8a1.6 1.6 0 0 1 1.4.8l3.4 5.9a1.6 1.6 0 0 1 0 1.6l-3.4 5.9a1.6 1.6 0 0 1-1.4.8H8.6a1.6 1.6 0 0 1-1.4-.8l-3.4-5.9a1.6 1.6 0 0 1 0-1.6l3.4-5.9a1.6 1.6 0 0 1 1.4-.8zM12 9.2l-2.6 4.6h5.2z" fillRule="evenodd" />
        </svg>
        <div className="relative flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <AtlasEngineIcon className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">Your marketing engine</div>
            <h2 className="text-2xl font-black leading-tight">Atlas Engine</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-white/75">
              Two engines fill your book: the <b className="text-white">always-on</b> one inside the patient app, and the
              <b className="text-white"> ad engine</b> that feeds it new patients. Run the first from here today; plan the second with your Atlas partner.
            </p>
          </div>
        </div>
      </div>

      {/* ── Always-on, in the app today ── */}
      <section>
        <div className="text-[11px] font-black uppercase tracking-wider text-zinc-400 mb-2">Always-on · live in the patient app</div>
        <div className="grid gap-3 md:grid-cols-3">
          <EngineCard
            icon={<BellRing className="h-4 w-4" />} primary={primary}
            title="Recall messages" on={cfg.recall.enabled}
            body={cfg.recall.enabled
              ? `Every treatment has a due window; patients hear from you ${cfg.recall.lead_days} days before, again ${cfg.recall.followup_days} days after.`
              : "Off. Turn it on and every logged treatment chases its own rebooking."}
            foot={openBuilderNote ?? "Timing + message live in your app builder → Treatments."}
          />
          <EngineCard
            icon={<Wand2 className="h-4 w-4" />} primary={primary}
            title="Automated offers" on={active.length > 0}
            body={offers == null ? "…" : active.length > 0
              ? `${active.length} running: ${active.slice(0, 3).map((o) => o.name).join(", ")}${active.length > 3 ? "…" : ""}. Scratch-card offers with optional voice notes.`
              : "None running. Birthday, holiday and win-back offers are one toggle each."}
            foot="Configure in Offers → Automated."
            onClick={openOffers}
          />
          <EngineCard
            icon={<Clock3 className="h-4 w-4" />} primary={primary}
            title="Win-back" on
            body="Patients who haven't visited in 30–90 days, with a one-tap 'we miss you' + bonus credit."
            foot="Runs from Insights → Inactive patients."
            onClick={openInsights}
          />
        </div>
      </section>

      {/* ── Ad engine (planning) ── */}
      <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-extrabold text-zinc-900 flex items-center gap-2"><Instagram className="h-4 w-4" style={{ color: primary }} /> Ad engine</div>
            <p className="text-[12.5px] text-zinc-500 mt-0.5">Paid campaigns that land in your app — planned here, run with your Atlas partner.</p>
          </div>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-zinc-500">Planning view</span>
        </div>

        {/* The funnel every play feeds */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5 rounded-xl bg-zinc-50 px-3 py-2.5 ring-1 ring-zinc-200/70">
          {["Ad", "App install", "First visit", "Member"].map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-zinc-300" />}
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", i === 3 ? "text-white" : "bg-white text-zinc-700 ring-1 ring-zinc-200")}
                style={i === 3 ? { background: primary } : undefined}>{s}</span>
            </span>
          ))}
          <span className="ml-auto text-[11px] text-zinc-400">every play below feeds this funnel</span>
        </div>

        <div className="mt-3 grid gap-2.5 md:grid-cols-2">
          {AD_PLAYS.map((p) => (
            <div key={p.id} className="rounded-xl bg-zinc-50 p-3.5 ring-1 ring-zinc-200/70">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[13px] font-bold text-zinc-900"><span style={{ color: primary }}>{p.icon}</span>{p.name}</span>
                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-zinc-600">Draft</span>
              </div>
              <p className="mt-1.5 text-[12px] leading-snug text-zinc-500">{p.hook}</p>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="text-zinc-400">{p.channel}</span>
                <span className="font-semibold" style={{ color: primary }}>→ {p.lands}</span>
              </div>
            </div>
          ))}
        </div>

        {/* What per-offer tracking will look like — honest "coming" */}
        <div className="mt-3 rounded-xl border border-dashed border-zinc-300 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold text-zinc-700">Per-campaign results you&apos;ll see here</span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-700">Tracking coming soon</span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center">
            {[{ i: <Send className="h-3.5 w-3.5" />, l: "Sent" }, { i: <Eye className="h-3.5 w-3.5" />, l: "Opened" }, { i: <Gift className="h-3.5 w-3.5" />, l: "Redeemed" }, { i: <CalendarCheck className="h-3.5 w-3.5" />, l: "Booked" }].map((s) => (
              <div key={s.l} className="rounded-lg bg-zinc-50 py-2.5">
                <div className="flex justify-center text-zinc-400">{s.i}</div>
                <div className="mt-1 text-sm font-black text-zinc-300">—</div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Email / SMS — small, honest */}
      <div className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5 shadow-sm">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: `${primary}14`, color: primary }}><Mail className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-zinc-900">Email & SMS blasts</div>
          <div className="text-[12px] text-zinc-500">One-off sends to segments (lapsed, birthdays, members) — coming soon.</div>
        </div>
        <ChevronRight className="h-4 w-4 text-zinc-300" />
      </div>
    </div>
  );
}

function EngineCard({ icon, primary, title, on, body, foot, onClick }: {
  icon: React.ReactNode; primary: string; title: string; on: boolean; body: string; foot: string; onClick?: () => void;
}) {
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag {...(onClick ? { type: "button", onClick } : {})}
      className={cn("rounded-2xl bg-white p-4 text-left ring-1 ring-black/5 shadow-sm", onClick && "hover:shadow transition")}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-zinc-900"><span style={{ color: primary }}>{icon}</span>{title}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide", on ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{on ? "On" : "Off"}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-zinc-500">{body}</p>
      <div className="mt-2 text-[11px] font-semibold" style={{ color: primary }}>{foot}</div>
    </Tag>
  );
}
