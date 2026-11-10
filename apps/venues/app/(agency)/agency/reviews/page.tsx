import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReviewImagesManager } from "@/components/agency/review-images-manager";

/**
 * /agency/reviews — CP-240 · the review screenshots every Atlas site and funnel slides across.
 * Drop images (or a whole folder) in, pick the pages each one shows on, drag to reorder.
 * agency_admin only (checked here and in /api/agency/site-reviews; the sidebar flag is cosmetic).
 */
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRows } = await supabase.from("business_users").select("role").eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  if (!roleRows?.length) redirect("/agency");

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reviews</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Screenshots of real reviews (Google, texts, DMs, emails). They slide across the review section of every site and funnel you tick,
        including right under the app-preview lead magnet. Changes show on the sites within about a minute.
      </p>
      <ReviewImagesManager />
    </div>
  );
}
