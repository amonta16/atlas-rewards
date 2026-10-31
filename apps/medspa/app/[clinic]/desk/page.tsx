import { redirect } from "next/navigation";
import Link from "next/link";
import { getClinic, activeTreatments } from "@/lib/clinic";
import { getStaff } from "@/lib/staff";
import { DeskApp } from "@/components/desk/desk-app";
import { getBuilderData } from "@/lib/builder-data";

export const metadata = { title: "Front desk" };
export const dynamic = "force-dynamic";

/**
 * The med spa front desk (Dermis-style). Same staff accounts and the same
 * database functions as the manager portal, so the desk, the patient app and
 * the portal always show the same numbers.
 */
const VIEWS = ["checkin", "due", "orders", "activity", "overview", "rewards", "team", "builder"] as const;

export default async function Desk({ params, searchParams }: { params: { clinic: string }; searchParams: { view?: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const staff = await getStaff(clinic);
  const wanted = VIEWS.find((v) => v === searchParams.view);
  if (staff === "signed-out") redirect(`/${clinic.slug}/desk/login${wanted ? `?view=${wanted}` : ""}`);
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
        id: clinic.id, slug: clinic.slug, name: clinic.name, logoUrl: clinic.logoUrl, phone: clinic.phone,
        pointsPerDollar: clinic.pointsPerDollar, visitPoints: clinic.visitPoints, demo,
        treatments: activeTreatments(clinic).map((t) => ({ id: t.id, name: t.name, recall_weeks: t.recall_weeks ?? null })),
        providers: clinic.cfg.providers.filter((p) => p.is_active).map((p) => ({ id: p.id, name: p.name, treatment_ids: p.treatment_ids ?? [] })),
        rewards: clinic.rewards.map((r) => ({ id: r.id, name: r.name, point_cost: r.point_cost, image_url: r.image_url, description: r.description })),
      }}
      staff={staff}
      builder={builder}
      initialView={wanted}
      portalUrl={demo ? null : `https://www.atlas-engine.app/${clinic.slug}/manage`}
    />
  );
}
