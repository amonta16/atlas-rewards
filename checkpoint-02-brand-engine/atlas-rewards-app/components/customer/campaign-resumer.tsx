"use client";
/**
 * CampaignResumer — CP-135
 *
 * Mounted once in the customer app layout. Two jobs, both silent:
 *   1. If the customer arrived through a promo QR (`?c=` on any page, or a
 *      slug remembered in localStorage across signup), send them to the
 *      waiver/reward page once they're signed in.
 * CP-137: the required-waiver redirect that used to live here is gone. It
 * was a client-side useEffect, which made it advisory — the gate is now a
 * server check in the customer app layout, which renders the waiver instead
 * of the app. This component is back to one job: promo campaigns.
 */
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { campaignFromLocation, readCampaign, rememberCampaign } from "@/lib/campaign-storage";

export function CampaignResumer({
  businessSlug, membershipId,
}: {
  businessSlug: string;
  /** Kept for callers; the waiver check that used it moved to the server. */
  businessId?: string;
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

  }, [pathname, businessSlug, membershipId, router]);

  return null;
}
