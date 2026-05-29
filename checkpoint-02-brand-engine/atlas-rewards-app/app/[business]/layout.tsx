import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { hexToHsl } from "@/lib/utils";
import type { Business } from "@/lib/types/database";

export const dynamic = "force-dynamic";

/**
 * CP-37: per-business iOS PWA meta tags. WITHOUT these, iPhone users
 * who installed the PWA to their home screen would have every tap
 * bounce out to Safari instead of staying inside the standalone app.
 * The apple-mobile-web-app-capable directive is what flips that.
 *
 * We also wire apple-touch-icon to the business's logo so the home-
 * screen icon picks up THEIR brand, not Atlas's default.
 */
export async function generateMetadata(
  { params }: { params: { business: string } },
): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("businesses")
    .select("name, logo_url, brand_colors")
    .eq("slug", params.business)
    .maybeSingle();

  const name = data?.name ?? "Atlas Rewards";
  const themeColor = (data?.brand_colors as { primary?: string } | null)?.primary ?? "#0a3d62";
  const shortName = name.length > 12 ? name.slice(0, 12) : name;

  return {
    title: `${name} Rewards`,
    description: `Earn points and unlock rewards at ${name}.`,
    themeColor,
    appleWebApp: {
      capable: true,
      title: shortName,
      statusBarStyle: "default",
    },
    icons: data?.logo_url
      ? {
          icon: data.logo_url,
          apple: data.logo_url,
        }
      : undefined,
    other: {
      // Belt-and-suspenders: explicitly set these in case the
      // appleWebApp metadata helper doesn't emit them in every
      // Next.js version.
      "apple-mobile-web-app-capable": "yes",
      "apple-mobile-web-app-status-bar-style": "default",
      "mobile-web-app-capable": "yes",
      "format-detection": "telephone=no",
    },
  };
}

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
