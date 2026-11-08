import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { previewDb, previewUrl } from "@/lib/preview/store";
import { SITE_ORIGIN } from "@/lib/landing/medspa-funnel";
import { FUNNEL_GROUPS } from "@/lib/funnels";
import { FunnelCard } from "@/components/agency/funnel-card";

/**
 * /agency/funnels — CP-235 · a bird's-eye view of every funnel and site we run.
 * Live thumbnail, one-click open, the ad link to copy, and leads in the last 7 days.
 * Not a builder: pages live in code; add new ones to lib/funnels.ts.
 * agency_admin only (checked here; the sidebar flag is cosmetic).
 */
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function counts() {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const db = previewDb();
  const [pv, ml, dr, latest] = await Promise.all([
    db.from("app_previews").select("id", { count: "exact", head: true }).gte("contact_at", since),
    db.from("landing_leads").select("id", { count: "exact", head: true }).gte("created_at", since).neq("source", "app_preview").like("path", "/medspa%"),
    db.from("landing_demo_requests").select("id", { count: "exact", head: true }).gte("created_at", since),
    db.from("app_previews").select("slug, business_name").in("status", ["ready", "claimed"]).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1),
  ]);
  const last = ((latest.data ?? []) as { slug: string; business_name: string }[])[0] ?? null;
  return {
    stats: { preview_leads: pv.count ?? null, medspa_leads: ml.count ?? null, demo_requests: dr.count ?? null } as Record<string, number | null>,
    latest: last ? { name: last.business_name, url: previewUrl(last.slug) } : null,
  };
}

export default async function FunnelsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRows } = await supabase.from("business_users").select("role").eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  if (!roleRows?.length) redirect("/agency");

  const { stats, latest } = await counts().catch(() => ({ stats: {} as Record<string, number | null>, latest: null }));

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Funnels</h1>
      <p className="mt-1 text-sm text-slate-600">Everything live, in one place. Click a card to open it; copy the ad link straight into Meta. Lead counts are the last 7 days.</p>

      {FUNNEL_GROUPS.map((g) => (
        <section key={g.id} className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{g.label}</h2>
          <div className="mt-3 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {g.funnels.map((f) => (
              <FunnelCard
                key={f.id}
                name={f.name}
                what={f.what}
                href={f.url ?? `${SITE_ORIGIN}${f.path}`}
                thumbPath={f.thumb && f.path ? f.path : null}
                adLink={f.ad ? `${SITE_ORIGIN}${f.ad}` : null}
                stat={f.stat ? { label: f.stat === "demo_requests" ? "demo requests" : "leads", value: stats[f.stat] ?? null } : null}
              />
            ))}
            {g.id === "apps" && latest && (
              <FunnelCard name="Latest app preview" what={`The newest preview a med spa built: ${latest.name}.`} href={latest.url} thumbPath={null} adLink={null} stat={null} />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
