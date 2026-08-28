import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandEditor } from "@/components/brand-editor/brand-editor";
import type { Business } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function BusinessEditorPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // CP-110 (security): this editor was gated on login only — unlike every
  // other /agency page, which re-checks the agency role. Without this, any
  // signed-in user could open /agency/businesses/<id> and read the full
  // business row (including ghl_api_key) into the brand editor. Require an
  // agency role, matching the sibling pages.
  const { data: agencyRoles } = await supabase
    .from("business_users").select("role")
    .eq("user_id", user.id)
    .in("role", ["agency_admin", "agency_va"])
    .limit(1);
  if (!agencyRoles || agencyRoles.length === 0) redirect("/agency");

  const { data: business, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !business) notFound();

  return <BrandEditor initial={business as Business} />;
}
