/**
 * /<slug>/app/waiver — CP-135
 *
 * Where a customer signs the business's waiver. Two ways in:
 *   · ?c=<campaign>  — the promotional QR ("Sign the waiver, get 10% off").
 *                      The campaign's waiver (if any) is shown; signing
 *                      completes the campaign and issues the reward.
 *   · no param       — the business's required-at-signup waiver (or the
 *                      one named by ?w=<waiver id>).
 * The page loads the CURRENT version and passes its id along, so the
 * signature is recorded against exactly the text the customer read.
 */
import { notFound } from "next/navigation";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getBusinessBySlug, getMyMembership } from "@/lib/data/customer-app";
import { WaiverSignClient, type CampaignInfo, type WaiverInfo } from "@/components/customer/waiver-sign-client";

export const dynamic = "force-dynamic";

export default async function WaiverPage({
  params, searchParams,
}: { params: { business: string }; searchParams: { c?: string; campaign?: string; w?: string } }) {
  const business = await getBusinessBySlug(params.business);
  if (!business) notFound();
  const supabase = createClient();
  const [user, mem] = await Promise.all([getCachedUser(), getMyMembership(business.id)]);
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user!.id).single();

  const slug = (searchParams.c ?? searchParams.campaign ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  let campaign: CampaignInfo | null = null;
  let waiver: WaiverInfo | null = null;

  if (slug.length >= 2) {
    const { data } = await supabase.rpc("get_signup_campaign", { p_business_id: business.id, p_slug: slug });
    const row = (Array.isArray(data) ? data[0] : data) as (CampaignInfo & WaiverInfo & { waiver_id: string | null }) | null;
    if (row) {
      campaign = { id: row.id, slug: row.slug, headline: row.headline, description: row.description, reward_kind: row.reward_kind, points_amount: row.points_amount, offer_title: row.offer_title };
      if (row.waiver_id && row.version_id) {
        waiver = { waiver_id: row.waiver_id, waiver_title: row.waiver_title, version_id: row.version_id, version_no: row.version_no, body_text: row.body_text, document_url: row.document_url };
      }
    }
  }
  if (!waiver) {
    const { data } = await supabase.rpc("required_waiver_for_business", { p_business_id: business.id });
    const row = (Array.isArray(data) ? data[0] : data) as WaiverInfo | null;
    if (row?.version_id) waiver = row;
  }

  // Already signed the current version? Let the client show that state.
  const { data: status } = await supabase.rpc("my_waiver_status", { p_business_id: business.id });
  const signedCurrent = ((status ?? []) as { waiver_id: string; is_current: boolean }[])
    .some(s => waiver && s.waiver_id === waiver.waiver_id && s.is_current);

  return (
    <WaiverSignClient
      business={business}
      membershipId={mem?.id ?? null}
      defaultName={profile?.full_name ?? ""}
      campaign={campaign}
      waiver={waiver}
      alreadySignedCurrent={signedCurrent}
    />
  );
}
