import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { getBusinessBySlug } from "@/lib/data/customer-app";
import { getCachedUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookingEnabled, type BookingPackage } from "@/lib/booking";
import { siteContentFor, type VenueSiteContent } from "@/lib/venue-site/content";
import { venueSiteFontClass } from "@/lib/venue-site/fonts";
import { VenueSite, type SiteReward, type SiteWaiver } from "@/components/venue-site/venue-site";
import type { SitePkg, SiteResource, SiteMember } from "@/components/venue-site/site-booking";
import "@/components/venue-site/venue-site.css";

/**
 * /site/<slug> — the business's public website, hosted by Atlas.
 * On the business subdomain: https://<slug>.atlas-engine.app/site (middleware rewrite).
 *
 * Deliberately NOT under app/[business]: that tree is the customer app, and its
 * boot splash, "One sec…" loading screen and PWA manifest don't belong on a
 * website. This route has no loading.tsx on purpose: the server renders the whole
 * page and the browser shows it in one go.
 *
 * Built to replace a venue's old website (first: Flippo's, mbflippos.com).
 * Booking uses the app's flow and the app's tables, so the website, the app
 * and the front desk share one schedule. Copy lives in lib/venue-site/content.ts;
 * a business with no entry there has no site.
 */
export const dynamic = "force-dynamic";

const IOS = process.env.NEXT_PUBLIC_APP_STORE_URL || "https://apps.apple.com/us/app/ae-rewards/id6797182694";
const ANDROID = process.env.NEXT_PUBLIC_PLAY_STORE_URL || "https://play.google.com/store/apps/details?id=com.atlasengine.rewards";

export const viewport: Viewport = { themeColor: "#0b2540", width: "device-width", initialScale: 1 };

export async function generateMetadata({ params }: { params: { business: string } }): Promise<Metadata> {
  const c = siteContentFor(params.business);
  if (!c) return {};
  const biz = await getBusinessBySlug(params.business).catch(() => null);
  const icon = (biz as { app_icon_url?: string | null } | null)?.app_icon_url ?? biz?.logo_url ?? null;
  return {
    // absolute: the root layout's "· Atlas Engine" title suffix is for our own site, not a venue's.
    title: { absolute: c.seoTitle },
    description: c.seoDescription,
    openGraph: { title: c.seoTitle, description: c.seoDescription, images: [c.about.photo], type: "website" },
    twitter: { card: "summary_large_image", title: c.seoTitle, description: c.seoDescription, images: [c.about.photo] },
    icons: icon ? { icon, apple: icon } : undefined,
  };
}

/** App packages and the website's price board, merged by name (price board order first). */
function mergePackages(c: VenueSiteContent, dbPkgs: BookingPackage[]): SitePkg[] {
  const out: SitePkg[] = [];
  for (const sp of c.parties.packages) {
    const db = dbPkgs.find(p => p.name.trim().toLowerCase() === sp.name.toLowerCase());
    out.push({
      name: sp.name,
      price: db?.price_cents ? Math.round(db.price_cents / 100) : sp.price,
      blurb: `Extra guests ${sp.perGuest} each`,
      includes: [...c.parties.includes, ...sp.perks],
      duration: db?.duration ?? 120,
      popular: sp.popular,
    });
  }
  for (const db of dbPkgs) {
    if (out.some(p => p.name.toLowerCase() === db.name.trim().toLowerCase())) continue;
    out.push({ name: db.name, price: db.price_cents ? Math.round(db.price_cents / 100) : null, blurb: db.blurb, includes: db.includes ?? [], duration: db.duration });
  }
  return out;
}

