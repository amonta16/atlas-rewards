"use client";
/**
 * popup-coordinator — CP-46
 *
 * One screen, one popup at a time. Several auto-appearing overlays in the
 * customer app used to fight for the screen the instant a new member
 * landed: the notification (bell) onboarding, the welcome-bonus confetti,
 * the welcome-gift reveal, and the featured-offer reveal could all fire
 * together and stack on top of each other.
 *
 * This is a tiny module-level singleton (shared across every component on
 * the page) that holds the set of overlays currently *wanting* to show,
 * each with a priority. Only the highest-priority claim is "active"; the
 * rest wait their turn. When the active one releases, the next-highest
 * becomes active automatically.
 *
 * Lower PRIORITY number = shows first. Notifications are first, by design.
 *
 * Usage in a component:
 *   const active = useActivePopup();
 *   // when you have something to show:
 *   claimPopup("welcome-gift", PopupPriority.welcomeGift);
 *   // render your modal only when you own the screen:
 *   if (active === "welcome-gift") return <Modal .../>;
 *   // on dismiss:
 *   releasePopup("welcome-gift");
 *
 * The bell onboarding (EnablePushNudge) keeps its own localStorage flag
 * (isBellOnboardDone) AND claims here while visible, so other overlays
 * both wait for the flag and never overlap the spotlight.
 */

export const PopupPriority = {
  /** Notification opt-in onboarding — always first. */
  notifications: 0,
  /** Welcome / points-earned confetti. */
  celebrate: 10,
  /** The member's personal welcome gift reveal. */
  welcomeGift: 20,
  /** Business-wide featured / automated offer reveal. */
  featuredOffer: 30,
} as const;

type Claim = { id: string; priority: number };

let claims: Claim[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Highest-precedence (lowest-number) active claim id, or null. */
export function activePopupId(): string | null {
  if (claims.length === 0) return null;
  return claims.reduce((best, c) => (c.priority < best.priority ? c : best)).id;
}

/** Register intent to show. Safe to call repeatedly (idempotent per id). */
export function claimPopup(id: string, priority: number) {
  const existing = claims.find((c) => c.id === id);
  if (existing) {
    if (existing.priority === priority) return;
    existing.priority = priority;
  } else {
    claims = [...claims, { id, priority }];
  }
  emit();
}

/** Give up the screen so the next-highest claim can take over. */
export function releasePopup(id: string) {
  const next = claims.filter((c) => c.id !== id);
  if (next.length === claims.length) return;
  claims = next;
  emit();
}

import { useEffect, useState } from "react";

/** Subscribe to "who owns the screen right now". */
export function useActivePopup(): string | null {
  const [active, setActive] = useState<string | null>(() => activePopupId());
  useEffect(() => {
    const update = () => setActive(activePopupId());
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);
  return active;
}
