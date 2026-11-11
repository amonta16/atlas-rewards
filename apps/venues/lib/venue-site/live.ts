import { createAdminClient } from "@/lib/supabase/admin";

/**
 * What's in use right now, for a venue website (server only: service role).
 *
 * Same numbers as the app's Book tab (booking_resources_now, CP-157): pending +
 * confirmed bookings covering now(), whether booked in the app, at the desk or
 * on the website. Nothing personal: per resource, units / in use / next free time.
 */
export type SiteLiveRow = { resource_id: string; units: number; busy_now: number; next_free_at: string | null };

/** null = no such business. [] = couldn't read it (the site just shows no badges). */
export async function siteLiveFor(slugOrId: { slug: string } | { id: string }): Promise<SiteLiveRow[] | null> {
  const admin = createAdminClient();
  let id: string | null = "id" in slugOrId ? slugOrId.id : null;
  if (!id) {
    const { data: biz } = await admin.from("businesses").select("id").eq("slug", (slugOrId as { slug: string }).slug).maybeSingle();
    if (!biz) return null;
    id = biz.id as string;
  }
  const { data, error } = await admin.rpc("booking_resources_now", { p_business_id: id });
  if (error || !Array.isArray(data)) return [];
  return (data as Array<SiteLiveRow & { booked_today?: number }>).map(r => ({
    resource_id: r.resource_id, units: r.units, busy_now: r.busy_now, next_free_at: r.next_free_at,
  }));
}
