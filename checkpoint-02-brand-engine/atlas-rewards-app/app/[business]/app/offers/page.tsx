/**
 * /<slug>/app/offers — CP-131
 *
 * The "Deals" / "Offers" / "Events" tab the niche presets put on the bar
 * (smoke, food, entertainment). Reachable by URL on every layout. It is the
 * store-first surface the research asked for: limited-time offers with
 * live countdowns on top, then the news billboard (entertainment venues use
 * it for events and league nights). The featured offer itself stays on Home.
 */
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBusinessBySlug } from "@/lib/data/customer-app";
import { LimitedOffersSection } from "@/components/customer/limited-offers-section";
import { NewsSection } from "@/components/customer/news-section";
import { presetSpec } from "@/lib/layout-presets";

export const dynamic = "force-dynamic";

type NewsRow = {
  id: string; title: string; body: string | null;
  image_url: string | null; published_at: string;
};

export default async function OffersTab({ params }: { params: { business: string } }) {
  const business = await getBusinessBySlug(params.business);
  if (!business) notFound();
  const supabase = createClient();
  const { data: news } = await supabase.rpc("latest_news", { p_business_id: business.id, p_limit: 6 });
  const newsPosts = (news ?? []) as NewsRow[];
  const layout = presetSpec(business.layout_preset);

  return (
    <div className="pb-6">
      <div className="px-4 pt-5">
        <h1 className="text-xl font-extrabold tracking-tight" style={{ color: "var(--surf-fg, #18181b)" }}>
          {layout.offersTitle}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--surf-fg, #18181b)", opacity: 0.7 }}>
          {layout.offersSubtitle}
        </p>
      </div>

      {business.widget_config.offers ? (
        <LimitedOffersSection
          businessId={business.id}
          businessName={business.name}
          primary={business.brand_colors.primary}
          secondary={business.brand_colors.secondary}
          cardStyle={business.offer_card_style}
          layout={business.offers_layout}
          headingStyle={business.heading_style}
          badgeStyle={business.badge_style}
        />
      ) : null}

      {newsPosts.length > 0 ? (
        <NewsSection business={business} posts={newsPosts} />
      ) : (
        !business.widget_config.offers && (
          <div className="mx-4 mt-6 rounded-2xl border bg-white p-5 text-center text-sm text-zinc-500">
            Nothing running right now — check back soon.
          </div>
        )
      )}
    </div>
  );
}
