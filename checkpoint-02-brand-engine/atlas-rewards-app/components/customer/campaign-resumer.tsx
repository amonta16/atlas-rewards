"use client";
/**
 * CampaignResumer — CP-135
 *
 * Mounted once in the customer app layout. Two jobs, both silent:
 *   1. If the customer arrived through a promo QR (`?c=` on any page, or a
 *      slug remembered in localStorage across signup), send them to the
 *      waiver/reward page once they're signed in.
 *   2. If the business requires a waiver at signup and this member hasn't
 *      signed the current version, send them to the waiver page.
 * Never fires while already on /waiver, never loops (a session flag stops
 * the required-waiver check repeating every navigation).
 */
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { campaignFromLocation, readCampaign, rememberCampaign } from "@/lib/campaign-storage";

export function CampaignResumer({
  businessSlug, businessId, membershipId,
}: {
  businessSlug: string;
  businessId: string;
  membershipId: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname || pathname.includes("/waiver")) return;
    const base = pathname.match(/^(.*?\/app)(\/|$)/)?.[1] ?? "/app";

    // 1. Promo campaign in the URL or remembered from signup.
    const fromUrl = campaignFromLocation();
    if (fromUrl) rememberCampaign(businessSlug, fromUrl);
    const camp = fromUrl ?? readCampaign(businessSlug);
    if (camp && membershipId) {
      router.replace(`${base}/waiver?c=${encodeURIComponent(camp)}`);
      return;
    }

    // 2. Required-at-signup waiver not yet signed.
    if (!membershipId) return;
    const flag = `atlas_waiver_checked:${businessId}`;
    try { if (sessionStorage.getItem(flag)) return; } catch { /* ignore */ }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await createClient().rpc("my_waiver_status", { p_business_id: businessId });
        if (cancelled) return;
        const rows = (data ?? []) as { required_for_signup: boolean; is_current: boolean }[];
        const missing = rows.some(r => r.required_for_signup && !r.is_current);
        try { sessionStorage.setItem(flag, "1"); } catch { /* ignore */ }
        if (missing) router.replace(`${base}/waiver`);
      } catch { /* pre-CP-135 DB: nothing to do */ }
    })();
    return () => { cancelled = true; };
  }, [pathname, businessSlug, businessId, membershipId, router]);

  return null;
}
