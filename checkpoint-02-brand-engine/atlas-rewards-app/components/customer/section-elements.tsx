/**
 * section-elements.tsx — CP-67
 *
 * Shared heading + divider elements that wear the business's picked element
 * styles (lib/element-styles.ts). No hooks and no "use client" directive on
 * purpose — usable from server pages AND client components alike.
 */
import type { Business } from "@/lib/types/database";
import { dividerStyleId, headingStyleId } from "@/lib/element-styles";

/** A section title that follows businesses.heading_style. */
export function SectionHeading({
  business,
  children,
  className = "text-base",
}: {
  business: Business;
  children: React.ReactNode;
  /** Size/extra classes — defaults to the standard section-title size. */
  className?: string;
}) {
  return (
    <HeadingByStyle
      styleId={business.heading_style}
      primary={business.brand_colors.primary}
      secondary={business.brand_colors.secondary}
      className={className}
    >
      {children}
    </HeadingByStyle>
  );
}

/** Same heading, driven by primitives — for components that don't hold the
 *  full Business object (e.g. LimitedOffersSection). */
export function HeadingByStyle({
  styleId,
  primary,
  secondary,
  children,
  className = "text-base",
}: {
  styleId: string | null | undefined;
  primary: string;
  secondary?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  const id = headingStyleId(styleId);
  const p = primary;
  const s = secondary || primary;
  const grad = `linear-gradient(135deg, ${p}, ${s})`;

  if (id === "sticker") {
    return (
      <h2 className={`inline-block font-extrabold text-white px-2.5 py-1 rounded-lg shadow-sm ${className}`}
        style={{ background: grad }}>
        {children}
      </h2>
    );
  }
  if (id === "bar") {
    return (
      <h2 className={`flex items-center gap-2 font-bold ${className}`} style={{ color: "var(--surf-fg)" }}>
        <span className="inline-block h-4 w-1.5 rounded-full shrink-0" style={{ background: grad }} />
        {children}
      </h2>
    );
  }
  if (id === "underline") {
    return (
      <h2 className={`inline-block font-bold ${className}`} style={{ color: "var(--surf-fg)" }}>
        {children}
        <span className="block h-[3px] w-8 rounded-full mt-1" style={{ background: grad }} />
      </h2>
    );
  }
  // plain (default) — identical to the pre-CP-67 headings.
  return (
    <h2 className={`font-bold ${className}`} style={{ color: "var(--surf-fg)" }}>
      {children}
    </h2>
  );
}

/** A separator between big sections — businesses.divider_style. */
export function SectionDivider({ business }: { business: Business }) {
  const id = dividerStyleId(business.divider_style);
  if (id === "none") return null;
  const p = business.brand_colors.primary;

  if (id === "dots") {
    return (
      <div className="flex items-center justify-center gap-1.5 my-5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: `${p}55` }} />
        ))}
      </div>
    );
  }
  if (id === "sparkle") {
    return (
      <div className="flex items-center gap-3 px-8 my-5" aria-hidden>
        <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${p}44)` }} />
        <span className="text-[10px]" style={{ color: `${p}99` }}>✦</span>
        <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${p}44, transparent)` }} />
      </div>
    );
  }
  // line
  return (
    <div className="px-8 my-5" aria-hidden>
      <div className="h-px" style={{ background: `linear-gradient(90deg, transparent, ${p}55, transparent)` }} />
    </div>
  );
}