export default async function VenueSitePage({ params }: { params: { business: string } }) {
  const c = siteContentFor(params.business);
  if (!c) notFound();
  const business = await getBusinessBySlug(params.business);
  if (!business) notFound();

  const admin = createAdminClient();
  const [resQ, rewQ, waiverQ, user] = await Promise.all([
    bookingEnabled(business)
      ? admin.from("booking_resources")
          .select("id, name, description, emoji, image_url, units, unit_label, durations, max_party, horizon_days, category, packages, sort_order")
          .eq("business_id", business.id).eq("is_active", true)
          .order("sort_order").order("created_at")
      : Promise.resolve({ data: [] as never[] }),
    admin.from("rewards").select("id, name, point_cost, image_url")
      .eq("business_id", business.id).eq("is_active", true).not("image_url", "is", null)
      // Biggest rewards first: the free pizza sells the app better than a token toy.
      .gte("point_cost", 100).order("point_cost", { ascending: false }).limit(16),
    // The business's own Atlas waiver (required at signup → the app's waiver gate).
    admin.from("business_waivers").select("id, valid_days, required_for_signup, kiosk_enabled")
      .eq("business_id", business.id).eq("is_active", true).not("current_version_id", "is", null)
      .order("required_for_signup", { ascending: false }).limit(1).maybeSingle(),
    getCachedUser().catch(() => null),
  ]);

  type Row = Omit<SiteResource, "packages" | "category"> & { category: string | null; packages: BookingPackage[] | null; sort_order: number };
  const resources: SiteResource[] = ((resQ.data ?? []) as Row[]).map(r => ({
    id: r.id, name: r.name, description: r.description, image_url: r.image_url, emoji: r.emoji,
    category: (r.category ?? "").trim() || "Other",
    units: r.units, unit_label: r.unit_label, durations: r.durations, max_party: r.max_party, horizon_days: r.horizon_days,
    packages: (r.packages?.length ?? 0) > 0 ? mergePackages(c, r.packages!) : [],
  }));
  // Group order follows the first resource of each section (sort_order); "Other" last.
  resources.sort((a, b) => (a.category === "Other" ? 1 : 0) - (b.category === "Other" ? 1 : 0));

  // Signed in to the app on this domain → prefill the booking form.
  let member: SiteMember = null;
  if (user) {
    const { data: mem } = await admin.from("business_memberships").select("id").eq("business_id", business.id).eq("user_id", user.id).maybeSingle();
    if (mem) {
      const { data: p } = await admin.from("profiles").select("full_name, phone, email").eq("id", user.id).maybeSingle();
      member = { name: p?.full_name ?? null, phone: p?.phone ?? null, email: (p?.email as string | null) ?? user.email ?? null };
    }
  }

  // Waiver: our own Atlas waiver. With the kiosk on, the button opens the
  // no-account signing page (/<slug>/kiosk, phone mode): no app, no login, the
  // signature lands in the same waiver records the desk already checks.
  // Kiosk off → the in-app waiver. No Atlas waiver at all → the outside link, if any.
  const slugBase = `/${business.slug}`;
  const w = waiverQ.data as { id: string; valid_days: number | null; required_for_signup: boolean; kiosk_enabled: boolean } | null;
  const waiver: SiteWaiver | null = w
    ? w.kiosk_enabled
      ? { href: `${slugBase}/kiosk?from=site`, signInHref: null, validDays: w.valid_days }
      : {
          href: member ? `${slugBase}/app/waiver` : w.required_for_signup ? `${slugBase}/signup` : `${slugBase}/login?next=${encodeURIComponent(`${slugBase}/app/waiver?w=${w.id}`)}`,
          signInHref: member ? null : `${slugBase}/login?next=${encodeURIComponent(`${slugBase}/app/waiver`)}`,
          validDays: w.valid_days,
        }
    : c.waiverUrl ? { href: c.waiverUrl, signInHref: null, validDays: null } : null;

  const phone = (business.contact_info?.phone ?? "").replace(/\D/g, "");
  const address = business.contact_info?.address ?? "";

  return (
    <div className={venueSiteFontClass}>
      <VenueSite
        c={c}
        slug={business.slug}
        name={business.name.trim()}
        logoUrl={business.logo_url ?? null}
        phone={phone}
        address={address}
        resources={resources}
        member={member}
        rewards={((rewQ.data ?? []) as SiteReward[]).filter(r => !/%\s*off/i.test(r.name)).slice(0, 8)}
        visitPoints={business.point_rules?.visit ?? 50}
        storeLinks={{ ios: IOS, android: ANDROID, joinCode: business.join_code ?? c.app.joinCode }}
        waiver={waiver}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "EntertainmentBusiness",
          name: business.name.trim(),
          telephone: phone ? `+1${phone}` : undefined,
          address: address || undefined,
          image: c.about.photo,
          openingHoursSpecification: c.hours.map(h => ({
            "@type": "OpeningHoursSpecification",
            dayOfWeek: h.isoDays.map(d => ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][d - 1]),
            opens: h.open, closes: h.close,
          })),
        }).replace(/</g, "\\u003c") }}
      />
    </div>
  );
}
