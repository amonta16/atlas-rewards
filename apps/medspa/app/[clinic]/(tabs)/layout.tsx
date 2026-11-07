import { getClinic } from "@/lib/clinic";
import { getPatient } from "@/lib/patient";
import { GateProvider } from "@/components/gate";
import { TabBar } from "@/components/chrome";
import { ReferralCapture } from "@/components/referral-capture";

/** The five-tab app (Home · Shop · Scan · Rewards · Profile). Login lives outside it. */
export default async function TabsLayout({ children, params }: { children: React.ReactNode; params: { clinic: string } }) {
  const clinic = (await getClinic(params.clinic))!;
  const patient = await getPatient(clinic);
  const canRedeem = patient.signedIn && clinic.rewards.some((r) => r.point_cost <= patient.points);
  return (
    <div className="relative mx-auto min-h-[100dvh] max-w-md bg-white">
    <GateProvider slug={clinic.slug} signedIn={patient.signedIn}>
      {clinic.preview && (
        <div className="bg-ink px-4 py-1.5 text-center text-[12px] font-semibold tracking-[0.02em] text-white">
          Preview · not live yet
        </div>
      )}
      <main style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}>{children}</main>
      <ReferralCapture slug={clinic.slug} clinicId={clinic.id} signedIn={patient.signedIn} demo={clinic.isExample && clinic.id === "example"} />
      <TabBar slug={clinic.slug} dot={canRedeem ? "rewards" : null} />
    </GateProvider>
    </div>
  );
}
