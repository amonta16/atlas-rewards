import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PreviewsAdmin, type AdminPreviewRow } from "@/components/preview/previews-admin";
import { previewUrl } from "@/lib/preview/store";

/**
 * /agency/previews — CP-232 · instant app previews: make one by hand, see recent ones.
 * agency_admin only (checked here on the server; the sidebar flag is cosmetic).
 */
export const dynamic = "force-dynamic";

export default async function PreviewsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRows } = await supabase.from("business_users").select("role").eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  if (!roleRows?.length) redirect("/agency");

  const { data, error } = await createAdminClient()
    .from("app_previews")
    .select("id, slug, business_name, website, source, status, build_error, area_open, treatments_are_examples, logo_is_monogram, contact_phone, claimed_at, created_at, expires_at, utm_campaign, utm_content")
    .order("created_at", { ascending: false })
    .limit(60);
  const rows: AdminPreviewRow[] = ((data ?? []) as Omit<AdminPreviewRow, "url">[]).map((r) => ({ ...r, url: previewUrl(r.slug) }));

  return (
    <div className="mx-auto max-w-6xl p-6 lg:p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">App previews</h1>
      <p className="mt-1 text-sm text-slate-600">
        The instant preview a med spa sees after the ad (atlas-engine.app/medspa/app). Make one by hand for a prospect, or check what was built.
      </p>
      {error && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Couldn&apos;t load previews: {error.message}. Has the CP-232 SQL been applied?</p>}
      <PreviewsAdmin rows={rows} />
    </div>
  );
}
