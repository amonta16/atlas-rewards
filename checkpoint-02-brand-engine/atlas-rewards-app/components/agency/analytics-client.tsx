"use client";
import { useState, useEffect } from "react";
import { Building2, Users, Activity } from "lucide-react";
import { AgencyMetrics } from "./agency-metrics";
import { createClient } from "@/lib/supabase/client";

type Rollup = {
  total_businesses: number; active_businesses: number;
  total_members: number; active_30d: number;
  revenue_30d_cents: number;
};

/**
 * CP-60: Analytics tab. The KPI pills + charts that used to live under the
 * business list on the old combined dashboard, now on their own.
 */
export function AnalyticsClient({ friendlyName }: { friendlyName: string }) {
  const [rollup, setRollup] = useState<Rollup | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("agency_rollup").then(({ data }) => setRollup(data as Rollup | null));
  }, []);

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg, #061a32 0%, #04132a 50%, #020c1c 100%)" }}
    >
      <header className="relative px-8 pt-10 pb-7 overflow-hidden">
        <div className="pointer-events-none absolute -top-24 right-10 h-64 w-64 rounded-full blur-3xl opacity-30"
          style={{ background: "#22d3ee" }} />
        <div className="pointer-events-none absolute -top-10 -left-10 h-48 w-48 rounded-full blur-3xl opacity-20"
          style={{ background: "#1d6fa5" }} />
        <div className="relative text-white">
          <div className="text-[11px] uppercase tracking-[0.3em] font-extrabold text-sky-300/70">Atlas Engine · Analytics</div>
          <h1 className="text-4xl font-extrabold tracking-tight mt-1 drop-shadow">How your agency is performing 📈</h1>
          <p className="text-sm text-sky-200/60 mt-1">Revenue, portfolio, and member activity across every app.</p>
        </div>

        <div className="relative mt-6 flex flex-wrap gap-2.5">
          <Pill icon={<Building2 className="h-3.5 w-3.5" />} label="Businesses" value={rollup?.total_businesses ?? "—"} />
          <Pill icon={<Users className="h-3.5 w-3.5" />} label="Members" value={rollup?.total_members ?? "—"} />
          <Pill icon={<Activity className="h-3.5 w-3.5" />} label="Active (30d)" value={rollup?.active_30d ?? "—"} />
        </div>
      </header>

      <AgencyMetrics />
      <div className="h-10" />
    </div>
  );
}

function Pill({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(56,189,248,0.18)" }}>
      <span className="text-sky-300/80">{icon}</span>
      <span className="text-sm font-bold text-white tabular-nums">{value}</span>
      <span className="text-[11px] text-sky-200/50">{label}</span>
    </div>
  );
}
