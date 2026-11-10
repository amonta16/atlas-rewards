import { redirect } from "next/navigation";
import Link from "next/link";
import { getClinic, activeTreatments } from "@/lib/clinic";
import { getStaff } from "@/lib/staff";
import { DeskApp } from "@/components/desk/desk-app";
import { getBuilderData } from "@/lib/builder-data";

export const metadata = { title: "Front desk", robots: { index: false, follow: false } };
const SITE = (process.env.VENUE_APP_ORIGIN || "https://www.atlas-engine.app").replace(/\/$/, "");
/** CP-238: self-serve activation, the same switch as the preview page's "Go live" (CP-234). Off = the walkthrough is the only way. */
const CHECKOUT = process.env.PREVIEW_SHOW_CHECKOUT === "1" ? process.env.STRIPE_FOUNDING_CHECKOUT_URL || null : null;
const activateUrl = (slug: string) => (CHECKOUT ? `${CHECKOUT}${CHECKOUT.includes("?") ? "&" : "?"}client_reference_id=${encodeURIComponent(slug)}` : null);
const HELP_EMAIL = "andrew@atlas-engine.app";
export const dynamic = "force-dynamic";

/**
 * The one med spa front desk. Same staff accounts and the same database
 * functions as the venue app, so everything shows the same numbers.
 * ?view=reports&month=YYYY-MM is where the monthly report email lands.
 */
const VIEWS = ["checkin", "patients", "due", "orders", "activity", "overview", "memberships", "payouts", "rewards", "team", "builder", "insights", "reports", "offers", "marketing", "billing"] as const;

export default async function Desk({ params, searchParams }: { params: { clinic: string }; searchParams: { view?: string; month?: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const staff = await getStaff(clinic);
  const wanted = VIEWS.find((v) => v === searchParams.view);
  const month = /^\d{4}-\d{2}$/.test(searchParams.month ?? "") ? searchParams.month! : null;
  if (staff === "signed-out") {
    const back = new URLSearchParams({ ...(wanted ? { view: wanted } : {}), ...(month ? { month } : {}) }).toString();
    redirect(`/${clinic.slug}/desk/login${back ? `?${back}` : ""}`);
  }
  if (staff === "no-access") {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-[#F4F5F7] px-6 text-center">
        <div className="max-w-[380px] rounded-[28px] bg-white p-8 shadow-card">
          <h1 className="text-[22px] font-semibold">No desk access</h1>
          <p className="mt-2 text-[14.5px] text-sub">This account isn&apos;t staff at {clinic.name}. Ask the clinic manager to add you as front desk.</p>
          <Link href="/auth/signout" prefetch={false} className="btn-ghost mt-5">Sign in with another account</Link>
        </div>
      </div>
    );
  }
  const demo = clinic.isExample && clinic.id === "example";
  const builder = staff.isManager ? await getBuilderData(clinic) : null;
  return (
    <DeskApp
      clinic={{
        id: clinic.id, slug: clinic.slug, name: clinic.name, logoUrl: clinic.logoUrl, heroUrl: clinic.heroUrl, primary: clinic.primary, phone: clinic.phone,
        pointsPerDollar: clinic.pointsPerDollar, visitPoints: clinic.visitPoints, offersOn: clinic.offersOn, demo,
        // CP-237: an instant preview's desk says so, and links back to the app and the walkthrough.
        preview: clinic.preview ? { walkthroughUrl: `${SITE}/medspa/walkthrough/${clinic.slug}`, expiresAt: clinic.preview.expiresAt } : null,
        // CP-238: Home → Your access. The demo clinic books through the main /medspa calendar.
        goLive: clinic.preview
          ? { kind: "preview", walkthroughUrl: `${SITE}/medspa/walkthrough/${clinic.slug}`, activateUrl: activateUrl(clinic.slug), expiresAt: clinic.preview.expiresAt, helpEmail: HELP_EMAIL }
          : demo
            ? { kind: "demo", walkthroughUrl: `${SITE}/medspa`, activateUrl: null, expiresAt: null, helpEmail: HELP_EMAIL }
            : { kind: "live", walkthroughUrl: `${SITE}/medspa`, activateUrl: null, expiresAt: null, helpEmail: HELP_EMAIL },
        recall: { enabled: clinic.cfg.recall.enabled, lead_days: clinic.cfg.recall.lead_days, followup_days: clinic.cfg.recall.followup_days },
        treatments: activeTreatments(clinic).map((t) => ({ id: t.id, name: t.name, recall_weeks: t.recall_weeks ?? null })),
        providers: clinic.cfg.providers.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.name, treatment_ids: p.treatment_ids ?? [] })),
        rewards: clinic.rewards.map((r) => ({ id: r.id, name: r.name, point_cost: r.point_cost, image_url: r.image_url, description: r.description })),
      }}
      staff={staff}
      builder={builder}
      initialView={wanted}
      initialMonth={month}
    />
  );
}
