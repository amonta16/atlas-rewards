"use client";
/**
 * CP-179 — two-way switch between the guest app and the front desk for
 * people who are BOTH a guest and staff (owners, managers, front desk).
 *
 * Paths are derived from the current URL so they work on both topologies:
 *   subdomain  flippos.atlas-engine.app/manage  →  /app
 *   path-based atlas-engine.app/flippos/manage  →  /flippos/app
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Shield, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

function useSwitchHref(from: "manage" | "app", to: "app" | "manage") {
  const [href, setHref] = useState(`/${to}`);
  useEffect(() => {
    const re = new RegExp(`/${from}(/.*)?$`);
    const base = window.location.pathname.replace(re, "");
    setHref(`${base}/${to}`);
  }, [from, to]);
  return href;
}

/** In the front desk: "My guest app". `tone="dark"` for the navy sidebar. */
export function GuestAppLink({ tone = "light", compact = false }: { tone?: "light" | "dark"; compact?: boolean }) {
  const href = useSwitchHref("manage", "app");
  return (
    <Link
      href={href}
      title="Open the guest app as yourself"
      className={cn(
        "flex items-center gap-2.5 rounded-lg font-semibold",
        compact ? "h-9 px-2.5 text-sm" : "w-full h-9 px-2.5 text-[13px]",
        tone === "dark" ? "text-zinc-300 hover:bg-white/[0.07] hover:text-white" : "text-zinc-700 hover:bg-zinc-100",
      )}
    >
      <Smartphone className="h-4 w-4" />
      <span className={cn(compact && "hidden sm:inline")}>My guest app</span>
    </Link>
  );
}

/** In the guest app's Profile tab — only rendered for staff accounts. */
export function FrontDeskCard({ primary }: { primary: string }) {
  const href = useSwitchHref("app", "manage");
  return (
    <Link href={href} className="mx-4 mt-4 flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm transition hover:shadow-md">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: primary }}>
        <Shield className="h-5 w-5" />
      </span>
      <span className="flex-1">
        <span className="block text-[15px] font-semibold text-zinc-900">Open the front desk</span>
        <span className="block text-xs text-zinc-500">You&apos;re staff here. Your guest app stays as-is.</span>
      </span>
      <ChevronRight className="h-5 w-5 text-zinc-400" />
    </Link>
  );
}
