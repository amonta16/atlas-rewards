"use client";
import { Home, ShoppingBag, ScanLine, Gift, User, CalendarClock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { WidgetConfig } from "@/lib/types/database";
import { useReviewStatus, reviewBadgeTone } from "@/lib/hooks/use-review-status";
// CP-42: one-time first-visit nudge pointing at the bell.
import { EnablePushNudge } from "./enable-push-nudge";

type TabDef = { href: string; label: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> };

const HOME:    TabDef = { href: "",         label: "Home",    icon: Home };
const SHOP:    TabDef = { href: "/shop",    label: "Shop",    icon: ShoppingBag };
const BOOK:    TabDef = { href: "/book",    label: "Book",    icon: CalendarClock };
// CP-39: renamed "Scan" → "Check in" so the bottom nav matches the
// language we use everywhere else (front-desk scans a QR, customer
// "checks in"). Same /scan route under the hood.
const SCAN:    TabDef = { href: "/scan",    label: "Check in", icon: ScanLine };
const REWARDS: TabDef = { href: "/rewards", label: "Rewards", icon: Gift };
const PROFILE: TabDef = { href: "/profile", label: "Profile", icon: User };

/**
 * Build the tab list based on enabled features.
 *
 * Always-on: Home, Scan, Rewards, Profile.
 * Optional middle slots: Shop (if widget_config.shop), Book (if widget_config.booking).
 * We cap the visible tabs at 5 to keep the bar readable on small screens;
 * if both Shop and Book are on, Profile becomes a slide-out (drop from the bar).
 */
export function tabsForConfig(_w: WidgetConfig): TabDef[] {
  // Atlas is loyalty-only — Shop and Book tabs were removed in CP-06.
  // The flags still exist on stale data but we no longer surface them.
  const base: TabDef[] = [HOME, SCAN, REWARDS, PROFILE];
  return base;
}

export function CustomerAppShell({
  primary,
  widgetConfig,
  children,
  /** CP-32: passed by the customer layout so we can live-update the
   *  Rewards-tab red/orange "!" badge for unsubmitted/pending Google
   *  review verification. */
  businessId,
  membershipId,
}: {
  primary: string;
  widgetConfig: WidgetConfig;
  children: React.ReactNode;
  businessId?: string | null;
  membershipId?: string | null;
}) {
  const pathname = usePathname();
  // CP-45 404 fix: the nav used a hard-coded `/app` base. That works on the
  // installed PWA (subdomain → middleware injects the slug), but breaks
  // path-based access — the agency preview and the "Customer app" button
  // open /<slug>/app, where a hard `/app/rewards` link has no slug → 404.
  // Derive the base from the CURRENT pathname instead, so links work on
  // both the subdomain (`/app/...`) and path (`/<slug>/app/...`) forms.
  // The regex anchors `/app` at a segment boundary so slugs like
  // "apple-spa" can't false-match.
  const basePath = pathname?.match(/^(.*?\/app)(\/|$)/)?.[1] ?? "/app";
  const tabs = tabsForConfig(widgetConfig);

  // CP-32: review nudge badge on Rewards tab.
  // Visible review widget? then we care. If the business hasn't enabled
  // reviews this hook still returns "none" (no review yet) — but we only
  // surface the badge when widget_config.reviews is on AND the business
  // has a google_review_url-style URL set. We can't read that here without
  // a fetch, so we just gate on widget_config.reviews.
  const reviewStatus = useReviewStatus(
    widgetConfig?.reviews ? (businessId ?? null) : null,
    widgetConfig?.reviews ? (membershipId ?? null) : null,
  );
  const reviewTone = widgetConfig?.reviews ? reviewBadgeTone(reviewStatus) : false;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      {/* CP-42: arrow-points-at-bell nudge on first visit when push
          permission is still "default". Self-dismisses after 8s or on
          tap. Stores a flag in localStorage so it never re-shows. */}
      <EnablePushNudge primary={primary} businessId={businessId ?? null} />
      <main className="flex-1 pb-20">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-zinc-200 px-1 py-1.5 flex items-center justify-around z-40">
        {tabs.map(t => {
          // CP-32: red/orange "!" badge on the Rewards tab — itches the
          // user into submitting (or finishing) a Google review.
          // CP-35: when the badge is active, the link includes ?focus=review
          // so the rewards page scrolls directly to the review row.
          const isRewards = t.label === "Rewards";
          const showBadge = isRewards && reviewTone !== false;
          const href = `${basePath}${t.href}` + (showBadge ? "?focus=review" : "");
          const active = pathname === `${basePath}${t.href}` || (t.href === "" && pathname === basePath);
          const Icon = t.icon;
          return (
            <Link key={t.label} href={href} className="flex flex-col items-center gap-0.5 py-1 px-2 flex-1 active:scale-95 transition-transform relative">
              <div className="relative">
                <Icon className={cn("h-5 w-5")} style={{ color: active ? primary : "#9ca3af" }} />
                {showBadge && (
                  <span
                    aria-label={reviewTone === "orange" ? "Review pending verification" : "Google review available"}
                    className={cn(
                      "absolute -top-1.5 -right-2 h-4 w-4 rounded-full text-white text-[10px] font-extrabold flex items-center justify-center shadow ring-2 ring-white",
                      reviewTone === "orange" ? "bg-amber-500" : "bg-rose-500",
                    )}
                    // CP-42: itchy wobble — short rotate-shake bursts every
                    // few seconds so it visually itches the customer into
                    // tapping. Replaces the steady pulse.
                    style={{
                      animation: "atlas-itch-wobble 3.6s ease-in-out infinite",
                      transformOrigin: "center center",
                    }}
                  >!</span>
                )}
              </div>
              <span className="text-[10px] font-semibold" style={{ color: active ? primary : "#9ca3af" }}>{t.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
