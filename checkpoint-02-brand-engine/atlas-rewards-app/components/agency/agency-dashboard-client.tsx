"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Building2, Users, Activity, DollarSign, Plus, ListFilter, Search, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { NewBusinessModal } from "./new-business-modal";
import { AgencyBillingPanel } from "./billing-panel";
import { createClient } from "@/lib/supabase/client";
import type { Business } from "@/lib/types/database";

type Rollup = {
  total_businesses: number; active_businesses: number;
  total_members: number; active_30d: number;
  revenue_30d_cents: number;
};

export function AgencyDashboardClient({
  friendlyName, initialBusinesses,
}: { friendlyName: string; initialBusinesses: Business[] }) {
  const [newOpen, setNewOpen] = useState(false);
  const [rollup, setRollup] = useState<Rollup | null>(null);
  const list = initialBusinesses;
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("agency_rollup").then(({ data }) => setRollup(data as Rollup | null));
  }, []);

  const dollars = (cents: number) => `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  return (
    <div>
      <header
        className="relative px-8 pt-10 pb-6 border-b"
        style={{
          background:
            "linear-gradient(135deg, #0a3d62 0%, #1d6fa5 60%, #2a8cc4 100%)",
        }}
      >
        {/* Decorative wavy accent */}
        <div
          className="pointer-events-none absolute -bottom-3 left-0 right-0 h-6"
          style={{
            background:
              "radial-gradient(ellipse at top, rgba(255,255,255,0.25), transparent 60%)",
          }}
        />
        <div className="relative flex items-start justify-between">
          <div className="text-white">
            <div className="text-[11px] uppercase tracking-[0.25em] font-extrabold opacity-80">Atlas Engine · Agency</div>
            <h1 className="text-4xl font-extrabold tracking-tight mt-1 drop-shadow-sm">Welcome back, {friendlyName}! 👋</h1>
            <p className="text-sm opacity-90 mt-1">Here's what's happening with your sub-accounts today.</p>
          </div>
          <Button className="bg-white text-zinc-900 hover:bg-zinc-100 shadow-lg" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Business
          </Button>
        </div>
      </header>

      <div className="px-8 pt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Building2 className="h-5 w-5" />} label="Total Businesses"
          value={rollup?.total_businesses ?? list.length} tone="indigo" />
        <StatCard icon={<Users className="h-5 w-5" />}     label="Total Members"
          value={rollup?.total_members ?? "—"} tone="cyan" />
        <StatCard icon={<Activity className="h-5 w-5" />}  label="Active (30d)"
          value={rollup?.active_30d ?? "—"} tone="emerald" />
        <StatCard icon={<DollarSign className="h-5 w-5" />} label="Revenue (30d)"
          value={rollup ? dollars(rollup.revenue_30d_cents) : "—"} tone="amber" />
      </div>

      {/* Agency revenue & payments — Stripe-fed MRR widget */}
      <AgencyBillingPanel />

      <div className="px-8 py-8">
        <div className="rounded-2xl border bg-white">
          <div className="flex items-center justify-between p-6 border-b">
            <div>
              <h2 className="font-semibold text-lg">Your Businesses</h2>
              <p className="text-sm text-muted-foreground">Manage your client portfolio</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search businesses…" className="pl-9 w-64" />
              </div>
              <Button variant="outline" size="sm"><ListFilter className="h-4 w-4 mr-1" /> Name A–Z</Button>
              <Button variant="outline" size="icon"><List className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon"><LayoutGrid className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className="divide-y">
            {list.map(b => (
              <Link key={b.id} href={`/agency/businesses/${b.id}`} className="flex items-center justify-between p-5 hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-4">
                  {b.logo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={b.logo_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
                  ) : (
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                      style={{ background: b.brand_colors?.primary ?? "#6366f1" }}
                    >
                      {b.name[0]}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold">{b.name}</div>
                    <div className="text-xs text-muted-foreground">{b.industry ?? "Uncategorized"} · <code>{b.slug}.{rootDomain}</code></div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${b.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    {b.status === "active" ? "● Active" : b.status}
                  </span>
                </div>
              </Link>
            ))}
            {list.length === 0 && (
              <div className="p-10 text-center text-muted-foreground">
                No businesses yet. Click "Add Business" to create your first sub-account.
              </div>
            )}
          </div>
        </div>
      </div>

      {newOpen && <NewBusinessModal onClose={() => setNewOpen(false)} />}
    </div>
  );
}
