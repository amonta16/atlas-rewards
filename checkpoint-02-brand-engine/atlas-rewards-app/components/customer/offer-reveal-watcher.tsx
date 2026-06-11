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
import { isBellOnboardDone } from "./enable-push-nudge";
import { useToast } from "@/components/ui/toast";
// CP-46: one-overlay-at-a-time so the gift reveal never lands on top of the
// confetti or the notification spotlight.
import { claimPopup, releasePopup, useActivePopup, PopupPriority } from "@/lib/popup-coordinator";

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
  membershipId,
}: {
  businessId: string;
  businessName: string;
  primary: string;
  secondary?: string | null;
  /** CP-45: lets the watcher fetch the member's own un-revealed welcome
   *  gift (server-tracked) instead of relying on the per-device seen list. */
  membershipId?: string | null;
}) {
  const [active, setActive] = useState<RevealOffer | null>(null);
  // CP-46: which coordinator slot this reveal is holding ("welcome-gift"
  // or "featured-offer"), so we render only when we own the screen.
  const claimIdRef = useRef<string | null>(null);
  const screenOwner = useActivePopup();
  // CP-45: when the active reveal is a welcome gift, this holds the
  // customer_saved_offers row id so dismissal can mark it revealed
  // server-side (once per MEMBER, not per device).
  const welcomeSavedIdRef = useRef<string | null>(null);
  // Ref-mirror of seen so the realtime callback isn't stale-closed.
  const seenRef = useRef<string[]>([]);
  // CP-43.3: a pending reveal timer so the welcome gift waits for the bell
  // onboarding to finish (then a short cooldown) before popping — the two
  // never fight for the screen.
  const revealTimer = useRef<number | null>(null);
  const { toast } = useToast();

  // Queue a reveal: only pop once the bell onboarding moment is done, then
  // after a brief cooldown so it feels like a deliberate "and now your gift"
  // beat rather than a pile-up.
  function queueReveal(row: RevealOffer, kind: "welcome" | "featured") {
    const claimId = kind === "welcome" ? "welcome-gift" : "featured-offer";
    const priority = kind === "welcome" ? PopupPriority.welcomeGift : PopupPriority.featuredOffer;
    const show = () => {
      claimIdRef.current = claimId;
      claimPopup(claimId, priority);   // coordinator decides when we actually render
      setActive(row);
    };
    if (typeof window === "undefined") { show(); return; }
    if (revealTimer.current) return; // already queued
    const COOLDOWN_MS = 900;
    const tick = () => {
      if (isBellOnboardDone(businessId)) {
        revealTimer.current = window.setTimeout(() => {
          revealTimer.current = null;
          show();
        }, COOLDOWN_MS);
      } else {
        revealTimer.current = window.setTimeout(tick, 500);
      }
    };
    tick();
  }

  // Clean up any pending timer on unmount.
  useEffect(() => () => { if (revealTimer.current) window.clearTimeout(revealTimer.current); }, []);

  useEffect(() => {
    seenRef.current = loadSeen(businessId);
  }, [businessId]);

  // ── CP-45: the member's own welcome gift takes priority over the
  // business-wide featured offer. It's tracked server-side (revealed_at on
  // customer_saved_offers), so it fires exactly once per MEMBER — a second
  // test account on the same device, or a business that already has a
  // featured offer, no longer swallows the welcome popup + voice note.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      // 1) Welcome gift first.
      const { data: gift, error } = await supabase.rpc("my_unrevealed_welcome_gift", {
        p_business_id: businessId,
      });
      const giftRow = (Array.isArray(gift) ? gift[0] : null) as
        | (RevealOffer & { saved_id: string; offer_id: string; gift_reward_name?: string | null })
        | null;
      if (cancelled) return;
      if (!error && giftRow?.saved_id) {
        welcomeSavedIdRef.current = giftRow.saved_id;
        queueReveal({
          id: giftRow.offer_id,
          title: giftRow.title,
          // Reward-mode gifts: surface the reward's name when there's no body.
          description: giftRow.description ?? (giftRow.gift_reward_name ? `Your gift: ${giftRow.gift_reward_name}` : null),
          image_url: giftRow.image_url,
          voice_message_url: giftRow.voice_message_url,
          expires_at: giftRow.expires_at,
          discount_type: giftRow.discount_type,
          discount_value: giftRow.discount_value,
        }, "welcome");
        return;
      }
      // 2) Fall back to the featured offer (per-device seen list, as before).
      const { data } = await supabase.rpc("featured_offer", { p_business_id: businessId });
      const row = (Array.isArray(data) ? data[0] : null) as RevealOffer | null;
      if (cancelled || !row?.id) return;
      if (!seenRef.current.includes(row.id)) {
        queueReveal(row, "featured");
      }
    })();
    return () => { cancelled = true; };
  }, [businessId, membershipId]);

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
            queueReveal(row, "featured");
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
            queueReveal(row, "featured");
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
    // CP-45: welcome gifts are marked revealed server-side so they never
    // replay on this OR any other device for this member.
    if (welcomeSavedIdRef.current) {
      const savedId = welcomeSavedIdRef.current;
      welcomeSavedIdRef.current = null;
      const supabase = createClient();
      supabase.rpc("mark_welcome_gift_revealed", { p_saved_id: savedId })
        .then(({ error }) => {
          if (error) console.warn("[welcome reveal] mark failed:", error.message);
        });
    }
    // CP-46: hand the screen back so any queued reveal can take its turn.
    if (claimIdRef.current) {
      releasePopup(claimIdRef.current);
      claimIdRef.current = null;
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

  // CP-46: only render when we actually own the screen. While a
  // higher-priority overlay (notifications, confetti) is up, we hold our
  // claim but stay hidden, then appear the moment it releases.
  if (!active || screenOwner !== claimIdRef.current) return null;
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
