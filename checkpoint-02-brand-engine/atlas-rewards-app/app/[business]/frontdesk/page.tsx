import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FrontDeskKeypad } from "@/components/frontdesk/front-desk-keypad";
import type { Business } from "@/lib/types/database";

export const dynamic = "force-dynamic";

/**
 * /<slug>/frontdesk — CP-49
 *
 * Branded PIN keypad. The ONLY way front-desk staff sign in: no email,
 * no password. Manager sets up a name + 4-digit PIN; the staffer taps it
 * here and lands in the front-desk view (/<slug>/manage).
 */
export default async function FrontDeskLogin({ params }: { params: { business: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("businesses")
    .select("id, slug, name, logo_url, brand_colors")
    .eq("slug", params.business)
    .maybeSingle();
  if (!data) notFound();

  const business = data as unknown as Pick<Business, "id" | "slug" | "name" | "logo_url" | "brand_colors">;
  const colors = (business.brand_colors ?? {}) as { primary?: string; secondary?: string; accent?: string };

  return (
    <FrontDeskKeypad
      slug={business.slug}
      name={business.name}
      logoUrl={business.logo_url ?? null}
      primary={colors.primary ?? "#0a3d62"}
      secondary={colors.secondary ?? colors.primary ?? "#0a3d62"}
    />
  );
}
