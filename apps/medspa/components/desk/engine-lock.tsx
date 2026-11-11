"use client";
/**
 * Lead-magnet audit, step 4 · on a preview desk the engine is dark and visibly so.
 *
 * Everything that would FIRE to patients (automated offers, recall reminders, win-back sends,
 * the always-on campaign cards) is greyed out and locked, with "Turn on to fire." on hover and
 * focus. The app itself (treatments, plans, rewards, the patient list) stays fully usable:
 * blur the engine, never the app. Live clinics and the demo are never locked.
 */
import { createContext, useContext } from "react";
import { IcLock } from "../icons";

export const LOCK_TIP = "Turn on to fire.";

const Ctx = createContext(false);
export function EngineLockProvider({ locked, children }: { locked: boolean; children: React.ReactNode }) {
  return <Ctx.Provider value={locked}>{children}</Ctx.Provider>;
}
export const useEngineLocked = () => useContext(Ctx);

function Tip() {
  return (
    <span role="tooltip" className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-[8px] bg-ink px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-lg group-hover/lock:block group-focus-visible/lock:block">
      {LOCK_TIP}
    </span>
  );
}

/** The small grey "Locked" pill that stands in for an on/off switch. */
export function LockPill({ className = "" }: { className?: string }) {
  return (
    <span tabIndex={0} title={LOCK_TIP} aria-label={`Locked. ${LOCK_TIP}`} onClick={(e) => e.stopPropagation()}
      className={`group/lock relative inline-flex h-6 shrink-0 cursor-not-allowed items-center justify-center gap-1 rounded-full bg-[#EEF0F2] px-2.5 text-[11.5px] font-semibold text-faint ring-1 ring-line ${className}`}>
      <IcLock className="h-3.5 w-3.5" strokeWidth={2} />Locked
      <Tip />
    </span>
  );
}

/**
 * Wraps an engine control or card: when locked it is greyed, can't be clicked or tabbed into,
 * and shows a lock badge plus the tooltip. Unlocked, it renders the children untouched.
 */
export function EngineGate({ children, className = "", badge = "corner" }: {
  children: React.ReactNode; className?: string;
  /** Where the "Locked" badge sits: a card's corner, a toggle row's right end, or none (small buttons). */
  badge?: "corner" | "right" | "none";
}) {
  const locked = useEngineLocked();
  if (!locked) return <>{children}</>;
  return (
    <div tabIndex={0} title={LOCK_TIP} aria-label={LOCK_TIP} className={`group/lock relative cursor-not-allowed ${className}`}>
      {/* `inert` keeps clicks and focus out of the locked control (React 18 has no typed prop for it). */}
      <div aria-hidden className="pointer-events-none select-none opacity-45 grayscale" ref={(el) => { el?.setAttribute("inert", ""); }}>{children}</div>
      {badge !== "none" && (
        <span className={`absolute inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-sub ring-1 ring-line ${badge === "right" ? "right-3 top-1/2 -translate-y-1/2" : "right-2 top-2"}`}>
          <IcLock className="h-3 w-3" strokeWidth={2} />Locked
        </span>
      )}
      <Tip />
    </div>
  );
}
