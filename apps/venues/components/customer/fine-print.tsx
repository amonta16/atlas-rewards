"use client";
/**
 * FinePrint — CP-134
 *
 * The terms block every reward shows BEFORE the customer claims or redeems.
 * Three layers, top to bottom:
 *   1. the reward's own terms (rewards.terms / social fine_print) — if any,
 *      else the business-wide default (businesses.reward_fine_print)
 *   2. the vendor hint ("See the vendor for complete reward details…")
 *   3. the platform disclaimer (ours) — vendors create, honor and manage
 *      their promotions; Atlas is the software.
 * Layers 2 + 3 come from agency_settings via platform_reward_terms() so the
 * wording can be finalised before launch without touching code. Fetched once
 * per page and cached in memory.
 */
import { useEffect, useState } from "react";
import { ChevronDown, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type PlatformTerms = { reward_disclaimer: string | null; vendor_terms_hint: string | null };

// Ship-safe fallbacks — used until the RPC answers or if the SQL isn't applied.
const FALLBACK: PlatformTerms = {
  vendor_terms_hint: "See the vendor for complete reward details, restrictions, and eligibility requirements.",
  reward_disclaimer:
    "Rewards and offers are created, honored, and managed by the business that offers them. " +
    "Atlas Engine provides the software only and is not responsible for the availability, value, or fulfillment of any reward. " +
    "Rewards have no cash value unless the business states otherwise.",
};

let cached: PlatformTerms | null = null;
let inflight: Promise<PlatformTerms> | null = null;

export function usePlatformTerms(): PlatformTerms {
  const [t, setT] = useState<PlatformTerms>(cached ?? FALLBACK);
  useEffect(() => {
    if (cached) { setT(cached); return; }
    inflight ??= (async () => {
      try {
        const { data } = await createClient().rpc("platform_reward_terms");
        const row = (Array.isArray(data) ? data[0] : data) as PlatformTerms | null;
        cached = {
          reward_disclaimer: row?.reward_disclaimer || FALLBACK.reward_disclaimer,
          vendor_terms_hint: row?.vendor_terms_hint || FALLBACK.vendor_terms_hint,
        };
      } catch { cached = FALLBACK; }
      return cached;
    })();
    let live = true;
    inflight.then(v => { if (live) setT(v); });
    return () => { live = false; };
  }, []);
  return t;
}

export function FinePrint({
  terms,
  businessDefault,
  primary,
  compact = false,
  className = "",
}: {
  /** The reward's own terms. Null/blank → business default. */
  terms?: string | null;
  /** businesses.reward_fine_print */
  businessDefault?: string | null;
  primary?: string;
  /** Collapsed by default with a "Reward terms" toggle (for tight sheets). */
  compact?: boolean;
  className?: string;
}) {
  const platform = usePlatformTerms();
  const [open, setOpen] = useState(!compact);
  const vendorTerms = (terms ?? "").trim() || (businessDefault ?? "").trim();

  return (
    <div className={`rounded-xl border bg-zinc-50 text-left ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3.5 py-2.5"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-zinc-500">
          <Info className="h-3.5 w-3.5" style={primary ? { color: primary } : undefined} /> Reward terms
        </span>
        <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 space-y-2 text-[11.5px] leading-snug text-zinc-600">
          {vendorTerms && <p className="whitespace-pre-line text-zinc-700">{vendorTerms}</p>}
          {platform.vendor_terms_hint && <p className="font-semibold text-zinc-600">{platform.vendor_terms_hint}</p>}
          {platform.reward_disclaimer && <p className="text-zinc-500">{platform.reward_disclaimer}</p>}
        </div>
      )}
    </div>
  );
}
