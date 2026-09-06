/**
 * /<slug>/app/membership — CP-131
 *
 * The "Member" (medspa) / "Pass" (entertainment) tab. Same MembershipSection
 * the Home page renders, promoted to its own destination so the membership
 * is one tap away instead of a scroll. When the business hasn't switched
 * memberships on yet, the tab explains itself instead of sitting empty.
 */
import { notFound } from "next/navigation";
import { createClient, getCachedUser } from "@/lib/supabase/server";
import { getBusinessBySlug, getMyMembership } from "@/lib/data/customer-app";
import { MembershipSection } from "@/components/customer/membership-section";
import { presetSpec } from "@/lib/layout-presets";

export const dynamic = "force-dynamic";

export default async function MembershipTab({ params }: { params: { business: string } }) {
  const business = await getBusinessBySlug(params.business);
  if (!business) notFound();
  const supabase = createClient();
  const [user, mem, { data: billing }] = await Promise.all([
    getCachedUser(),
    getMyMembership(business.id),
    supabase.rpc("membership_billing_public", { p_business_id: business.id }),
  ]);
  const billingRow = (Array.isArray(billing) ? billing[0] : billing) as { is_enabled?: boolean } | null;
  const enabled = !!billingRow?.is_enabled;
  const layout = presetSpec(business.layout_preset);

  return (
    <div className="pb-6">
      <div className="px-4 pt-5">
        <h1 className="text-xl font-extrabold tracking-tight" style={{ color: "var(--surf-fg, #18181b)" }}>
          {layout.membershipTitle}
        </h1>
      </div>

      {enabled ? (
        <MembershipSection business={business} membership={mem} userId={user!.id} />
      ) : (
        <div className="mx-4 mt-4 rounded-2xl border bg-white p-5 text-center">
          <div
            className="mx-auto h-12 w-12 rounded-full flex items-center justify-center text-white text-xl font-black"
            style={{ background: `linear-gradient(135deg, ${business.brand_colors.primary}, ${business.brand_colors.secondary})` }}
          >
            ★
          </div>
          <div className="mt-3 text-base font-bold text-zinc-900">
            {layout.membershipTitle === "Pass" ? "Passes are coming" : "Membership is coming"}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {business.name} hasn&apos;t opened {layout.membershipTitle === "Pass" ? "passes" : "memberships"} yet. Keep earning points — you&apos;ll see it here first.
          </p>
        </div>
      )}
    </div>
  );
}
