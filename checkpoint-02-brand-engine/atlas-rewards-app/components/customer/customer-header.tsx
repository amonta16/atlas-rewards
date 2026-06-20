"use client";
/**
 * CustomerHeader — CP-52.4
 *
 * The top bar (logo + quick-action pills) shown on EVERY customer tab, not
 * just Home. Rendered by the app shell so Home, Check-in, Rewards and
 * Profile all share the same header. Subtle dotted "paper" texture for a
 * touch of warmth over the plain white.
 */
import { HeaderActions } from "./header-actions";
import { readableTextColor } from "@/lib/patterns";
import type { Business, Membership } from "@/lib/types/database";

export function CustomerHeader({
  business, membershipId, membership, vipEnabled, headerColor,
}: {
  business: Business;
  membershipId: string | null;
  membership: Membership | null;
  vipEnabled: boolean;
  /** CP-54: header bar color (null = default near-white). */
  headerColor?: string | null;
}) {
  // CP-54: adapt the dotted texture + border to a light vs dark header so it
  // stays a subtle "paper" texture either way.
  const bg = headerColor ?? "#fcfcfd";
  const isDark = readableTextColor(bg) === "#f4f4f5";
  const dot = isDark ? "rgba(255,255,255,0.07)" : "rgba(15,23,42,0.05)";
  const border = isDark ? "rgba(255,255,255,0.10)" : "#e4e4e7";
  return (
    <div
      className="px-4 pt-3 pb-3 flex items-center justify-between border-b"
      style={{
        backgroundColor: bg,
        backgroundImage: `radial-gradient(${dot} 1px, transparent 1.5px)`,
        backgroundSize: "13px 13px",
        borderColor: border,
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
      }}
    >
      {business.logo_url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={business.logo_url} alt={business.name} className="h-9 max-w-[140px] object-contain" />
      ) : (
        <div
          className="h-9 px-3 rounded-full flex items-center text-white text-xs font-bold max-w-[160px]"
          style={{ background: business.brand_colors.primary }}
        >
          <span className="truncate">{business.name}</span>
        </div>
      )}
      <HeaderActions
        business={business}
        membershipId={membershipId}
        membership={membership}
        vipEnabled={vipEnabled}
        headerColor={bg}
      />
    </div>
  );
}
