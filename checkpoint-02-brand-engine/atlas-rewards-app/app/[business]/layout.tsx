import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hexToHsl } from "@/lib/utils";
import type { Business } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function BusinessLayout({
  children,
  params,
}: { children: React.ReactNode; params: { business: string } }) {
  const supabase = createClient();

  // Resolve the business by slug. resolve_business_by_slug() is the function
  // we created in Checkpoint 1 — callable by anon users (pre-login customers).
  const { data, error } = await supabase
    .rpc("resolve_business_by_slug", { p_slug: params.business });

  if (error || !data || data.length === 0) notFound();

  const business = data[0] as unknown as Business;

  // Build the per-business CSS-variable theme
  const themeVars = `
    --brand-primary: ${hexToHsl(business.brand_colors.primary)};
    --brand-secondary: ${hexToHsl(business.brand_colors.secondary)};
    --brand-accent: ${hexToHsl(business.brand_colors.accent)};
  `;

  return (
    <>
      <style>{`:root { ${themeVars} }`}</style>
      {/* Pass business down via React context in CP 3 — for now layout is server-rendered */}
      <div data-business-slug={business.slug}>{children}</div>
    </>
  );
}
