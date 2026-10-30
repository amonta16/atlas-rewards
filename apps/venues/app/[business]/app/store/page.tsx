/**
 * /<slug>/app/store — the med spa Shop (CP-190, redesigned CP-193).
 * Med spa only; the screen lives in components/medspa-app/shop-screen.tsx.
 * Other layouts get notFound(); /shop stays the points catalog for them.
 */
import { notFound } from "next/navigation";
import { getBusinessBySlug, getMyMembership } from "@/lib/data/customer-app";
import { isMedspaApp } from "@/lib/medspa-app/route";
import { MedspaShop } from "@/components/medspa-app/shop-screen";

export const dynamic = "force-dynamic";

export default async function StorePage({ params, searchParams }: { params: { business: string }; searchParams: { tab?: string; item?: string; paid?: string; cancelled?: string } }) {
  const business = await getBusinessBySlug(params.business);
  if (!business || !isMedspaApp(business)) notFound();
  return <MedspaShop business={business} membership={await getMyMembership(business.id)} searchParams={searchParams} />;
}
