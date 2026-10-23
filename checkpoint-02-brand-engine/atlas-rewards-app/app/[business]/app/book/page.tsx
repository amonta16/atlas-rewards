import { createClient, getCachedUser } from "@/lib/supabase/server";
import { MedspaBookFlow } from "@/components/medspa-app/book-flow";
import { BookFlow } from "@/components/customer/book-flow";
import { ResourceBooking } from "@/components/customer/resource-booking";
import { bookingEnabled, type BookingResource } from "@/lib/booking";
import type { Business, BookingTag } from "@/lib/types/database";
import { isMedspaApp } from "@/lib/medspa-app/route";
import { bookingOptions, readMedspaConfig } from "@/lib/medspa";
import { MedspaBookScreen } from "@/components/medspa-app/book-screen";

export const dynamic = "force-dynamic";

/**
 * /<slug>/app/book
 *
 * CP-147: Booking v2. When the business has booking_resources (cages, bays,
 * lanes, rooms — things with capacity), the customer gets ResourceBooking.
 * Businesses still on the CP-16/17 tag-based calendar (incl. GHL-backed
 * ones) keep the legacy BookFlow, untouched.
 *
 * CP-207: med spas book the Dermis way. ?t=<treatment id> picks the
 * treatment; its scheduling link (or the practice-wide one) wins, then
 * Atlas booking if it's on, then call / text / WhatsApp the clinic.
 */
export default async function CustomerBookPage({ params, searchParams }: { params: { business: string }; searchParams?: { t?: string } }) {
  const supabase = createClient();
  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  const business = biz as Business;

  if (business && isMedspaApp(business)) {
    const cfg = readMedspaConfig(business.medspa_config);
    const menu = cfg.treatments.filter((t) => t.is_active);
    const treatment = menu.find((t) => t.id === searchParams?.t) ?? null;
    const options = bookingOptions(cfg.booking, business.name, business.contact_info?.phone, treatment);
    if (options.url || !bookingEnabled(business)) {
      return <MedspaBookScreen business={business} treatment={treatment} menu={menu} options={options} />;
    }
    // CP-214: Atlas booking on, no scheduling link → the med spa booking flow
    // (treatment → who with → day → time → request). Never the venue picker.
    const user = await getCachedUser();
    const { data: prof } = user
      ? await supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle()
      : { data: null };
    const p = prof as { full_name?: string | null; phone?: string | null } | null;
    return <MedspaBookFlow business={{ ...business, ghl_api_key: null, webhook_secret: null } as Business} menu={menu}
      providers={cfg.providers} initial={treatment} patient={{ name: p?.full_name ?? null, phone: p?.phone ?? null }} />;
  }

  // If the business doesn't have booking enabled, render a "not enabled" notice
  // rather than 404 — keeps the UX friendly if a customer hits a stale link.
  if (!bookingEnabled(business)) {
    return (
      <div className="px-4 pt-8 text-center">
        <h1 className="text-xl font-bold">Booking isn&apos;t on for this business yet</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Check back soon — or call us if you need to reserve in the meantime.
        </p>
      </div>
    );
  }

  // CP-110 (security): drop server-only credentials before the row reaches a
  // client component. GHL calls happen server-side in /api/ghl/*.
  const safeBusiness = { ...business, ghl_api_key: null, webhook_secret: null } as Business;

  // CP-147: resources first. The RPC returns [] on a pre-CP-147 DB.
  const { data: resRows } = await supabase.rpc("list_booking_resources", { p_business_id: business.id });
  const resources = ((resRows ?? []) as BookingResource[]).filter(r => r.is_active);
  if (resources.length > 0) {
    return <ResourceBooking business={safeBusiness} resources={resources} />;
  }

  const { data: tagRows } = await supabase.rpc("active_booking_tags", { p_business_id: business.id });
  const tags = (tagRows ?? []) as BookingTag[];
  const ghlOn = !!(business.ghl_calendar_id && business.ghl_api_key);

  return <BookFlow business={safeBusiness} ghlOn={ghlOn} tags={tags} />;
}
