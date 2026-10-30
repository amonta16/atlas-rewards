import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/lib/data/customer-app";
import { createAdminClient } from "@/lib/supabase/admin";
import { KioskWaiverClient } from "@/components/customer/kiosk-waiver-client";

/**
 * CP-142 — the front-desk tablet page: /<business>/kiosk
 *
 * A public, unauthenticated waiver page for walk-ins. Deliberately OUTSIDE
 * /app, so none of CP-137's member gating applies and there is nothing here
 * to navigate into — a tablet left on this page stays on this page.
 *
 * Nothing sensitive is served: the waiver text a business publishes is text
 * it hands to every customer anyway. The signature goes back through
 * /api/waivers/kiosk-sign, which rate-limits and holds the service role.
 * The browser never gets a key that can write.
 */
export const dynamic = "force-dynamic";

export default async function KioskPage({ params }: { params: { business: string } }) {
  const business = await getBusinessBySlug(params.business);
  if (!business) notFound();

  const admin = createAdminClient();
  const { data } = await admin.rpc("kiosk_waiver_for_business", { p_business_id: business.id });
  const waiver = (Array.isArray(data) ? data[0] : data) as {
    waiver_id: string; waiver_title: string; version_id: string;
    version_no: number; body_text: string; minors_enabled: boolean;
  } | null;

  // Kiosk off, or no published version → say so plainly rather than 404ing,
  // because whoever is looking at this is standing at a counter.
  if (!waiver) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-zinc-50">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-black text-zinc-900">Kiosk isn&apos;t set up yet</h1>
          <p className="text-zinc-500 mt-2">
            Turn the kiosk on for a waiver in the builder, under Waivers, and make sure the
            waiver has published text.
          </p>
        </div>
      </div>
    );
  }

  return <KioskWaiverClient business={business} waiver={waiver} />;
}
