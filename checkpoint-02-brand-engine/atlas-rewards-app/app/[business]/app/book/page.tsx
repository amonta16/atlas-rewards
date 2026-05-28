import { createClient } from "@/lib/supabase/server";
import { BookFlow } from "@/components/customer/book-flow";
import type { Business, BookingTag } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export default async function CustomerBookPage({ params }: { params: { business: string } }) {
  const supabase = createClient();
  const { data: biz } = await supabase
    .from("businesses").select("*").eq("slug", params.business).single();
  const business = biz as Business;

  // If the business doesn't have booking enabled, render a "not enabled" notice
  // rather than 404 — keeps the UX friendly if a customer hits a stale link.
  if (!business.widget_config.booking) {
    return (
      <div className="px-4 pt-8 text-center">
        <h1 className="text-xl font-bold">Booking isn't on for this business yet</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Check back soon — or call us if you need to reserve in the meantime.
        </p>
      </div>
    );
  }

  const { data: tagRows } = await supabase.rpc("active_booking_tags", { p_business_id: business.id });
  const tags = (tagRows ?? []) as BookingTag[];

  return <BookFlow business={business} tags={tags} />;
}
