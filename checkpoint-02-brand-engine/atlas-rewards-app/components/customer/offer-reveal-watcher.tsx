"use client";
/**
 * OfferRevealWatcher — CP-29.1
 *
 * Sits in the customer app shell. Subscribes to the offers table for the
 * current business. The first time it sees a *new* offer id (one not in
 * the per-device seen-set) it shows <OfferRevealPopup/>.
 *
 * Seen-set is stored under localStorage key `atlas-offer-seen-<businessId>`
 * as a JSON array of offer ids. We cap the array at the most recent 50 ids
 * so it never grows unbounded — older offers will replay if they somehow
 * still happen to be active, which is fine (they're expired).
 *
 * Listens to:
 *   • postgres_changes on public.offers (INSERT + UPDATE) — fires the
 *     moment trigger_automated_offers() runs and adds a row.
 *   • On mount: fetches the current featured offer via featured_offer()
 *     so refresh paths still see the popup if they missed the realtime
 *     event.
 */

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { OfferRevealPopup, type RevealOffer } from "./offer-reveal-popup";
import { useToast } from "@/components/ui/toast";

const MAX_SEEN = 50;

function seenKey(businessId: string) {
  return `atlas-offer-seen-${businessId}`;
}

function loadSeen(businessId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(seenKey(businessId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function markSeen(businessId: string, offerId: string) {
  if (typeof window === "undefined") return;
  try {
    const list = loadSeen(businessId);
    if (list.includes(offerId)) return;
    const next = [offerId, ...list].slice(0, MAX_SEEN);
    window.localStorage.setItem(seenKey(businessId), JSON.stringify(next));
  } catch { /* localStorage disabled — fail silently */ }
}

export function OfferRevealWatcher({
  businessId,
  businessName,
  primary,
  secondary,
}: {
  businessId: string;
  businessName: string;
  primary: string;
  secondary?: string | null;
}) {
  const [active, setActive] = useState<RevealOffer | null>(null);
  // Ref-mirror of seen so the realtime callback isn't stale-closed.
  const seenRef = useRef<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    seenRef.current = loadSeen(businessId);
  }, [businessId]);

  // ── try once on mount via featured_offer() so manual refreshes still pop ─
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.rpc("featured_offer", { p_business_id: businessId });
      const row = (Array.isArray(data) ? data[0] : null) as RevealOffer | null;
      if (cancelled || !row?.id) return;
      if (!seenRef.current.includes(row.id)) {
        setActive(row);
      }
    })();
    return () => { cancelled = true; };
  }, [businessId]);

  // ── realtime: new offer rows trigger the popup immediately ───────────────
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`offer-watch-${businessId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "offers", filter: `business_id=eq.${businessId}` },
        async () => {
          // Re-pull the canonical "featured" offer so we always show the
          // right one (the INSERT might not itself be featured).
          const { data } = await supabase.rpc("featured_offer", { p_business_id: businessId });
          const row = (Array.isArray(data) ? data[0] : null) as RevealOffer | null;
          if (!row?.id) return;
          if (!seenRef.current.includes(row.id)) {
            setActive(row);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "offers", filter: `business_id=eq.${businessId}` },
        async (payload) => {
          // Featured toggled? Re-check.
          const newRow = payload.new as { is_featured?: boolean } | null;
          if (!newRow?.is_featured) return;
          const { data } = await supabase.rpc("featured_offer", { p_business_id: businessId });
          const row = (Array.isArray(data) ? data[0] : null) as RevealOffer | null;
          if (!row?.id) return;
          if (!seenRef.current.includes(row.id)) {
            setActive(row);
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [businessId]);

  function handleDismiss() {
    if (active?.id) {
      markSeen(businessId, active.id);
      seenRef.current = [active.id, ...seenRef.current].slice(0, MAX_SEEN);
    }
    setActive(null);
  }

  // CP-36: actually persist the save. save_offer() is idempotent and
  // returns the row id — we don't need it. Fire-and-forget; the new
  // SavedGiftsSection on the Rewards tab subscribes to
  // customer_saved_offers so the row appears live without a refresh.
  async function handleSave() {
    if (!active?.id) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("save_offer", { p_offer_id: active.id });
    if (error) {
      // RPC not installed yet (cp36 SQL not applied) — fail soft.
      // The user already saw "Added to your rewards automatically" so
      // we don't want to contradict that with a red toast; just log.
      console.warn("[save_offer] skipped:", error.message);
      return;
    }
    toast.success("Saved to your rewards ✨");
  }

  if (!active) return null;
  return (
    <OfferRevealPopup
      offer={active}
      primary={primary}
      secondary={secondary ?? primary}
      businessName={businessName}
      onDismiss={handleDismiss}
      onSave={handleSave}
    />
  );
}
