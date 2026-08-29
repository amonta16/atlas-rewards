"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Palette, Settings, ChevronsLeft, HelpCircle, LogOut, Shield, Radar, BarChart3, Rocket, Wallet } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type NavItem = { href: string; label: string; icon: React.ReactNode; adminOnly?: boolean };

const NAV: NavItem[] = [
  { href: "/agency",              label: "My Apps",     icon: <LayoutGrid className="h-4 w-4" /> },
  // CP-111: Founder Headquarters — meetings, field-sales calendar, action
  // items, door-to-door scorecard. adminOnly here is cosmetic; the page
  // enforces the agency_admin check server-side.
  { href: "/agency/headquarters", label: "Headquarters", icon: <Radar className="h-4 w-4" />, adminOnly: true },
  // CP-60: analytics split into its own tab. CP-111 rebuilt it as Revenue
  // Analytics (live vs pipeline MRR) and absorbed the CP-50 /agency/pipeline
  // board — that route now permanently redirects here.
  { href: "/agency/analytics",    label: "Revenue Analytics", icon: <BarChart3 className="h-4 w-4" />, adminOnly: true },
  // CP-112: internal bookkeeping — hosting costs, bills, expenses, mileage,
  // receipts, accountant export. Server-side admin gate in the page.
  { href: "/agency/bookkeeping",  label: "Bookkeeping", icon: <Wallet className="h-4 w-4" />, adminOnly: true },
  // CP-33: White Label tab hidden from sidebar — placeholder until we
  // actually build out the master Atlas brand splash. The route file
  // (/agency/white-label/page.tsx) is still there if we re-enable it.
  // { href: "/agency/white-label",  label: "White Label", icon: <Palette className="h-4 w-4" /> },
  // CP-31: Team management for assistant agency admins.
  { href: "/agency/team",         label: "Team",        icon: <Shield className="h-4 w-4" />, adminOnly: true },
  // CP-63: Atlas Command — configure the mobile Admin/Field App (reps only).
  { href: "/agency/admin-app",    label: "Admin App",   icon: <Rocket className="h-4 w-4" />, adminOnly: true },
  { href: "/agency/settings",     label: "Settings",    icon: <Settings className="h-4 w-4" />, adminOnly: true },
];

/**
 * Agency dashboard sidebar.
 *
 * Styled with a dark brand-primary gradient (premium SaaS look — alike to
 * Patient App's polish). Uses the global `--brand-primary` CSS var that the
 * agency configures in White Label so the bar always reflects the active
 * brand color.
 */
export function Sidebar({
  context, contextLabel, role = "agency_admin",
}: { context?: string; contextLabel?: string; role?: "agency_admin" | "agency_va" }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  // CP-62: a VA only sees "My Apps"; the admin-only tabs are hidden.
  const nav = role === "agency_va" ? NAV.filter(item => !item.adminOnly) : NAV;

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "shrink-0 flex flex-col text-white transition-all duration-200 relative overflow-hidden",
        collapsed ? "w-16" : "w-64",
      )}
      style={{
        // Deep ocean-blue gradient — fixed, NOT brand-tinted. Matches the
        // "ocean blue not purple" direction Andrew gave: top is a rich
        // mid-ocean tone, fading to nearly-black abyssal at the bottom.
        background:
          "linear-gradient(180deg, #0a3d62 0%, #062b4a 45%, #061a32 100%)",
      }}
    >
      {/* Subtle cyan glow up top — gives the ocean a sun-through-water feel */}
      <div
        className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-48 w-48 rounded-full opacity-25 blur-3xl"
        style={{ background: "#22d3ee" }}
      />

      {/* Logo */}
      <div className="relative h-20 flex items-center justify-center border-b border-white/10 px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/atlas-engine-logo.png"
          alt="Atlas Engine"
          className={cn("transition-all", collapsed ? "h-8" : "h-12", "drop-shadow-lg")}
        />
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="relative mx-3 mt-3 flex items-center gap-2 text-xs text-white/60 hover:text-white"
      >
        <ChevronsLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        {!collapsed && <span>Collapse</span>}
      </button>

      {/* Sub-account context picker (visible when inside a business) */}
      {context && !collapsed && (
        <div className="relative mx-3 mt-4">
          <button className="w-full flex items-center justify-between rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/15 backdrop-blur-sm">
            <span className="truncate text-left">{contextLabel ?? context}</span>
            <span className="text-white/60 text-xs">⇅</span>
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="relative flex-1 px-3 mt-4 space-y-1">
        {nav.map(item => {
          const active = pathname === item.href || (item.href !== "/agency" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-white/15 text-white shadow-inner ring-1 ring-white/20"
                  : "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && active && <span className="ml-auto text-xs">›</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer card */}
      {!collapsed && (
        <div className="relative mx-3 mb-3 rounded-xl border border-white/10 bg-white/10 backdrop-blur-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 rounded-full bg-white/15 text-white flex items-center justify-center">
              <HelpCircle className="h-4 w-4" />
            </div>
            <div className="text-sm font-semibold text-white">Need support?</div>
          </div>
          <p className="text-xs text-white/70 mb-2">
            Configure your support contact in Settings.
          </p>
          <Link href="/agency/settings" className="text-xs font-medium text-white hover:underline">
            Open settings →
          </Link>
        </div>
      )}

      {/* Sign out */}
      <button
        onClick={signOut}
        className="relative flex items-center gap-3 px-6 py-3 border-t border-white/10 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
      >
        <LogOut className="h-4 w-4" />
        {!collapsed && <span>Sign out</span>}
      </button>
    </aside>
  );
}
