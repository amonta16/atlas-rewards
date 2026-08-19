/**
 * /<slug>/app/streaks — CP-99 Phase 4
 *
 * Full-page streak roadmap (vertical battle-pass path + sticky hero).
 * ADDITIVE route: nothing in the app links here yet — the quick-action
 * retarget (#9) and nav change (Phase 5) come after this page is verified.
 * Follows the rewards/page.tsx pattern (CP-89 memoized fetches).
 */
import { notFound } from "next/navigation";
import { getBusinessBySlug, getMyMembership } from "@/lib/data/customer-app";
import { StreaksClient } from "@/components/customer/streaks-client";

export const dynamic = "force-dynamic";

export default async function StreaksPage({ params }: { params: { business: string } }) {
  const business = await getBusinessBySlug(params.business);
  if (!business) notFound();
  const mem = await getMyMembership(business.id);

  return <StreaksClient business={business} membershipId={mem?.id ?? null} />;
}
