"use client";
/** CP-135: stash the promo campaign slug from the landing URL. Renders nothing. */
import { useEffect } from "react";
import { rememberCampaign } from "@/lib/campaign-storage";

export function CampaignRemember({ businessSlug, campaignSlug }: { businessSlug: string; campaignSlug: string }) {
  useEffect(() => { rememberCampaign(businessSlug, campaignSlug); }, [businessSlug, campaignSlug]);
  return null;
}
