import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReviewImagesManager } from "@/components/agency/review-images-manager";
import { CaseStudiesManager } from "@/components/agency/case-studies-manager";
import { cn } from "@/lib/utils";

/**
 * /agency/reviews — Reviews & Results (CP-275: one menu item for all social proof).
 *   Reviews  CP-240 · the review screenshots every Atlas site and funnel slides across.
 *   Results  CP-275 · client case studies (big numbers, owner photo) for the /medspa/app Results section.
 * agency_admin only (checked here and in the /api/agency/site-* routes; the sidebar flag is cosmetic).
 */
export const dynamic = "force-dynamic";

const TABS = [
  { id: "reviews", label: "Reviews", blurb: "Screenshots of real reviews (Google, texts, DMs, emails). They slide across the review section of every site and funnel you tick, including right under the app-preview lead magnet." },
  { id: "results", label: "Results", blurb: "Client case studies: big numbers, the owner's photo or video, and what they use. They fill the Results section on the app-preview lead magnet, replacing the placeholders one by one." },
] as const;

export default async function ReviewsPage({ searchParams }: { searchParams?: { tab?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: roleRows } = await supabase.from("business_users").select("role").eq("user_id", user.id).eq("role", "agency_admin").limit(1);
  if (!roleRows?.length) redirect("/agency");

  const tab = TABS.find((t) => t.id === searchParams?.tab) ?? TABS[0];

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reviews &amp; Results</h1>
      <nav aria-label="Proof" className="mt-4 inline-flex rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <Link key={t.id} href={`/agency/reviews?tab=${t.id}`} aria-current={t.id === tab.id ? "page" : undefined}
            className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold transition", t.id === tab.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
            {t.label}
          </Link>
        ))}
      </nav>
      <p className="mt-3 max-w-3xl text-sm text-slate-600">{tab.blurb} Changes show on the sites within about a minute.</p>
      {tab.id === "reviews" ? <ReviewImagesManager /> : <CaseStudiesManager />}
    </div>
  );
}
