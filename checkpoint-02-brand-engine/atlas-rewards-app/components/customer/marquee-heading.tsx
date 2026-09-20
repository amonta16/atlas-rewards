"use client";
/**
 * MarqueeHeading — CP-143.
 *
 * A section heading that carries a number.
 *
 * The problem it solves: the Rewards tab had three headings ("Your active
 * rewards", "Limited offers", "Rewards store") that all mean "rewards" to a
 * customer, each styled differently, and none of them said anything the
 * customer didn't already know from looking at the cards underneath. A label
 * that carries no information is just noise taking up 40px.
 *
 * So the heading gets a job: state the lane AND the number that decides what
 * you can do in it. "REWARDS STORE · 760 PTS" tells you where you are and
 * what you can afford in one line. "YOUR WALLET · 12 ITEMS" tells you how far
 * the rail scrolls before you touch it — which is the one thing horizontal
 * rails normally hide.
 *
 * Deliberately NOT a replacement for SectionHeading everywhere: this treatment
 * is loud, and loud is right for an arcade and wrong for a med spa. It is
 * opt-in per business through heading_style = "marquee".
 */
import type { CSSProperties } from "react";

export function MarqueeHeading({
  children,
  chip,
  primary,
  secondary,
  rule = true,
  className = "",
}: {
  children: React.ReactNode;
  /** The number. Points balance, item count — whatever decides the next action. */
  chip?: string | null;
  primary: string;
  secondary?: string | null;
  /** The accent rule underneath. Off for a secondary section. */
  rule?: boolean;
  className?: string;
}) {
  // Three-stop rule: brand primary, a short secondary flash, then it fades
  // into the divider colour. Reads as a racing stripe rather than a border.
  const ruleStyle: CSSProperties = {
    background: `linear-gradient(90deg, ${primary} 0%, ${primary} 42%, ${secondary ?? primary} 42%, ${secondary ?? primary} 58%, rgba(0,0,0,0.08) 58%)`,
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2.5">
        <h2
          className="text-[22px] font-black uppercase leading-none tracking-tight m-0"
          style={{ color: "var(--surf-fg)" }}
        >
          {children}
        </h2>
        {chip && (
          <span
            className="ml-auto shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-black tabular-nums text-white"
            style={{ background: primary }}
          >
            {chip}
          </span>
        )}
      </div>
      {rule && <div className="mt-1.5 h-[4px] rounded-full" style={ruleStyle} />}
    </div>
  );
}
